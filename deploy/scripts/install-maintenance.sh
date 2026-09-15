#!/usr/bin/env sh

set -eu

PROJECT_DIR="${PROJECT_DIR:-/opt/signal-web}"

if [ "$(id -u)" -ne 0 ]; then
  echo "请以 root 身份运行此安装脚本。" >&2
  exit 1
fi

install -m 750 "${PROJECT_DIR}/deploy/scripts/sync-signals.sh" /usr/local/sbin/signal-web-sync
install -m 750 "${PROJECT_DIR}/deploy/scripts/backup-signal-data.sh" /usr/local/sbin/signal-web-backup
install -m 750 "${PROJECT_DIR}/deploy/scripts/restore-signal-data.sh" /usr/local/sbin/signal-web-restore
install -m 644 "${PROJECT_DIR}/deploy/signal-web.cron" /etc/cron.d/signal-web
install -m 644 "${PROJECT_DIR}/deploy/signal-web.logrotate" /etc/logrotate.d/signal-web

echo "维护任务已安装。下一步请配置 ${PROJECT_DIR}/.env.backup，并手动执行 signal-web-backup 验证。"