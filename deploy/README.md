# 生产部署（阿里云 ECS + Docker Compose + Caddy）

> 暂时没有域名、仅通过公网 IP 访问时，请使用 [README-ip.md](README-ip.md) 中的 HTTP 部署方案；该方案不申请 HTTPS 证书。

本目录将 Signal Watch 部署为以下结构：

```text
浏览器 ── HTTPS :443 ──> Caddy ── Docker bridge 网络 ──> Signal Watch :3000
                                                │
服务器本机 cron ── 127.0.0.1:3000 ─────────────┘
```

- Caddy 自动申请与续期 HTTPS 证书。
- Caddy 仅代理网页请求；`/api/cron/*` 不向公网开放。
- 应用端口只绑定到服务器回环地址 `127.0.0.1:3000`，供同步脚本调用。
- 应用可通过 Docker bridge 网络主动访问 MQL5，但没有任何公网端口映射。
- `signal-data` Docker 卷保存同步指标和完整交易 CSV，容器重建不会丢失。

> 请勿将 `.env`、MQL5 Cookie、账号密码或同步结果提交到 Git。

## 1. 部署前准备

### 域名和备案

准备一个已解析到 ECS 公网 IPv4 的域名，例如 `signal.example.com`。如果 ECS 位于中国大陆，需要先完成域名实名认证和 ICP 备案；未备案时不要正式对外提供网站服务。香港、新加坡等非中国大陆地域通常不需要 ICP 备案。

DNS 添加一条 A 记录：

| 记录类型 | 主机记录 | 记录值 |
| --- | --- | --- |
| A | `signal` | ECS 的公网 IPv4 地址 |

在阿里云安全组入方向只放行：

| 协议 | 端口 | 来源 |
| --- | ---: | --- |
| TCP | 22 | 管理员固定公网 IP |
| TCP | 80 | `0.0.0.0/0` |
| TCP | 443 | `0.0.0.0/0` |
| UDP | 443 | `0.0.0.0/0` |

不要创建 `3000` 的公网安全组规则。

### ECS 建议规格

- Ubuntu 24.04 LTS
- 至少 2 vCPU / 4 GiB 内存 / 40 GiB ESSD
- 分配公网 IPv4
- 使用 SSH 密钥对登录；禁用或严格限制密码登录

## 2. 安装 Docker

以 `ubuntu` 用户登录 ECS。Docker 官方仓库的安装步骤随发行版变化，请使用 Docker 官方安装文档安装 Docker Engine 和 Docker Compose Plugin。安装完成后验证：

```bash
docker --version
docker compose version
```

将当前用户加入 Docker 用户组，然后重新登录：

```bash
sudo usermod -aG docker "$USER"
exit
```

## 3. 上传源码并配置服务器环境

```bash
sudo mkdir -p /opt/signal-web
sudo chown "$USER":"$USER" /opt/signal-web
# 在本地将源码打包并上传后，在服务器解压到此目录；不要打包 node_modules、.next、.env 或 .signal-data。
cd /opt/signal-web
cp .env.example .env
chmod 600 .env
```

编辑 `.env`：

```dotenv
CRON_SECRET=<使用 openssl rand -hex 32 生成的随机值>
DOMAIN=signal.example.com
MQL5_SESSION_COOKIE=<可选，仅服务器保存的完整 Cookie 请求头值>
AI_API_KEY=<AI 服务密钥，仅服务器保存>
AI_CHAT_COMPLETIONS_URL=https://api.deepseek.com/chat/completions
AI_MODEL=deepseek-chat
```

`AI_API_KEY`、`AI_CHAT_COMPLETIONS_URL` 与 `AI_MODEL` 用于 AI 实验室的初始配置和运行时回退。部署并创建管理员后，也可在 `/admin/finance` 在线验证并保存配置，无需重建服务；后台 API Key 使用 `AUTH_ENCRYPTION_KEY` 加密保存且不会回显。密钥不得写入源码、镜像、日志或发送至浏览器。

生成同步密钥：

```bash
openssl rand -hex 32
```

`MQL5_SESSION_COOKIE` 只用于读取受登录保护的 MQL5 导出 CSV。浏览器登录 MQL5 后，在导出仓位请求中复制完整 `Cookie` 请求头值并粘贴到服务器 `.env`；不要发送到聊天、写入源码、Git、镜像或日志。Cookie 过期或被撤销后，公开指标仍会同步，但完整交易历史和收益曲线不会更新；更新服务器 `.env` 后重新执行同步即可。

`.env` 只在服务器创建，不随源码包上传。源码、运行数据卷和服务器密钥必须保持分离。

## 4. 构建并启动

确认 DNS 已指向此 ECS，且安全组已开放 80/443 后执行：

```bash
cd /opt/signal-web
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs -f caddy
```

`signal-web` 通过 `/api/health/ready` 检查 SQLite 和数据卷读写能力；Caddy 仅在应用变为 `healthy` 后启动。Caddy 会自动申请 HTTPS 证书。浏览器访问 `https://signal.example.com` 验证页面。若证书申请失败，优先检查：域名 A 记录、80/443 安全组规则、ECS 防火墙和域名是否已被其他服务占用。

验证就绪状态：

```bash
curl --fail http://127.0.0.1:3000/api/health/ready
docker inspect --format '{{.State.Health.Status}}' "$(docker compose -f docker-compose.production.yml ps -q signal-web)"
```

应用日志：

```bash
docker compose -f docker-compose.production.yml logs -f signal-web
```

## 5. 首次同步和每日任务

首次上线后立即同步一次：

```bash
cd /opt/signal-web
chmod 750 deploy/scripts/sync-signals.sh
./deploy/scripts/sync-signals.sh
```

设置服务器时区。同步和备份任务将在第 7 节统一安装，不要再向 root crontab 重复添加同一任务：

```bash
sudo timedatectl set-timezone Asia/Shanghai
```

该脚本从 `/opt/signal-web/.env` 读取 `CRON_SECRET`，仅访问 `127.0.0.1:3000`；密钥不会经过 Caddy 或公网。同步完成后，页面会使用最新公开指标；配置有效 Cookie 时还会保存最新交易 CSV 并按日重建曲线。

## 6. 更新版本

每次升级先创建数据备份，并保留当前源码包和镜像。然后上传新版源码覆盖 `/opt/signal-web`，但不得覆盖服务器的 `.env` 和 `.env.backup`：

```bash
cd /opt/signal-web
sudo /usr/local/sbin/signal-web-backup
docker image tag "$(docker compose -f docker-compose.production.yml images -q signal-web)" signal-web:rollback
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up -d
./deploy/scripts/sync-signals.sh
```

检查状态：

```bash
docker compose -f docker-compose.production.yml ps
curl --fail http://127.0.0.1:3000/api/health/ready
```

若新版异常，可将保留的上一版源码重新解压后构建，或把 Compose 的应用镜像临时改为 `signal-web:rollback` 后启动。不要执行 `docker compose down -v`，该命令会删除运行数据。

## 7. 自动备份和恢复

运行数据位于 `signal-data` Docker 卷中。备份脚本会自动识别实际卷名，短暂停止应用以获得 SQLite、WAL、上传源码和信号 CSV 的一致快照，生成 SHA-256 校验文件，随后立即恢复应用。默认在本机保留 14 天，并可通过 rclone 上传阿里云 OSS 或其他异地存储。

先在服务器安装 rclone，并在阿里云创建名称为 `sigmabot` 的私有 OSS Bucket；建议选择与 ECS 不同的地域。执行 `sudo rclone config` 创建远端（名称 `aliyun-oss`）。访问密钥只能存放在 root 的 rclone 配置中，不得写入仓库或 `.env`。建议在 rclone 上叠加 `crypt` 远端，并在 OSS 配置生命周期和版本控制。

配置并安装每日任务：

```bash
cd /opt/signal-web
cp deploy/backup.env.example .env.backup
chmod 600 .env.backup
vi .env.backup
sudo PROJECT_DIR=/opt/signal-web ./deploy/scripts/install-maintenance.sh
```

默认计划为每日 02:30 备份、08:00 同步；宿主机同步与备份日志由 logrotate 每日轮转并保留 30 份。手动执行一次备份并同时确认异地对象存在：

```bash
sudo /usr/local/sbin/signal-web-backup
sudo rclone lsl aliyun-oss:sigmabot/signal-web | tail
```

若输出“未配置 `RCLONE_REMOTE`”，只完成了本机备份，**不算异地备份验收通过**。定期查看执行日志：

```bash
tail -100 /var/log/signal-web-backup.log
tail -100 /var/log/signal-web-sync.log
```

恢复会清空当前数据卷。先把异地的 `.tgz` 和对应 `.sha256` 下载到同一目录，再执行：

```bash
sudo /usr/local/sbin/signal-web-restore /var/backups/signal-web/signal-data-YYYYMMDDTHHMMSSZ.tgz
docker compose -f /opt/signal-web/docker-compose.production.yml ps
```

上线前至少在非生产卷完成一次恢复演练；只有“已上传、可校验、可恢复”的副本才是有效备份。

## 8. 容器资源和日志策略

- 应用限制为 1.5 CPU、2 GiB 内存、256 个进程，并将 Node.js 堆限制为 1536 MiB。
- Caddy 限制为 0.5 CPU、256 MiB 内存、128 个进程。
- 两个服务均使用 Docker `json-file` 日志，每个文件最多 10 MiB，保留 5 个文件。
- 当前参数按 2 vCPU / 4 GiB 或更高规格配置；仍建议保留 2 GiB Swap。资源限制只约束运行容器，源码构建时仍需足够内存。

检查限制与轮转是否生效：

```bash
docker compose -f docker-compose.production.yml config
docker inspect --format '{{json .HostConfig.LogConfig}} {{.HostConfig.Memory}} {{.HostConfig.NanoCpus}}' "$(docker compose -f docker-compose.production.yml ps -q signal-web)"
```

## 9. 日常安全检查

- 将 SSH 22 端口来源限制到管理员固定 IP，并使用密钥登录。
- 保持系统、Docker 和镜像更新；更新前先备份 `signal-data` 卷。
- 当前固定使用 Node.js `22.22.0-alpine`、Caddy `2.10.2-alpine` 和备份工具 `alpine:3.22.2`；按月评估安全更新，修改固定版本后重新构建验证，不要改回浮动标签。
- `.env` 权限保持为 `600`，仅管理员可读。
- 切勿把 `3000` 暴露到公网；同步端点由 Caddy 返回 404。
- Cookie 失效时更新 `.env` 后重启应用：

  ```bash
  docker compose -f docker-compose.production.yml up -d
  /usr/local/sbin/signal-web-sync
  ```
