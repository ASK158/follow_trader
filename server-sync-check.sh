#!/usr/bin/env bash
set -u

cd /opt/signal-web || exit 1

echo "=== 1. 检查 CRON_SECRET 是否一致（不显示密钥） ==="
CID=$(docker compose -f docker-compose.ip.pull.yml ps -q signal-web)
H=$(sed -n 's/^CRON_SECRET=//p' .env | tr -d '\r' | head -n 1)
C=$(docker exec "$CID" printenv CRON_SECRET 2>/dev/null)

echo "主机长度=${#H}，容器长度=${#C}"
if [ "$H" = "$C" ]; then
  echo "结果：一致"
else
  echo "结果：不一致"
  echo "=== 2. 重建应用容器（不会删除数据卷） ==="
  docker compose -f docker-compose.ip.pull.yml up -d --force-recreate signal-web
  sleep 10
fi

echo "=== 3. 再次测试同步 ==="
/usr/local/sbin/signal-web-sync
code=$?
echo "同步退出码=$code"
exit "$code"
