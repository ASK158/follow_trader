# IP 地址访问部署（Ubuntu 24.04）

这是当前正式生产部署方案：在云服务器本地通过 Docker Compose 构建并运行应用。它不依赖 GitHub，适用于暂时没有域名、仅提供 HTTP 的服务器。

当前生产服务器：

```text
http://39.108.191.116
```

> HTTP 流量未加密，且没有公网可信 HTTPS 证书。获得域名后请切换至 [生产 HTTPS 部署说明](README.md)。

## 发布方式说明

- **正式生产发布（本说明）**：在本地完成测试后，将源码包上传到云服务器 `/opt/signal-web`，并在服务器执行 Docker Compose 构建和启动。SQLite 数据保存在 Docker 卷中，由 OSS 备份任务保护。
- **GitHub 发布（可选子模块）**：GitHub 可用于保存源码、版本标签、Release 或供其他模块拉取代码；生产服务器不需要依赖 GitHub 才能构建、启动或更新本应用。

不要把 GitHub 工作流与生产数据卷绑定：无论源码来自本地上传还是 GitHub，服务器上的 `.env`、`.env.backup` 和 `signal-data` 数据卷都必须保留。

## 1. 阿里云控制台

在该实例的安全组/防火墙入方向放行：

| 协议 | 端口 | 来源 |
| --- | ---: | --- |
| TCP | 22 | 仅管理员固定公网 IP |
| TCP | 80 | `0.0.0.0/0` |

不要对公网开放 `3000`、`443` 或任何数据库端口。

## 2. 连接服务器

在 Windows PowerShell 中使用创建实例时下载的私钥执行：

```powershell
ssh -i "C:\Users\<你的用户名>\Downloads\signal-web-prod-2026.pem" root@39.108.191.116
```

首次连接时确认主机指纹。请妥善保存 `.pem` 私钥，不要上传到 Git、服务器项目目录或发送到聊天中。若实例创建时选择了其他登录用户名，请将 `root` 替换为实际用户名。

## 3. 安装 Docker

以下步骤适用于 Ubuntu 24.04。使用 Docker 官方 APT 仓库安装 Docker Engine 和 Compose 插件：

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git openssl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"${UBUNTU_CODENAME:-$VERSION_CODENAME}\") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
docker --version
docker compose version
```

Ubuntu 使用 UFW 时，仅开放 SSH 和 HTTP：

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw --force enable
sudo ufw status verbose
```

安全组仍应优先限制 TCP 22 的来源；UFW 的 SSH 规则可改为 `sudo ufw limit 22/tcp` 以限制暴力尝试。

## 4. 部署项目

```bash
sudo mkdir -p /opt/signal-web
sudo chown "$USER":"$USER" /opt/signal-web
# 在本地完成测试，把源码压缩包上传并解压到 /opt/signal-web。
# 不要上传 node_modules、.next、.env 或 .signal-data。
cd /opt/signal-web
cp .env.example .env
chmod 600 .env
```

编辑 `.env`，至少配置随机同步密钥：

```bash
openssl rand -hex 32
vi .env
```

`.env` 示例：

```dotenv
CRON_SECRET=<粘贴 openssl 生成的随机值>
# 需要自动下载最新完整交易流水和重建曲线时才配置：
# MQL5_SESSION_COOKIE=key=value; another=value
```

`DOMAIN` 和 `ACME_EMAIL` 在 IP 模式下无需配置。不要向聊天、Git 或日志粘贴 Cookie。

### 临时 HTTP 公测账户

IP/HTTP 模式默认不会为生产账户发送会话 Cookie，因此不能用于在线登录。若仅在短期封闭公测中必须启用登录，可在服务器 `.env` 中显式加入 `AUTH_COOKIE_SECURE=false`，重建应用后才会生效。HTTP 会明文传输登录密码和会话，**不得开放公开注册或使用真实、复用的密码**；切换到域名 HTTPS 后必须删除该项（或设为 `true`）并重新登录。

未配置 SMTP 或邮件网关时，注册账户无法完成邮箱验证，生产环境默认拒绝自助注册。公测初始账户应由管理员在服务器端一次性创建并标记为已验证；不得将此机制用于公开注册。配置 SMTP 或邮件网关并完成投递测试后，才可在服务器 `.env` 中设置 `PUBLIC_REGISTRATION_ENABLED=true`。

## 5. 从源码构建并启动

当前服务器为 4 vCPU / 8 GiB，直接使用 IP 源码 Compose 构建：

```bash
cd /opt/signal-web
docker compose -f docker-compose.ip.yml build
docker compose -f docker-compose.ip.yml up -d
docker compose -f docker-compose.ip.yml ps
```

等待应用变为健康并验证入口：

```bash
docker compose -f docker-compose.ip.yml ps
curl --fail http://127.0.0.1:3000/api/health/ready
```

应用限制为 1.5 CPU / 2 GiB 内存，Caddy 限制为 0.5 CPU / 256 MiB；容器日志单文件上限 10 MiB、保留 5 份。Caddy 会等待应用健康后才开始代理。

## 6. 自动 OSS 备份和维护任务

先在阿里云创建名称为 `sigmabot` 的私有 OSS Bucket；建议选择与 ECS 不同的地域形成异地副本，并开启版本控制和生命周期。安装 rclone 后执行 `sudo rclone config` 创建名为 `aliyun-oss` 的阿里云 OSS 远端。AccessKey 只能保存在 root 的 rclone 配置中。然后配置备份目标：

```bash
cd /opt/signal-web
cp deploy/backup.env.example .env.backup
chmod 600 .env.backup
vi .env.backup
sudo PROJECT_DIR=/opt/signal-web ./deploy/scripts/install-maintenance.sh
sudo /usr/local/sbin/signal-web-backup
sudo rclone lsl aliyun-oss:sigmabot/signal-web | tail
```

`.env.backup` 必须保留 `COMPOSE_FILE=docker-compose.ip.yml`，并把 `RCLONE_REMOTE` 改成真实远端。默认每日 02:30 生成一致性数据卷快照并上传 OSS，每日 08:00 同步信号；宿主机日志自动保留 30 份。未配置远端时脚本只生成本地文件，不算完成异地备份。

恢复前把 `.tgz` 和对应 `.sha256` 下载到同一目录：

```bash
sudo /usr/local/sbin/signal-web-restore /var/backups/signal-web/signal-data-YYYYMMDDTHHMMSSZ.tgz
```

## 7. 首次同步与定时同步

首次启动后执行：

```bash
chmod 750 deploy/scripts/sync-signals.sh
./deploy/scripts/sync-signals.sh
```

如服务器无法直接访问 MQL5，但必须经过 HTTP 代理，请仅在服务器 `.env` 中增加：

```dotenv
HTTPS_PROXY=http://<代理主机>:<端口>
HTTP_PROXY=http://<代理主机>:<端口>
```

同步服务会显式将上述代理用于 MQL5 请求；修改 `.env` 后执行 `docker compose -f docker-compose.ip.pull.yml up -d` 重建容器环境。

维护安装脚本已通过 `/etc/cron.d/signal-web` 配置每日北京时间 08:00 同步，请勿再重复编辑 root crontab。只需设置时区并检查任务：

```bash
sudo timedatectl set-timezone Asia/Shanghai
cat /etc/cron.d/signal-web
```

### 服务器无法访问 MQL5 时：改由本机同步

若服务器到 `www.mql5.com:443` 超时，但本机可通过代理完成同步，可临时关闭服务器端同步任务，并将本机生成的信号文件导入服务器。关闭任务不会影响每日备份：

```bash
sudo sed -i 's/^0 8 /# 0 8 /' /etc/cron.d/signal-web
```

本机同步完成后，只传输 `.signal-data/signals.json` 和 `.signal-data/positions/` 中的六份 CSV。**不得上传或覆盖整个 `signal-data` 卷**，以免覆盖生产环境中的用户账户、订单、评论、上传文件和 SQLite 数据库。导入前先执行服务器备份，短暂停止容器后仅解压上述两个路径，随后重新启动容器并检查就绪接口。

待服务器网络恢复后，删除 cron 行首的 `# ` 并手动执行一次 `/usr/local/sbin/signal-web-sync`，确认六个信号全部成功后再恢复每日同步。

## 8. 正式生产更新流程

每次更新都在本地先执行 `npm ci`、Lint、测试和生产构建验证；然后上传不含敏感数据和构建产物的源码包。GitHub Release 或仓库源码也可以作为源码包来源，但不是生产更新的必需条件。

```bash
cd /opt/signal-web
sudo /usr/local/sbin/signal-web-backup
docker image tag "$(docker compose -f docker-compose.ip.yml images -q signal-web)" signal-web:rollback
# 上传并解压新版源码，但保留服务器 .env、.env.backup 和 Docker 数据卷。
docker compose -f docker-compose.ip.yml build
docker compose -f docker-compose.ip.yml up -d
./deploy/scripts/sync-signals.sh
```

更新完成后应再次检查 `docker compose -f docker-compose.ip.yml ps`，并执行 `curl --fail http://127.0.0.1:3000/api/health/ready`。若新版本异常，可停止当前容器并使用 `signal-web:rollback` 镜像回滚。
