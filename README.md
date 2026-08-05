# Signal Web

基于 Next.js 的策略信号展示页。目前内置六个 MQL5 信号：`2265877`（Gold Reaper New V2 2）、`2339082`（GoldWave signal）、`2379208`（World PEACE Multi FX Algo）、`2304847`（MSC SuperGold Pro）、`2329290`（Precise Pair Trading Pro）和 `2351091`（Gold Breakout PRO All Star）。

## 功能

- 首页以策略卡片展示累计收益和资金曲线；已导入完整交易流水的新增策略会按日聚合已平仓盈亏与余额变动，重建非线性的历史曲线。
- 策略详情页按顺序展示可选曲线、月度收益、统计与交易历史。
- 页面只读取最近一次成功同步的本地快照；上游不可访问或结构变化时自动保留上一次可靠数据。

## 本地运行

安装依赖后执行 `npm run dev`，再访问本地开发地址。

## 云服务器部署与 8 小时同步

项目提供 [Dockerfile](Dockerfile) 与 [docker-compose.yml](docker-compose.yml)。在服务器复制 `.env.example` 为 `.env`，填入高强度 `CRON_SECRET` 后执行 `docker compose up -d --build`。运行时数据写入 Docker 持久卷，不会因容器重建丢失。

使用服务器的 `cron` 每 8 小时调用一次受保护的同步接口：

```cron
0 */8 * * * curl --fail --silent --show-error -X POST -H "Authorization: Bearer <CRON_SECRET>" https://<你的域名>/api/cron/sync-signals >> /var/log/signal-web-sync.log 2>&1
```

同步任务先更新公开页指标；若配置了仅服务器可见的 `MQL5_SESSION_COOKIE`，还会下载最新的完整交易 CSV 并重建曲线。接口不会向浏览器暴露 Cookie 或密钥。若任一策略同步失败，仍保留其上一次成功的数据，并在接口响应中返回失败原因。

## 数据说明

本地快照根据 2026 年 8 月采集的公开页面数据整理，仅用于页面可用性演示。六个信号均已通过已授权的 MQL5 会话导入逐笔交易历史至项目本地 CSV；详情页按每页 20 笔展示。账户金额会根据策略的 USD、EUR 或 JPY 账户币种进行本地化显示。需重新同步时，请在已登录且获授权的 MQL5 会话中重新导出 CSV，切勿在仓库保存账号、密码或 Cookie。数据不应作为投资或交易决策依据。
