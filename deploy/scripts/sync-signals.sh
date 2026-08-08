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

response_file="$(mktemp)"
trap 'rm -f "${response_file}"' EXIT

http_status="$(curl --fail --silent --show-error \
  --connect-timeout 15 \
  --max-time 300 \
  --request POST \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  --output "${response_file}" \
  --write-out '%{http_code}' \
  "${SYNC_URL}")"

cat "${response_file}"
printf '\n'

# 同步接口在任一信号失败时返回 207。此前 curl 将 207 视为成功，导致
# cron 日志看似正常而网页一直保留旧快照。
if [ "${http_status}" != "200" ]; then
  echo "同步未完全成功（HTTP ${http_status}），请检查上方 results 中的失败原因。" >&2
  exit 1
fi
