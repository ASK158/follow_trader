# 本地 MT5 逐单文件跟单

此目录提供一个**同一台 Windows 主机**上的 MT5 跟单实现：

```text
已登录 MT5-A 终端 → publisher.py → Common\Files\MT5CopyTrade\mt5-copy-snapshot.json → ea_file_copier.mq5 → MT5-B 终端
```

Python 只读取 MT5-A 的**当前全量持仓快照**，不读取成交历史，也不连接 MT5-B。EA 只读取共享磁盘文件，依据有效的完整快照让其受管仓位收敛到源端状态。

> 仅适用于 Hedging 账户之间的逐单复制。务必先在模拟账户测试；这不是投资建议，也不能保证两端成交价、滑点、佣金、掉期或保证金结果一致。

## 已实现的行为

- 以源端 `POSITION_IDENTIFIER`（回退至 ticket）为逐单标识；每笔目标单写入 `MT5CPY:<source_id>` 注释。
- 支持开仓、全平、加仓、减仓（部分平仓）、SL/TP 修改。
- EA 仅管理同时匹配 `InpMagicNumber` 与 `MT5CPY:` 注释前缀的持仓，不处理目标账户的人工单或其他 EA 单。
- 源端仅发布配置的品种；`source_magic_numbers: []` 表示这些品种的所有订单均可复制。
- EA 必须配置每个允许复制品种的源→目标映射；未映射的品种不会被开仓。
- 手数按 `InpLotMultiplier` 换算，并按目标品种步进向下规范化；任一单笔或快照总手数越限时，整份快照不执行，不会静默截断仓位。
- 每次写入都使用临时文件加原子替换；写入失败时保留上一份快照。
- 文件无效、源账户不符、序号回退、超时或发布器故障时，EA **保持现有受管仓位，不开仓也不平仓**。
- 对不可交易、保证金不足、报价变化或交易服务器拒绝等交易失败，EA 会按 `InpMaxRetries` 和 `InpRetryDelayMs` 重试，之后将原因写入 MT5 Journal，并在下一次轮询继续尝试。

## 1. 安装并配置 Python 发布器（MT5-A）

1. 在安装有 MT5-A 终端的 Windows 用户环境中安装 Python 依赖：

   ```powershell
   py -m pip install -r requirements.txt
   ```

2. 复制 [publisher.config.example.json](publisher.config.example.json) 为 `publisher.config.json`。该真实配置已被忽略，不会提交。
3. 填入 MT5-A 的 `terminal64.exe` 绝对路径和正确的 `expected_source_account`。脚本会拒绝连接到不匹配的登录账号。
4. 在 `source_symbols` 中明确列出允许复制的源端品种。由于当前需求是“指定品种、复制所有单子”，保持 `source_magic_numbers` 为空数组。
5. 保持 `signal_directory` 为空，默认输出到：

   ```text
   %APPDATA%\MetaQuotes\Terminal\Common\Files\MT5CopyTrade
   ```

   这正是 MQL5 使用 `FILE_COMMON` 时的共享目录；同一 Windows 用户下的 MT5-A 与 MT5-B 都能访问它。
6. 确认 MT5-A 已启动、已登录、允许 Python API 初始化，然后启动发布器：

   ```powershell
   py publisher.py --config publisher.config.json
   ```

发布器日志、最新快照和递增序号状态文件都位于该共享目录。请不要删除 `mt5-copy-publisher-state.json`；它用于确保发布器重启后序号仍然递增。

## 2. 编译并配置 EA（MT5-B）

1. 将 [ea_file_copier.mq5](ea_file_copier.mq5) 复制到 MT5-B 的 `MQL5\Experts`，使用 MetaEditor 编译。
2. 将 EA 附加到 MT5-B 任意图表，并启用“算法交易”。EA 不依赖图表品种。
3. 首次必须保持 `InpTradingMode = 0`（仅观察）。在 Journal 确认读取到有效快照，且“将开/将平/将减仓”的记录完全符合预期。
4. 设置以下输入参数：

   | 参数 | 必填/推荐值 | 说明 |
   | --- | --- | --- |
   | `InpSignalFile` | `MT5CopyTrade\mt5-copy-snapshot.json` | 与 Python 的共享文件名一致。 |
   | `InpExpectedSourceAccount` | MT5-A 登录账号 | 安全白名单，必须匹配发布快照。 |
   | `InpSymbolMappings` | 当前配置可用 `XAUUSD.n=XAUUSD;EURUSD=EURUSD` | 每个允许复制品种都应明确映射，分号分隔。 |
   | `InpMagicNumber` | 独立正整数 | 只管理该 magic 和 `MT5CPY:` 注释的仓位。 |
   | `InpLotMultiplier` | 例如 `0.10` 或 `1.00` | 目标手数倍率。 |
   | `InpMaxSingleLot` | 风险上限 | 单个源持仓在 B 的最大手数。 |
   | `InpMaxTotalLots` | 风险上限 | 一份有效快照在 B 的受管目标总手数上限。 |
   | `InpSnapshotTimeoutSec` | `10` | 必须不小于 Python 轮询间隔；超时即冻结同步。 |
   | `InpCopyStops` | `true` | 同步源端 SL/TP。 |
   | `InpTradingMode` | 先 `0`，验证后改为 `1` | `0` 仅观察、`1` 全量跟单、`2` 仅平掉已消失的受管仓位。 |

5. 模拟盘验证无误后，才将 `InpTradingMode` 改为 `1`。更改后 EA 会在下一份有效快照时开始同步。

如果 Journal 显示“快照无效”，请使用最新版本 EA；日志会给出准确原因。检查 Python 发布器仍在运行、共享文件的更新时间持续变化、`InpExpectedSourceAccount` 等于 MT5-A 登录账号，且 `InpSnapshotTimeoutSec` 为 `10` 或更大。若快照有效且源端当前有仓位，观察模式会显示“将开 BUY/SELL …”。

## SL/TP 与跨经纪商品种

品种后缀不同可由映射解决，但合约规格、报价精度、最小止损距离和交易时段仍可能不同。默认 `InpRejectInvalidStops = true`：如果源 SL/TP 不符合 B 的当前止损规则，EA 拒绝开仓或跳过修改，并记录 Journal；不会为了绕过风控静默删除止损。修正映射、交易时段或源端止损后，下一份快照会自动重试。

不同经纪商的品种若并非同一合约（例如不同点值、不同黄金合约），不得仅靠后缀映射复制；应先验证合约规格与最小手数。

## 快照安全协议

`mt5-copy-snapshot.json` 包含 `schema`、`snapshot_complete`、单调 `sequence`、源账号、生成/过期时间和**完整** `positions` 数组。EA 在同机部署时以共享文件的最后修改时间判断是否超过 `InpSnapshotTimeoutSec`，避免 Python 与终端的时间戳比较差异造成误判。有效的空数组代表“源端确实空仓”，此时 EA 才会平掉所有受管仓位。读取失败、格式错误、文件未更新或发布器停止都不代表空仓，EA 因而只冻结。

两端主机时钟必须自动同步。因为当前部署在同一台 Windows 主机，建议保持系统时间同步服务开启。

## 模拟盘验收清单

在切换到实盘前，逐项检查 Journal 和 B 账户持仓：

1. A 开多和开空；同一品种同时存在多笔独立仓位。
2. A 加仓、部分平仓、全平。
3. A 修改 SL 和 TP。
4. A 空仓时发布有效空快照，确认仅 magic/注释匹配的 B 仓位被平掉。
5. 在 B 放置人工单或其他 EA 单，确认其完全不受影响。
6. 关闭 Python 超过 10 秒，确认 B 保持原仓位且 Journal 报快照无效或超时。
7. 重启 Python 与 EA，确认序号和映射恢复正常。
8. 临时设置不可交易映射、低 `InpMaxTotalLots` 或无可用保证金，确认无越限订单、重试后有 Journal 告警。
9. 检查目标品种的最小手数、步进、止损等级、交易时段及 Hedging 账户模式。

## 运行边界

- 不复制挂单、余额操作、入金出金、历史成交、盈亏或源端 EA 逻辑；仅复制当前市价持仓状态与 SL/TP。
- 源端与目标端都必须是 Hedging 账户。Netting 账户无法逐单映射同一品种的多笔独立仓位。
- 若 B 手工关闭受管仓位，而 A 仍持有，正常跟单模式会在下一轮重新补齐；如需人工干预，请先切换为 `InpTradingMode = 0`。
- 首次使用请保持观察模式，并在模拟账户连续运行和故障演练后再灰度上线。
