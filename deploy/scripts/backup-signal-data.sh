#!/usr/bin/env sh

set -eu

PROJECT_DIR="${PROJECT_DIR:-/opt/signal-web}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-${PROJECT_DIR}/.env.backup}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/signal-web}"
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-14}"
BACKUP_IMAGE="${BACKUP_IMAGE:-alpine:3.22.2}"

if [ -r "${BACKUP_ENV_FILE}" ]; then
  # shellcheck disable=SC1090
  . "${BACKUP_ENV_FILE}"
fi

cd "${PROJECT_DIR}"
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

container_id="$(docker compose -f "${COMPOSE_FILE}" ps -a -q signal-web)"
if [ -z "${container_id}" ]; then
  echo "找不到 signal-web 容器，请先至少启动一次服务。" >&2
  exit 1
fi

volume_name="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "${container_id}")"
if [ -z "${volume_name}" ]; then
  echo "无法确定 signal-web 的 /data Docker 卷。" >&2
  exit 1
fi

was_running="$(docker inspect --format '{{.State.Running}}' "${container_id}")"
restart_application() {
  if [ "${was_running}" = "true" ]; then
    docker compose -f "${COMPOSE_FILE}" start signal-web >/dev/null
  fi
}
trap restart_application EXIT HUP INT TERM

if [ "${was_running}" = "true" ]; then
  docker compose -f "${COMPOSE_FILE}" stop -t 30 signal-web >/dev/null
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive_name="signal-data-${timestamp}.tgz"
archive_path="${BACKUP_DIR}/${archive_name}"

docker run --rm \
  --network none \
  --read-only \
  -v "${volume_name}:/source:ro" \
  -v "${BACKUP_DIR}:/backup" \
  "${BACKUP_IMAGE}" \
  tar -czf "/backup/${archive_name}.partial" -C /source .
mv "${archive_path}.partial" "${archive_path}"
(cd "${BACKUP_DIR}" && sha256sum "${archive_name}" > "${archive_name}.sha256")

restart_application
was_running="false"
trap - EXIT HUP INT TERM

if [ -n "${RCLONE_REMOTE:-}" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "已生成本地备份，但未安装 rclone，异地上传失败。" >&2
    exit 1
  fi
  rclone copyto "${archive_path}" "${RCLONE_REMOTE%/}/${archive_name}" --checksum
  rclone copyto "${archive_path}.sha256" "${RCLONE_REMOTE%/}/${archive_name}.sha256" --checksum
else
  echo "警告：未配置 RCLONE_REMOTE，本次仅生成本地备份。" >&2
fi

find "${BACKUP_DIR}" -type f \( -name 'signal-data-*.tgz' -o -name 'signal-data-*.tgz.sha256' \) \
  -mtime "+${LOCAL_RETENTION_DAYS}" -delete

echo "备份完成：${archive_path}"