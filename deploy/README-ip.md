# IP 地址访问部署（CentOS 8.2 CTA）

该方案适用于暂时没有域名的服务器，仅提供 HTTP：

```text
http://47.84.72.62
```

> HTTP 流量未加密，且没有公网可信 HTTPS 证书。获得域名后请切换至 [生产 HTTPS 部署说明](README.md)。

## 1. 阿里云控制台

在该实例的安全组/防火墙入方向放行：

| 协议 | 端口 | 来源 |
| --- | ---: | --- |
| TCP | 22 | 仅管理员固定公网 IP |
| TCP | 80 | `0.0.0.0/0` |

不要对公网开放 `3000`、`443` 或任何数据库端口。

## 2. 连接服务器

在 Windows PowerShell 中执行：

```powershell
ssh root@47.84.72.62
```

首次连接时确认主机指纹。若尚未设置 root 密码，在阿里云控制台通过“更多操作 → 重置实例密码”设置，然后重启实例。

## 3. 安装 Docker

CentOS 8.2 已停止维护，若命令因镜像源失效而失败，建议先在阿里云控制台将系统升级或重装为 Alibaba Cloud Linux 3 / Rocky Linux 9。以下步骤适用于可正常使用 `dnf` 的 CentOS：

```bash
sudo dnf -y install dnf-plugins-core git curl
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
docker --version
docker compose version
```

若启用了 firewalld，只开放 HTTP：

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
```

## 4. 部署项目

```bash
sudo mkdir -p /opt/signal-web
sudo chown "$USER":"$USER" /opt/signal-web
git clone https://github.com/ASK158/follow_trader.git /opt/signal-web
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

## 5. 推荐：由 GitHub Actions 构建镜像，服务器只拉取运行

本仓库的 [publish-image.yml](../.github/workflows/publish-image.yml) 会在每次推送 `main` 后使用 GitHub Actions 构建镜像并发布到 GitHub Container Registry（GHCR）。这避免 2 GB 内存 ECS 执行 `npm run build`。

首次推送工作流后，到 GitHub 仓库的 **Actions** 页面等待“Publish container image”成功；再到 GitHub 个人资料的 **Packages** 中打开 `signal-web` 包，将其 Package visibility 设置为 **Public**。公开镜像不包含 `.env`、Cookie 或同步数据；这些数据仅保存在服务器。

然后在服务器执行：

```bash
cd /opt/signal-web
git pull --ff-only origin main
docker compose -f docker-compose.ip.pull.yml pull
docker compose -f docker-compose.ip.pull.yml up -d
docker compose -f docker-compose.ip.pull.yml ps
```

以后每次代码推送和 Actions 成功后，服务器更新只需：

```bash
cd /opt/signal-web
git pull --ff-only origin main
docker compose -f docker-compose.ip.pull.yml pull
docker compose -f docker-compose.ip.pull.yml up -d
./deploy/scripts/sync-signals.sh
```

`signal-data` Docker 卷不会被上述更新删除，因此每日同步数据、交易 CSV、收益曲线和浏览服务均继续保留在 ECS。

## 6. 仅在无法使用 GHCR 时：服务器本地构建

不推荐在该 2 GB ECS 上执行本地构建；仅当 GHCR 不可用时才使用以下命令：

```bash
docker compose -f docker-compose.ip.yml up -d --build
docker compose -f docker-compose.ip.yml ps
docker compose -f docker-compose.ip.yml logs -f
```

浏览器访问：

```text
http://47.84.72.62
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

设置每日北京时间 08:00 同步：

```bash
sudo timedatectl set-timezone Asia/Shanghai
sudo install -m 750 -o root -g root deploy/scripts/sync-signals.sh /usr/local/sbin/signal-web-sync
sudo crontab -e
```

添加：

```cron
0 8 * * * /usr/local/sbin/signal-web-sync >> /var/log/signal-web-sync.log 2>&1
```

## 8. 本地构建模式更新项目

```bash
cd /opt/signal-web
git pull --ff-only origin main
docker compose -f docker-compose.ip.yml up -d --build
./deploy/scripts/sync-signals.sh
```
