# Signal Web 生产运维手册

> 服务器：Alibaba Cloud ECS，Ubuntu 26.04 LTS，2 vCPU / 4 GiB RAM + 4 GiB Swap（东京地域）
> IP：8.216.51.10
> 项目路径：`/opt/signal-web`，运行方式：源码 Compose 构建（`docker-compose.ip.yml`）
> 迁移历史：2026-09-28 自北京 39.108.191.116（4C8G）迁入；更早部署于 47.84.72.62（CentOS 8，已退役）
> SSH：`ssh -i <本机密钥路径> root@8.216.51.10`，安全组仅放行 22（限管理员 IP）与 80
> 镜像仓库：`ghcr.io/ask158/signal-web:latest`（GitHub Actions 自动构建，pull 模式备用）

---

## 一、程序如何保持运行

容器策略为 `restart: unless-stopped`，效果如下：

| 场景 | 行为 |
|---|---|
| 服务器正常重启 | 容器自动拉起，无需手动操作 |
| 应用进程崩溃 | Docker 自动重启容器 |
| 手动 `docker compose down` | 不自动重启，需手动启动 |

无需配置 systemd 或 supervisor，Docker 本身已接管进程守护。Caddy 会等待应用健康检查通过后才开始代理。

---

## 二、日常操作命令

所有命令均在 `/opt/signal-web` 目录下执行：

```bash
cd /opt/signal-web
```

### 查看运行状态

```bash
docker compose -f docker-compose.ip.yml ps
curl --fail http://127.0.0.1:3000/api/health/ready
```

### 查看实时日志

```bash
# 查看 Next.js 应用日志
docker compose -f docker-compose.ip.yml logs -f signal-web

# 查看 Caddy 代理日志
docker compose -f docker-compose.ip.yml logs -f caddy

# 查看所有容器日志（最近100行）
docker compose -f docker-compose.ip.yml logs --tail=100
```

### 手动触发数据同步

```bash
/usr/local/sbin/signal-web-sync
```

输出 `"csvUpdated":true` 表示 CSV 历史数据已更新；`"csvUpdated":false` 表示 CSV 无变化或未配置 Cookie（正常）。

### 查看自动同步日志

```bash
tail -f /var/log/signal-web-sync.log
```

脚本仅在所有信号都同步成功时返回成功。若日志中出现 `HTTP 207`，请查看同一条 JSON 的 `results` 字段；其中的 `reason` 即为上游访问或页面解析失败原因。

---

## 三、停止服务

```bash
cd /opt/signal-web
docker compose -f docker-compose.ip.yml down
```

> 注意：`down` 不会删除数据卷，信号数据完整保留。**任何时候都不要执行 `down -v`，会删除数据卷。**

---

## 四、启动 / 重启服务

```bash
cd /opt/signal-web
docker compose -f docker-compose.ip.yml up -d
```

---

## 五、更新到最新版本

完整流程见 [README-ip.md](README-ip.md) 第 8 节。要点：先备份、给当前镜像打 `signal-web:rollback` 标签，再上传新源码构建：

```bash
cd /opt/signal-web
/usr/local/sbin/signal-web-backup
docker image tag "$(docker compose -f docker-compose.ip.yml images -q signal-web)" signal-web:rollback
# 上传并解压新版源码，保留服务器 .env、.env.backup 与数据卷
docker compose -f docker-compose.ip.yml build
docker compose -f docker-compose.ip.yml up -d
/usr/local/sbin/signal-web-sync
```

备选 pull 模式：`docker-compose.ip.pull.yml` 直接拉取 GHCR 镜像（推送 main 后 GitHub Actions 自动构建），适合不想在服务器上构建时使用。

---

## 六、敏感配置维护

敏感信息存储在 `/opt/signal-web/.env`，**不纳入 Git 版本控制**。包含 `CRON_SECRET`、`AUTH_ENCRYPTION_KEY`、`AUTH_AUDIT_PEPPER`、`AUTH_RATE_LIMIT_PEPPER`、`AI_API_KEY`、`NOWPAYMENTS_API_KEY` 等。**迁移服务器时必须原样搬运、禁止重新生成**（`AUTH_ENCRYPTION_KEY` 变更会导致已加密数据无法解密）。

### 查看当前配置

```bash
cat /opt/signal-web/.env
```

### 修改配置（如更新 Cookie）

```bash
vi /opt/signal-web/.env
```

修改后需重建容器使配置生效：

```bash
docker compose -f docker-compose.ip.yml up -d
```

### MQL5_SESSION_COOKIE

Cookie 从 MQL5.com 浏览器开发者工具 → Network → 任意请求 → Request Headers → Cookie 字段获取。有效期约数周，失效后公开指标仍每日同步，但完整交易 CSV 与收益曲线停止更新；重新配置后手动执行一次 `/usr/local/sbin/signal-web-sync`。

---

## 七、定时任务维护

通过 `/etc/cron.d/signal-web` 管理（由 `install-maintenance.sh` 安装），**不要再用 root crontab 重复添加**。当前任务：

```
30 2 * * * root /usr/local/sbin/signal-web-backup >> /var/log/signal-web-backup.log 2>&1
15 3 * * * root /usr/local/sbin/signal-web-reconcile-recharges >> /var/log/signal-web-recharge-reconcile.log 2>&1
45 3 * * * root /usr/local/sbin/signal-web-cleanup-agent >> /var/log/signal-web-agent-cleanup.log 2>&1
0 8 * * * root /usr/local/sbin/signal-web-sync >> /var/log/signal-web-sync.log 2>&1
```

> ⚠️ `/etc/cron.d/` 下的文件**必须以换行符结尾**，否则 cron 会整体拒载、所有任务静默失效（2026-09-29 曾因缺换行导致四个任务全部未执行）。修改后可用一条临时每分钟任务 + `grep CRON /var/log/syslog` 验证。

宿主机日志由 logrotate 每日轮转，保留 30 份（`/etc/logrotate.d/signal-web`）。

---

## 八、备份与恢复

- **每日 02:30** `signal-web-backup`：短暂停容器取一致快照 → `/var/backups/signal-web/`（本地保留 14 天）→ rclone 上传 OSS `aliyun-oss:sigmabot-jp-20260929/signal-web`（Bucket：新加坡，私有，开启版本控制）。
- **充值对账 03:15**、**Agent 清理 03:45**：独立于备份运行。
- **恢复**：`sudo /usr/local/sbin/signal-web-restore /var/backups/signal-web/signal-data-<时间戳>.tgz`。注意恢复会**清空当前数据卷**后导入；`.tgz` 与 `.sha256` 必须在同一目录（脚本先校验哈希）。从 OSS 恢复前先 `rclone copy` 下载到本地目录。
- 验证异地备份：`rclone lsl aliyun-oss:sigmabot-jp-20260929/signal-web`。

---

## 九、磁盘与内存维护

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

---

## 十、故障排查

| 现象 | 排查步骤 |
|---|---|
| 页面无法访问 | `docker compose -f docker-compose.ip.yml ps` 确认容器状态；安全组 80 是否放行 |
| 数据未更新 | 手动运行 `/usr/local/sbin/signal-web-sync`，检查 Cookie 是否过期 |
| 定时任务未执行 | `grep CRON /var/log/syslog`；确认 `/etc/cron.d/signal-web` 以换行符结尾 |
| 备份未上传 OSS | `tail -50 /var/log/signal-web-backup.log`；`rclone lsl aliyun-oss:sigmabot-jp-20260929/` 测连通 |
| 容器启动失败 | `docker compose -f docker-compose.ip.yml logs signal-web` |
| 镜像拉取失败 | 检查 GHCR 镜像可见性或网络（pull 模式） |
| 内存不足 OOM | `free -h` 确认 Swap；`swapon --show` |

---

## 十一、完整部署流程（首次/重装）

参见 [README-ip.md](README-ip.md)，其中包含安全组、Docker 安装、源码构建、维护任务安装与 OSS 备份配置的完整步骤。
