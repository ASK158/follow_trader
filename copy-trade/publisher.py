#!/usr/bin/env python3
"""Publish complete MT5-A hedging-position snapshots for the local follower EA.

The process only reads the locally logged-in MT5-A terminal.  It publishes a
complete, atomically replaced JSON snapshot into MT5's shared Files folder;
it never sends trading instructions to MT5-B.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import tempfile
import time
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
    / "MT5CopyTrade"
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

    config = PublisherConfig(**{key: raw[key] for key in required})
    if config.expected_source_account <= 0:
        raise RuntimeError("expected_source_account 必须为正整数")
    if config.poll_interval_ms < 250:
        raise RuntimeError("poll_interval_ms 不得小于 250")
    if config.snapshot_ttl_seconds < 2:
        raise RuntimeError("snapshot_ttl_seconds 不得小于 2")
    if config.poll_interval_ms >= config.snapshot_ttl_seconds * 1000:
        raise RuntimeError("轮询间隔必须小于快照有效期")
    if not config.source_symbols or not all(isinstance(item, str) and item for item in config.source_symbols):
        raise RuntimeError("source_symbols 必须指定至少一个源端品种，以避免意外复制")
    if not all(isinstance(item, int) for item in config.source_magic_numbers):
        raise RuntimeError("source_magic_numbers 必须是整数数组；空数组代表复制指定品种的全部订单")
    return config


def setup_logging(log_path: Path) -> logging.Logger:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("mt5-copy-publisher")
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


def build_positions(config: PublisherConfig) -> list[dict[str, Any]]:
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
        result.append(
            {
                "source_id": source_id,
                "ticket": str(position.ticket),
                "symbol": position.symbol,
                "side": side,
                "volume": float(position.volume),
                "sl": float(position.sl),
                "tp": float(position.tp),
                "price_open": float(position.price_open),
                "opened_at_unix_ms": int(position.time_msc),
                "source_magic": int(position.magic),
            }
        )
    return sorted(result, key=lambda item: item["source_id"])


def publish_once(config: PublisherConfig, sequence: int) -> tuple[int, int]:
    account = mt5.account_info()
    if account is None or account.login != config.expected_source_account:
        mt5.shutdown()
        initialise_mt5(config)
        account = mt5.account_info()
        if account is None:
            raise RuntimeError("重连后仍无法读取 MT5-A 账户")

    now_ms = time.time_ns() // 1_000_000
    positions = build_positions(config)
    snapshot = {
        "schema": "mt5-copy-snapshot/v1",
        "snapshot_complete": True,
        "sequence": sequence,
        "source_account": int(account.login),
        "generated_at_unix_ms": now_ms,
        "expires_at_unix_ms": now_ms + config.snapshot_ttl_seconds * 1000,
        "published_at_utc": datetime.now(UTC).isoformat(timespec="milliseconds"),
        "position_count": 0,
        "positions": positions,
    }
    snapshot["position_count"] = len(snapshot["positions"])
    atomic_write_json(config.signal_path, snapshot)
    save_sequence(config.state_path, sequence)
    return sequence + 1, len(positions)


def main() -> int:
    parser = argparse.ArgumentParser(description="发布 MT5-A 全量持仓快照")
    parser.add_argument("--config", default="publisher.config.json", help="JSON 配置文件路径")
    args = parser.parse_args()

    config = load_config(Path(args.config).resolve())
    logger = setup_logging(config.log_path)
    logger.info("启动发布器：%s", json.dumps(asdict(config), ensure_ascii=False))
    logger.info("快照输出路径：%s", config.signal_path)
    sequence = load_next_sequence(config.state_path)

    try:
        initialise_mt5(config)
        logger.info("已连接 MT5-A 账户 %s", config.expected_source_account)
        while True:
            started = time.monotonic()
            try:
                sequence, position_count = publish_once(config, sequence)
                logger.info("已发布 sequence=%s，持仓数=%s", sequence - 1, position_count)
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
