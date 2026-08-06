# Signal Web

基于 Next.js 的策略信号展示页。目前内置六个 MQL5 信号：`2265877`（Gold Reaper New V2 2）、`2339082`（GoldWave signal）、`2379208`（World PEACE Multi FX Algo）、`2304847`（MSC SuperGold Pro）、`2329290`（Precise Pair Trading Pro）和 `2351091`（Gold Breakout PRO All Star）。

## 功能

- 首页以策略卡片展示累计收益和资金曲线；已导入完整交易流水的新增策略会按日聚合已平仓盈亏与余额变动，重建非线性的历史曲线。
- 策略详情页按顺序展示可选曲线、月度收益、统计与交易历史。
- 页面只读取最近一次成功同步的本地快照；上游不可访问或结构变化时自动保留上一次可靠数据。

## 本地运行

安装依赖后执行 `npm run dev`，再访问本地开发地址。

## 本地 MT5 跟单（独立模块）

项目还提供同一台 Windows 主机上的 MT5 持仓快照跟单模块，位于 [copy-trade](copy-trade)。Python 从 MT5-A 轮询**当前完整持仓**并原子写入共享文件，MT5-B 中的 `ea_file_copier.mq5` 只读取该本地文件，以独立 magic 隔离并同步受管仓位。它与本 Web 展示应用互不依赖；请严格按照 [copy-trade/README.md](copy-trade/README.md) 在 Hedging 模拟账户完成验证后使用。

## 云服务器部署与每日 8:00 同步

生产环境使用 [docker-compose.production.yml](docker-compose.production.yml) 和 [Caddyfile](Caddyfile)：Caddy 自动管理 HTTPS，应用端口仅在服务器本机监听，运行时数据保存于 Docker 持久卷。GitHub Actions 会自动构建并发布运行镜像，使低内存服务器只需拉取和运行；阿里云 ECS 的安全组、域名/备案、Docker 安装、MQL5 Cookie 配置、首次同步、每日 08:00 cron、备份与更新流程请参见完整的 [deploy/README.md](deploy/README.md)。

同步任务先更新公开页指标；若配置了仅服务器可见的 `MQL5_SESSION_COOKIE`，还会下载最新的完整交易 CSV 并重建曲线。接口不会向浏览器暴露 Cookie 或密钥。若任一策略同步失败，仍保留其上一次成功的数据。

## 数据说明

本地快照根据 2026 年 8 月采集的公开页面数据整理，仅用于页面可用性演示。六个信号均已通过已授权的 MQL5 会话导入逐笔交易历史至项目本地 CSV；详情页按每页 20 笔展示。账户金额会根据策略的 USD、EUR 或 JPY 账户币种进行本地化显示。需重新同步时，请在已登录且获授权的 MQL5 会话中重新导出 CSV，切勿在仓库保存账号、密码或 Cookie。数据不应作为投资或交易决策依据。
