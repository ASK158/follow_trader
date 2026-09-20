#!/usr/bin/env sh

set -eu

PROJECT_DIR="${PROJECT_DIR:-/opt/signal-web}"
ENV_FILE="${PROJECT_DIR}/.env"
CLEANUP_URL="${CLEANUP_URL:-http://127.0.0.1:3000/api/cron/cleanup-agent}"

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
http_status="$(curl --silent --show-error --connect-timeout 15 --max-time 300 --request POST --header "Authorization: Bearer ${CRON_SECRET}" --output "${response_file}" --write-out '%{http_code}' "${CLEANUP_URL}")"
cat "${response_file}"
printf '\n'
if [ "${http_status}" != "200" ]; then
  echo "Agent 维护任务失败（HTTP ${http_status}）。" >&2
  exit 1
fi
