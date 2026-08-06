#!/usr/bin/env sh

set -eu

PROJECT_DIR="${PROJECT_DIR:-/opt/signal-web}"
ENV_FILE="${PROJECT_DIR}/.env"
SYNC_URL="${SYNC_URL:-http://127.0.0.1:3000/api/cron/sync-signals}"

if [ ! -r "${ENV_FILE}" ]; then
  echo "无法读取服务器环境文件：${ENV_FILE}" >&2
  exit 1
fi

CRON_SECRET="$(sed -n 's/^CRON_SECRET=//p' "${ENV_FILE}" | tr -d '\r' | head -n 1)"
if [ -z "${CRON_SECRET}" ]; then
  echo "CRON_SECRET 未在 ${ENV_FILE} 中配置" >&2
  exit 1
fi

curl --fail --silent --show-error \
  --connect-timeout 15 \
  --max-time 300 \
  --request POST \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  "${SYNC_URL}"
printf '\n'
