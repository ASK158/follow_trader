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

## 3. 获取项目并配置服务器环境

```bash
sudo mkdir -p /opt/signal-web
sudo chown "$USER":"$USER" /opt/signal-web
git clone https://github.com/ASK158/follow_trader.git /opt/signal-web
cd /opt/signal-web
cp .env.example .env
chmod 600 .env
```

编辑 `.env`：

```dotenv
CRON_SECRET=<使用 openssl rand -hex 32 生成的随机值>
DOMAIN=signal.example.com
ACME_EMAIL=ops@example.com
MQL5_SESSION_COOKIE=<可选，仅服务器保存的完整 Cookie 请求头值>
```

生成同步密钥：

```bash
openssl rand -hex 32
```

`MQL5_SESSION_COOKIE` 只用于读取受登录保护的 MQL5 导出 CSV。浏览器登录 MQL5 后，在导出仓位请求中复制完整 `Cookie` 请求头值并粘贴到服务器 `.env`；不要发送到聊天、写入源码、Git、镜像或日志。Cookie 过期或被撤销后，公开指标仍会同步，但完整交易历史和收益曲线不会更新；更新服务器 `.env` 后重新执行同步即可。

私有仓库请为服务器创建只读 Deploy Key，再用仓库 SSH 地址克隆；不要把 GitHub 个人访问令牌写入命令历史。

## 4. 构建并启动

确认 DNS 已指向此 ECS，且安全组已开放 80/443 后执行：

```bash
cd /opt/signal-web
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs -f caddy
```

Caddy 会自动申请 HTTPS 证书。浏览器访问 `https://signal.example.com` 验证页面。若证书申请失败，优先检查：域名 A 记录、80/443 安全组规则、ECS 防火墙和域名是否已被其他服务占用。

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

设置服务器时区，并创建每日北京时间 08:00 的任务：

```bash
sudo timedatectl set-timezone Asia/Shanghai
sudo install -m 750 -o root -g root deploy/scripts/sync-signals.sh /usr/local/sbin/signal-web-sync
sudo crontab -e
```

加入以下任务：

```cron
0 8 * * * /usr/local/sbin/signal-web-sync >> /var/log/signal-web-sync.log 2>&1
```

该脚本从 `/opt/signal-web/.env` 读取 `CRON_SECRET`，仅访问 `127.0.0.1:3000`；密钥不会经过 Caddy 或公网。同步完成后，页面会使用最新公开指标；配置有效 Cookie 时还会保存最新交易 CSV 并按日重建曲线。

## 6. 更新版本

本地完成测试、提交和推送后，在服务器执行：

```bash
cd /opt/signal-web
git pull --ff-only origin main
docker compose -f docker-compose.production.yml up -d --build
./deploy/scripts/sync-signals.sh
```

检查状态：

```bash
docker compose -f docker-compose.production.yml ps
git status --short --branch
```

## 7. 备份和恢复

运行数据位于名为 `signal-data` 的 Docker 卷中。先查询实际卷名：

```bash
docker volume ls | grep signal-data
```

备份到服务器目录：

```bash
sudo mkdir -p /var/backups/signal-web
docker run --rm \
  -v signal-web_signal-data:/data:ro \
  -v /var/backups/signal-web:/backup \
  alpine tar czf "/backup/signal-data-$(date +%F).tgz" -C /data .
```

> 默认 Compose 项目名通常为 `signal-web`，因此卷名可能为 `signal-web_signal-data`；务必以 `docker volume ls` 输出为准。建议将备份目录定期上传至阿里云 OSS，并设置生命周期策略。

恢复前停止服务，并使用同一卷名解压备份：

```bash
cd /opt/signal-web
docker compose -f docker-compose.production.yml down
docker run --rm \
  -v signal-web_signal-data:/data \
  -v /var/backups/signal-web:/backup:ro \
  alpine sh -c 'rm -rf /data/* && tar xzf /backup/<备份文件名>.tgz -C /data'
docker compose -f docker-compose.production.yml up -d
```

## 8. 日常安全检查

- 将 SSH 22 端口来源限制到管理员固定 IP，并使用密钥登录。
- 保持系统、Docker 和镜像更新；更新前先备份 `signal-data` 卷。
- `.env` 权限保持为 `600`，仅管理员可读。
- 切勿把 `3000` 暴露到公网；同步端点由 Caddy 返回 404。
- Cookie 失效时更新 `.env` 后重启应用：

  ```bash
  docker compose -f docker-compose.production.yml up -d
  /usr/local/sbin/signal-web-sync
  ```
