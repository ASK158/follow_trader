#!/usr/bin/env bash
# 在服务器上逐步粘贴执行，或整段执行

# === 步骤 1：重建应用容器 ===
cd /opt/signal-web
docker compose -f docker-compose.ip.pull.yml up -d --force-recreate signal-web
sleep 10

# === 步骤 2：测试新 Cookie 是否有效 ===
COOKIE=$(sed -n 's/^MQL5_SESSION_COOKIE=//p' .env | tr -d '\r' | head -n 1)

curl -sS -o /tmp/mql5-export-test.out \
  -w 'HTTP状态=%{http_code} 内容类型=%{content_type} 大小=%{size_download}\n' \
  -H "Cookie: ${COOKIE}" \
  -H 'User-Agent: Mozilla/5.0' \
  --connect-timeout 15 --max-time 60 \
  'https://www.mql5.com/en/signals/2265877/export/positions'

echo '--- 返回内容前2行 ---'
head -n 2 /tmp/mql5-export-test.out

# === 步骤 3：执行完整同步 ===
/usr/local/sbin/signal-web-sync
echo "同步退出码=$?"

# === 步骤 4：验证 CSV 是否刷新 ===
CID=$(docker compose -f /opt/signal-web/docker-compose.ip.pull.yml ps -q signal-web)
docker exec "$CID" sh -c 'find /data/positions -type f -name "*.csv" -exec stat -c "%n | %y | %s bytes" {} \;'
