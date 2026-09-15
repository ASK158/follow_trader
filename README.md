# Signal Web

基于 Next.js 的策略信号展示与 MT5 AI 策略开发站。目前内置六个 MQL5 信号：`2265877`（Gold Reaper New V2 2）、`2339082`（GoldWave signal）、`2379208`（World PEACE Multi FX Algo）、`2304847`（MSC SuperGold Pro）、`2329290`（Precise Pair Trading Pro）和 `2351091`（Gold Breakout PRO All Star）。

## 功能

- 首页以策略卡片展示累计收益和资金曲线；已导入完整交易流水的新增策略会按日聚合已平仓盈亏与余额变动，重建非线性的历史曲线。
- 策略详情页按顺序展示可选曲线、月度收益、统计与交易历史。
- 页面只读取最近一次成功同步的本地快照；上游不可访问或结构变化时自动保留上一次可靠数据。
- `/agent` 提供多轮自然语言对话，将策略需求转换为结构化 `StrategySpec`、流式 MQL5 源码和 React Flow 逻辑图。
- Agent 工作台内置 Monaco 编辑器、基础风险检测、账户云端草稿（浏览器离线回退）和 `.mq5` 下载。
- `/marketplace` 为 EA / 指标商城：商品统一使用 Gas 积分定价，登录用户可收藏、购买、评论和提交作品，管理员审核通过后自动上架；已购评论带有标识。商城不包含内置演示策略。
- 统一账户仅分为用户和管理员：用户可使用 Gas 消费及上架作品，管理员可管理用户、分配积分、查看消费流水、审核作品、管理评论并查看审计记录。
- 账户支持邮箱验证、密码找回/修改、TOTP 二次验证和登录设备撤销；会话令牌只以 SHA-256 摘要落库。
- 登录、注册、密码恢复、评论和订单使用持久化限流，写操作执行同源请求校验。

## 本地运行

安装依赖后，将 [.env.example](.env.example) 复制为 `.env.local`，至少填写官方 `AI_API_KEY`。默认使用 DeepSeek Chat Completions 流式接口；运营方可在服务端通过 `AI_CHAT_COMPLETIONS_URL` 和 `AI_MODEL` 切换兼容服务。执行 `npm run dev` 后访问本地开发地址，Agent 工作台位于 `/agent`。

Agent 的 API 密钥只允许保存在服务端，不得增加 `NEXT_PUBLIC_` 前缀。管理员可在 `/admin/finance` 在线验证并配置兼容 OpenAI Chat Completions 的 API 地址、模型和密钥；密钥使用 `AUTH_ENCRYPTION_KEY` 经 AES-256-GCM 加密后存入服务器数据库，且不会回显到浏览器。未设置后台配置时，服务端环境变量 `AI_API_KEY`、`AI_CHAT_COMPLETIONS_URL` 和 `AI_MODEL` 作为回退。所有用户统一使用运营方配置的模型服务。Agent 需要登录使用，普通用户每日 30 次调用，管理员每日 200 次；草稿同步至账户并在浏览器保留离线副本。运行于 Windows 且本机安装 MetaTrader 5 时，Agent 每次生成完整 EA 后会自动调用 MetaEditor 进行编译并展示日志。编译失败时，系统最多将错误日志和当前完整源码交给 AI 自动修复 2 次；每个版本与编译日志均在“编译验证”中可查看。默认编译器路径是 `C:\Program Files\MetaTrader 5\MetaEditor64.exe`，可通过 `MQL5_METAEDITOR_PATH` 覆盖。编译通过不等于回测或实盘安全验证。

生产环境必须设置 `AUTH_ENCRYPTION_KEY`（64 个十六进制字符），并建议分别设置 `AUTH_AUDIT_PEPPER` 与 `AUTH_RATE_LIMIT_PEPPER`。注册后系统发送 24 小时有效、仅可使用一次的邮箱验证链接；未验证账户不能登录。账户验证与密码重置邮件可直接通过 SMTP 发送，需设置 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS` 和 `SMTP_FROM`。也可改用 `EMAIL_WEBHOOK_URL` 邮件网关，网关接收 `{ to, template, actionUrl }` JSON，并可使用 `EMAIL_WEBHOOK_TOKEN` Bearer 鉴权。两种方式同时配置时优先使用 Webhook。未配置邮件服务时消息保留在 SQLite outbox，开发环境会在注册结果和服务日志中显示操作链接。

常用验证命令：`npm run lint`、`npm test`、`npm run build` 和 `npm audit`。

## 本地 MT5 跟单（独立模块）

项目还提供同一台 Windows 主机上的 MT5 持仓快照跟单模块，位于 [copy-trade](copy-trade)。Python 从 MT5-A 轮询**当前完整持仓**并原子写入共享文件，MT5-B 中的 `ea_file_copier.mq5` 只读取该本地文件，以独立 magic 隔离并同步受管仓位。它与本 Web 展示应用互不依赖；请严格按照 [copy-trade/README.md](copy-trade/README.md) 在 Hedging 模拟账户完成验证后使用。

## 云服务器部署与每日 8:00 同步

生产环境使用 [docker-compose.production.yml](docker-compose.production.yml) 和 [Caddyfile](Caddyfile)：服务器从上传的源码使用锁文件构建，Caddy 自动管理 HTTPS，应用端口仅在服务器本机监听，运行时数据保存于 Docker 持久卷。容器已配置应用就绪检查、Caddy 健康依赖、日志轮转及 CPU/内存限制；每日任务会生成一致性数据卷备份并可通过 rclone 上传异地存储。阿里云 ECS 的安全组、域名/备案、Docker 安装、MQL5 Cookie、自动同步、备份恢复、升级与回滚流程请参见完整的 [deploy/README.md](deploy/README.md)。

同步任务先更新公开页指标；若配置了仅服务器可见的 `MQL5_SESSION_COOKIE`，还会下载最新的完整交易 CSV 并重建曲线。接口不会向浏览器暴露 Cookie 或密钥。若任一策略同步失败，仍保留其上一次成功的数据。

## 数据说明

本地快照根据 2026 年 8 月采集的公开页面数据整理，仅用于页面可用性演示。六个信号均已通过已授权的 MQL5 会话导入逐笔交易历史至项目本地 CSV；详情页按每页 20 笔展示。账户金额会根据策略的 USD、EUR 或 JPY 账户币种进行本地化显示。需重新同步时，请在已登录且获授权的 MQL5 会话中重新导出 CSV，切勿在仓库保存账号、密码或 Cookie。数据不应作为投资或交易决策依据。

## EA 商城与开发者上架

商城商品持久化在 SQLite（`$SIGNAL_DATA_DIR/marketplace/marketplace.db`，本地默认为 `.signal-data/marketplace/`，已 gitignore），上传的源码保存在同级 `sources/` 目录。仅审核通过的社区作品会在商城展示。

账户与上架流程：

1. 访问 `/developer` 注册账户，完成邮箱验证后登录（会话为 httpOnly、SameSite Strict Cookie，7 天有效）。
2. 「提交新作品」填写商品信息并上传 `.mq5` / `.mq4` / `.ex5` / `.ex4` 文件（≤ 10MB），或发布只交付说明的策略模板。
3. 作品进入审核队列（`pending`）。管理员在 `/admin/review` 通过后自动上架；驳回会附带原因，开发者修改后重新提交。
4. 首位管理员应先注册并验证邮箱，再执行 `npm run admin:promote -- admin@example.com`。`MARKETPLACE_ADMIN_EMAILS` 仅供旧数据库首次升级迁移，运行时不参与授权。
5. 管理员在 `/admin/users` 管理角色和账户状态并查看审计事件；系统禁止当前管理员停用/降级自己，也禁止移除最后一位启用的管理员。
6. 管理员在 `/admin/finance` 查看 Gas 总余额、累计发放、累计消费、积分流水及消费订单，并填写原因向指定用户发放或扣减 Gas。
7. 买家登录后使用 Gas 下单。余额扣减、积分流水和订单创建在同一个 SQLite 事务中完成；余额不足时整体回滚。用户可在 `/account/orders` 查看消费订单和重新下载。

Gas 是平台内部积分，不代表人民币或其他法定货币。正式上线前仍需补充积分充值/兑换规则、退款策略、授权期限与下载次数限制。
