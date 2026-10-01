#!/usr/bin/env python3
"""Publish complete MT5-A hedging-position snapshots for the local SigmaC executor EA.

The process only reads the locally logged-in MT5-A terminal.  It publishes a
complete, atomically replaced JSON snapshot into MT5's shared Files folder;
it never sends trading instructions to MT5-B.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import queue
import sys
import tempfile
import threading
import time
import urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

import MetaTrader5 as mt5

DEFAULT_COMMON_FILES = (
    Path(os.environ.get("APPDATA", ""))
    / "MetaQuotes"
    / "Terminal"
    / "Common"
    / "Files"
    / "SigmaC"
)


@dataclass(frozen=True)
class PublisherConfig:
    mt5_terminal_path: str
    expected_source_account: int
    signal_directory: str
    signal_file_name: str
    state_file_name: str
    log_file_name: str
    poll_interval_ms: int
    snapshot_ttl_seconds: int
    source_symbols: list[str]
    source_magic_numbers: list[int]
    signal_title: str
    relay_url: str
    relay_token: str
    relay_heartbeat_seconds: int
    relay_timeout_seconds: int

    @property
    def output_directory(self) -> Path:
        return Path(self.signal_directory).expanduser() if self.signal_directory else DEFAULT_COMMON_FILES

    @property
    def signal_path(self) -> Path:
        return self.output_directory / self.signal_file_name

    @property
    def state_path(self) -> Path:
        return self.output_directory / self.state_file_name

    @property
    def log_path(self) -> Path:
        return self.output_directory / self.log_file_name


def load_config(config_path: Path) -> PublisherConfig:
    try:
        raw: dict[str, Any] = json.loads(config_path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise RuntimeError(f"找不到配置文件：{config_path}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError(f"配置文件不是有效 JSON：{error}") from error

    required = {
        "mt5_terminal_path",
        "expected_source_account",
        "signal_directory",
        "signal_file_name",
        "state_file_name",
        "log_file_name",
        "poll_interval_ms",
        "snapshot_ttl_seconds",
        "source_symbols",
        "source_magic_numbers",
    }
    missing = sorted(required.difference(raw))
    if missing:
        raise RuntimeError(f"配置缺少字段：{', '.join(missing)}")

    optional_defaults = {
        "signal_title": "",
        "relay_url": "",
        "relay_token": "",
        "relay_heartbeat_seconds": 5,
        "relay_timeout_seconds": 3,
    }
    values = {key: raw[key] for key in required}
    values.update({key: raw.get(key, default) for key, default in optional_defaults.items()})
    config = PublisherConfig(**values)
    if config.expected_source_account <= 0:
        raise RuntimeError("expected_source_account 必须为正整数")
    if config.poll_interval_ms < 250:
        raise RuntimeError("poll_interval_ms 不得小于 250")
    if config.snapshot_ttl_seconds < 2:
        raise RuntimeError("snapshot_ttl_seconds 不得小于 2")
    if config.poll_interval_ms >= config.snapshot_ttl_seconds * 1000:
        raise RuntimeError("轮询间隔必须小于快照有效期")
    if not config.source_symbols or not all(isinstance(item, str) and item for item in config.source_symbols):
        raise RuntimeError("source_symbols 必须指定至少一个源端品种，以避免意外同步")
    if not all(isinstance(item, int) for item in config.source_magic_numbers):
        raise RuntimeError("source_magic_numbers 必须是整数数组；空数组代表同步指定品种的全部订单")
    if config.signal_title and len(config.signal_title) > 80:
        raise RuntimeError("signal_title 不能超过 80 个字符")
    if config.relay_url:
        if not config.relay_url.startswith(("http://", "https://")):
            raise RuntimeError("relay_url 必须以 http:// 或 https:// 开头")
        if not config.relay_token:
            raise RuntimeError("启用上报时必须配置 relay_token")
        if not 1 <= config.relay_heartbeat_seconds <= 300:
            raise RuntimeError("relay_heartbeat_seconds 取值范围为 1 至 300 秒")
        if not 1 <= config.relay_timeout_seconds <= 30:
            raise RuntimeError("relay_timeout_seconds 取值范围为 1 至 30 秒")
        if config.relay_heartbeat_seconds >= config.snapshot_ttl_seconds:
            raise RuntimeError("relay_heartbeat_seconds 必须小于 snapshot_ttl_seconds")
    return config


def setup_logging(log_path: Path) -> logging.Logger:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("sigmac-publisher")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    file_handler = RotatingFileHandler(log_path, encoding="utf-8", maxBytes=2_000_000, backupCount=5)
    file_handler.setFormatter(formatter)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    return logger


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    """Write a complete replacement so the EA can never observe partial JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        for attempt in range(3):
            try:
                os.replace(temporary_name, path)
                return
            except PermissionError:
                if attempt == 2:
                    raise
                time.sleep(0.05 * (attempt + 1))
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


def load_next_sequence(state_path: Path) -> int:
    previous = 0
    try:
        previous = int(json.loads(state_path.read_text(encoding="utf-8")).get("sequence", 0))
    except (FileNotFoundError, ValueError, json.JSONDecodeError):
        pass
    # The persisted counter prevents a restarted publisher from replaying older snapshots.
    return max(previous + 1, time.time_ns() // 1_000_000)


def save_sequence(state_path: Path, sequence: int) -> None:
    atomic_write_json(state_path, {"sequence": sequence})


def initialise_mt5(config: PublisherConfig) -> None:
    if not mt5.initialize(path=config.mt5_terminal_path):
        raise RuntimeError(f"无法初始化 MT5：{mt5.last_error()}")
    account = mt5.account_info()
    if account is None:
        raise RuntimeError(f"无法读取 MT5-A 账户：{mt5.last_error()}")
    if account.login != config.expected_source_account:
        raise RuntimeError(
            f"安全检查失败：已连接账户 {account.login}，期望 MT5-A 账户 {config.expected_source_account}"
        )


_last_offset_logged_ms: int | None = None


def resolve_server_utc_offset_ms(config: PublisherConfig) -> int | None:
    """用最新报价时间估算源经纪商服务器时钟与 UTC 的偏移（整小时取整）。
    无法可靠判断时返回 None，此时不上报 UTC 字段。"""
    now = time.time()
    for symbol in config.source_symbols:
        tick = mt5.symbol_info_tick(symbol)
        if tick is None or tick.time <= 0:
            continue
        raw = tick.time - now
        rounded = round(raw / 3600.0) * 3600
        if abs(rounded) <= 13 * 3600 and abs(raw - rounded) <= 300:
            return int(rounded) * 1000
    return None


def build_positions(config: PublisherConfig, server_utc_offset_ms: int | None) -> list[dict[str, Any]]:
    positions = mt5.positions_get()
    if positions is None:
        raise RuntimeError(f"无法读取 MT5-A 持仓：{mt5.last_error()}")

    allowed_symbols = set(config.source_symbols)
    allowed_magics = set(config.source_magic_numbers)
    result: list[dict[str, Any]] = []
    for position in positions:
        if position.symbol not in allowed_symbols:
            continue
        if allowed_magics and position.magic not in allowed_magics:
            continue
        if position.type == mt5.POSITION_TYPE_BUY:
            side = "BUY"
        elif position.type == mt5.POSITION_TYPE_SELL:
            side = "SELL"
        else:
            continue

        # identifier survives several server-side changes more reliably than ticket.
        source_id = str(position.identifier or position.ticket)
        opened_at_ms = int(position.time_msc)
        entry: dict[str, Any] = {
            "source_id": source_id,
            "ticket": str(position.ticket),
            "symbol": position.symbol,
            "side": side,
            "volume": float(position.volume),
            "sl": float(position.sl),
            "tp": float(position.tp),
            "price_open": float(position.price_open),
            "opened_at_unix_ms": opened_at_ms,
            "source_magic": int(position.magic),
        }
        # time_msc 是经纪商服务器时钟；换算成真实 UTC 供跨时区延迟计算。
        if server_utc_offset_ms is not None:
            entry["opened_at_utc_ms"] = opened_at_ms - server_utc_offset_ms
        result.append(entry)
    return sorted(result, key=lambda item: item["source_id"])


def build_account_metrics(account: Any) -> dict[str, Any] | None:
    """账户级指标仅供网站展示；读取失败不影响快照本身。"""
    try:
        return {
            "login": int(account.login),
            "server": str(account.server),
            "currency": str(account.currency),
            "leverage": int(account.leverage),
            "balance": float(account.balance),
            "equity": float(account.equity),
            "margin": float(account.margin),
            "margin_free": float(account.margin_free),
            "floating_profit": float(account.profit),
        }
    except Exception:
        return None


def publish_once(config: PublisherConfig, sequence: int, logger: logging.Logger) -> tuple[int, int, dict[str, Any]]:
    account = mt5.account_info()
    if account is None or account.login != config.expected_source_account:
        mt5.shutdown()
        initialise_mt5(config)
        account = mt5.account_info()
        if account is None:
            raise RuntimeError("重连后仍无法读取 MT5-A 账户")

    now_ms = time.time_ns() // 1_000_000
    server_utc_offset_ms = resolve_server_utc_offset_ms(config)
    global _last_offset_logged_ms
    if server_utc_offset_ms != _last_offset_logged_ms:
        if server_utc_offset_ms is None:
            logger.warning("无法从报价时间判断源服务器时区偏移；快照将不带 UTC 开仓时间")
        else:
            logger.info("源服务器时区偏移：UTC%+d 小时（开仓时间将换算为 UTC 上报）", server_utc_offset_ms // 3600000)
        _last_offset_logged_ms = server_utc_offset_ms
    positions = build_positions(config, server_utc_offset_ms)
    snapshot = {
        "schema": "sigmac-snapshot/v1",
        "snapshot_complete": True,
        "sequence": sequence,
        "source_account": int(account.login),
        "generated_at_unix_ms": now_ms,
        "expires_at_unix_ms": now_ms + config.snapshot_ttl_seconds * 1000,
        "published_at_utc": datetime.now(UTC).isoformat(timespec="milliseconds"),
        "position_count": 0,
        "positions": positions,
        "account": build_account_metrics(account),
    }
    if config.signal_title:
        snapshot["title"] = config.signal_title
    snapshot["position_count"] = len(snapshot["positions"])
    atomic_write_json(config.signal_path, snapshot)
    save_sequence(config.state_path, sequence)
    return sequence + 1, len(positions), snapshot


# 指纹只覆盖业务内容；序号与时间戳等易变字段不参与变更检测。
RELAY_FINGERPRINT_KEYS = ("source_account", "position_count", "positions", "account", "title")


def snapshot_fingerprint(snapshot: dict[str, Any]) -> str:
    stable = {key: snapshot.get(key) for key in RELAY_FINGERPRINT_KEYS}
    encoded = json.dumps(stable, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def relay_publish(config: PublisherConfig, logger: logging.Logger, snapshot: dict[str, Any], state: dict[str, Any]) -> bool:
    """把快照上报到网站接收端；内容无变化时按心跳间隔重发，失败不影响本地文件。"""
    if not config.relay_url:
        return False
    fingerprint = snapshot_fingerprint(snapshot)
    now = time.monotonic()
    heartbeat_due = state.get("last_sent") is None or (now - state["last_sent"]) >= config.relay_heartbeat_seconds
    if fingerprint == state.get("fingerprint") and not heartbeat_due:
        return True

    payload = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        config.relay_url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {config.relay_token}",
            "Content-Type": "application/json",
            "User-Agent": "sigmac-publisher/1.1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=config.relay_timeout_seconds) as response:
            response.read()
            status = response.status
        if not 200 <= status < 300:
            raise RuntimeError(f"接收端返回 HTTP {status}")
    except Exception as error:
        state["failure_count"] = state.get("failure_count", 0) + 1
        should_log = not state.get("failing") or (now - state.get("last_failure_log", 0.0)) >= 60.0
        if should_log:
            logger.warning("上报失败（连续 %d 次）：%s；本地快照不受影响", state["failure_count"], error)
            state["last_failure_log"] = now
        state["failing"] = True
        return False

    recovered = bool(state.get("failing"))
    state["failing"] = False
    state["failure_count"] = 0
    state["fingerprint"] = fingerprint
    state["last_sent"] = time.monotonic()
    if recovered or not state.get("ever_succeeded"):
        logger.info("已上报快照至 %s（sequence=%s）", config.relay_url, snapshot.get("sequence"))
        state["ever_succeeded"] = True
    return True


def relay_worker(config: PublisherConfig, logger: logging.Logger, inbox: "queue.Queue[dict[str, Any]]", state: dict[str, Any]) -> None:
    """后台发送线程：队列里永远只保留最新一份快照，慢请求不影响主循环节奏。"""
    while True:
        snapshot = inbox.get()
        relay_publish(config, logger, snapshot, state)


def start_relay_thread(config: PublisherConfig, logger: logging.Logger) -> tuple["queue.Queue[dict[str, Any]]", dict[str, Any]]:
    inbox: "queue.Queue[dict[str, Any]]" = queue.Queue(maxsize=1)
    state: dict[str, Any] = {}
    threading.Thread(target=relay_worker, args=(config, logger, inbox, state), daemon=True, name="sigmac-relay").start()
    return inbox, state


def enqueue_relay_snapshot(inbox: "queue.Queue[dict[str, Any]]", snapshot: dict[str, Any]) -> None:
    """用最新快照替换队列中未发送的旧快照；只关心最新状态，丢弃即正确。"""
    try:
        inbox.get_nowait()
    except queue.Empty:
        pass
    inbox.put(snapshot)


def main() -> int:
    parser = argparse.ArgumentParser(description="发布 MT5-A 全量持仓快照")
    parser.add_argument("--config", default="publisher.config.json", help="JSON 配置文件路径")
    args = parser.parse_args()

    config = load_config(Path(args.config).resolve())
    logger = setup_logging(config.log_path)
    # relay_token 属于长期凭证，绝不写入日志。
    safe_config = asdict(config)
    if config.relay_token:
        safe_config["relay_token"] = "***"
    logger.info("启动发布器：%s", json.dumps(safe_config, ensure_ascii=False))
    logger.info("快照输出路径：%s", config.signal_path)
    if config.relay_url:
        logger.info("上报已启用：%s（心跳 %s 秒，异步发送线程）", config.relay_url, config.relay_heartbeat_seconds)
    sequence = load_next_sequence(config.state_path)

    try:
        initialise_mt5(config)
        logger.info("已连接 MT5-A 账户 %s", config.expected_source_account)
        relay_inbox = None
        if config.relay_url:
            relay_inbox, _relay_state = start_relay_thread(config, logger)
        while True:
            started = time.monotonic()
            try:
                sequence, position_count, snapshot = publish_once(config, sequence, logger)
                logger.info("已发布 sequence=%s，持仓数=%s", sequence - 1, position_count)
                if relay_inbox is not None:
                    enqueue_relay_snapshot(relay_inbox, snapshot)
            except Exception:
                logger.exception("发布失败；不会改写上一份有效快照")
            remaining = config.poll_interval_ms / 1000 - (time.monotonic() - started)
            if remaining > 0:
                time.sleep(remaining)
    except KeyboardInterrupt:
        logger.info("收到停止指令")
        return 0
    except Exception as error:
        logger.exception("发布器无法启动：%s", error)
        return 1
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    sys.exit(main())
