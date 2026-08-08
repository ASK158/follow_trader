# Signal Web 生产运维手册

> 服务器：Alibaba Cloud ECS，CentOS 8.2，2 vCPU / 2GB RAM + 2GB Swap  
> IP：47.84.72.62  
> 项目路径：`/opt/signal-web`  
> 镜像仓库：`ghcr.io/ask158/signal-web:latest`（GitHub Actions 自动构建）

---

## 一、程序如何保持运行

容器策略为 `restart: unless-stopped`，效果如下：

| 场景 | 行为 |
|---|---|
| 服务器正常重启 | 容器自动拉起，无需手动操作 |
| 应用进程崩溃 | Docker 自动重启容器 |
| 手动 `docker compose down` | 不自动重启，需手动启动 |

无需配置 systemd 或 supervisor，Docker 本身已接管进程守护。

---

## 二、日常操作命令

所有命令均在 `/opt/signal-web` 目录下执行：

```bash
cd /opt/signal-web
```

### 查看运行状态

```bash
docker compose -f docker-compose.ip.pull.yml ps
```

### 查看实时日志

```bash
# 查看 Next.js 应用日志
docker compose -f docker-compose.ip.pull.yml logs -f signal-web

# 查看 Caddy 代理日志
docker compose -f docker-compose.ip.pull.yml logs -f caddy

# 查看所有容器日志（最近100行）
docker compose -f docker-compose.ip.pull.yml logs --tail=100
```

### 手动触发数据同步

```bash
/opt/signal-web/deploy/scripts/sync-signals.sh
```

输出 `"csvUpdated":true` 表示 CSV 历史数据已更新；`"csvUpdated":false` 表示 CSV 无变化（正常）。

### 查看自动同步日志

```bash
tail -f /var/log/signal-web-sync.log
```

脚本仅在所有信号都同步成功时返回成功。若日志中出现 `HTTP 207`，请查看同一条 JSON 的 `results` 字段；其中的 `reason` 即为上游访问或页面解析失败原因。此前 `curl` 会把 `207` 当作成功，容易掩盖数据持续未更新的问题。

---

## 三、停止服务

```bash
cd /opt/signal-web
docker compose -f docker-compose.ip.pull.yml down
```

> 注意：`down` 不会删除数据卷，信号数据完整保留。

---

## 四、启动 / 重启服务

```bash
cd /opt/signal-web
docker compose -f docker-compose.ip.pull.yml up -d
```

---

## 五、更新到最新版本

代码推送到 GitHub `main` 分支后，GitHub Actions 自动构建新镜像。在服务器上执行以下命令拉取并更新：

```bash
cd /opt/signal-web

# 1. 拉取最新代码（配置文件、脚本等）
GIT_SSH_COMMAND='ssh -i /root/.ssh/signal-web-deploy -o IdentitiesOnly=yes' \
  git pull --ff-only origin main

# 2. 拉取最新 Docker 镜像
docker compose -f docker-compose.ip.pull.yml pull

# 3. 重启容器（零停机时间极短）
docker compose -f docker-compose.ip.pull.yml up -d

# 4. 同步脚本安装在 /usr/local/sbin；代码库更新后也要覆盖它
install -m 750 /opt/signal-web/deploy/scripts/sync-signals.sh /usr/local/sbin/signal-web-sync
```

---

## 六、敏感配置维护

敏感信息存储在 `/opt/signal-web/.env`，**不纳入 Git 版本控制**。

### 查看当前配置

```bash
cat /opt/signal-web/.env
```

### 修改配置（如更新 Cookie）

```bash
vi /opt/signal-web/.env
```

修改后需重启容器使配置生效：

```bash
docker compose -f docker-compose.ip.pull.yml up -d
```

### .env 文件格式参考

```env
CRON_SECRET=你的同步密钥
MQL5_SESSION_COOKIE=从浏览器DevTools获取的完整Cookie字符串
```

> Cookie 从 MQL5.com 浏览器开发者工具 → Network → 任意请求 → Request Headers → Cookie 字段获取。
> Cookie 有效期约数周，失效后重新获取并更新即可。

---

## 七、定时任务维护

每日 08:00 自动同步，使用系统 crontab 管理。

### 查看定时任务

```bash
crontab -l
```

### 编辑定时任务

```bash
crontab -e
```

当前任务内容：

```
0 8 * * * /usr/local/sbin/signal-web-sync >> /var/log/signal-web-sync.log 2>&1
```

---

## 八、磁盘与内存维护

### 查看磁盘使用

```bash
df -h
```

### 查看内存使用（含 Swap）

```bash
free -h
```

### 清理 Docker 无用镜像（释放磁盘）

```bash
docker image prune -f
```

### 清理同步日志（超过30天的）

```bash
find /var/log -name "signal-web-sync.log*" -mtime +30 -delete
```

---

## 九、故障排查

| 现象 | 排查步骤 |
|---|---|
| 页面无法访问 | `docker compose -f docker-compose.ip.pull.yml ps` 确认容器状态 |
| 数据未更新 | 手动运行同步脚本，检查 Cookie 是否过期 |
| 同步报错 | `tail -50 /var/log/signal-web-sync.log` 查看错误信息 |
| 容器启动失败 | `docker compose -f docker-compose.ip.pull.yml logs signal-web` |
| 镜像拉取失败 | 检查 GHCR 镜像是否为 Public，或网络是否通畅 |
| 内存不足 OOM | `free -h` 确认 Swap 是否挂载；`swapon --show` |

---

## 十、完整部署流程（首次/重装）

> 适用于服务器重装或迁移到新服务器的场景。

```bash
# 1. 安装 Docker（CentOS 8）
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

# 2. 创建 Swap（2GB）
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 3. 配置 SSH Deploy Key
mkdir -p ~/.ssh
# 将私钥内容写入文件（从安全渠道获取）
vi ~/.ssh/signal-web-deploy
chmod 600 ~/.ssh/signal-web-deploy
ssh-keyscan github.com >> ~/.ssh/known_hosts

# 4. 克隆项目
GIT_SSH_COMMAND='ssh -i /root/.ssh/signal-web-deploy -o IdentitiesOnly=yes' \
  git clone git@github.com:ASK158/follow_trader.git /opt/signal-web
cd /opt/signal-web

# 5. 创建 .env 文件
vi /opt/signal-web/.env
# 写入：
# CRON_SECRET=你的密钥
# MQL5_SESSION_COOKIE=你的Cookie
chmod 600 /opt/signal-web/.env

# 6. 启动容器
docker compose -f docker-compose.ip.pull.yml pull
docker compose -f docker-compose.ip.pull.yml up -d

# 7. 安装同步脚本并设置定时任务
timedatectl set-timezone Asia/Shanghai
install -m 750 /opt/signal-web/deploy/scripts/sync-signals.sh /usr/local/sbin/signal-web-sync
crontab -e
# 添加：0 8 * * * /usr/local/sbin/signal-web-sync >> /var/log/signal-web-sync.log 2>&1

# 8. 手动验证同步
/opt/signal-web/deploy/scripts/sync-signals.sh
```
