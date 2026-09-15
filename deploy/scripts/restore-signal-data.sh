#!/usr/bin/env sh

set -eu

if [ "$#" -ne 1 ]; then
  echo "用法：$0 /var/backups/signal-web/signal-data-YYYYMMDDTHHMMSSZ.tgz" >&2
  exit 2
fi

PROJECT_DIR="${PROJECT_DIR:-/opt/signal-web}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
BACKUP_IMAGE="${BACKUP_IMAGE:-alpine:3.22.2}"
archive_path="$1"
archive_dir="$(cd "$(dirname "${archive_path}")" && pwd)"
archive_name="$(basename "${archive_path}")"

if [ ! -r "${archive_path}" ] || [ ! -r "${archive_path}.sha256" ]; then
  echo "备份文件或对应的 .sha256 校验文件不可读。" >&2
  exit 1
fi

cd "${archive_dir}"
sha256sum -c "${archive_name}.sha256"
cd "${PROJECT_DIR}"

container_id="$(docker compose -f "${COMPOSE_FILE}" ps -a -q signal-web)"
if [ -z "${container_id}" ]; then
  echo "找不到 signal-web 容器，请先至少启动一次服务以创建数据卷。" >&2
  exit 1
fi

volume_name="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "${container_id}")"
if [ -z "${volume_name}" ]; then
  echo "无法确定 signal-web 的 /data Docker 卷。" >&2
  exit 1
fi

docker compose -f "${COMPOSE_FILE}" stop -t 30 signal-web >/dev/null
docker run --rm \
  --network none \
  -v "${volume_name}:/data" \
  -v "${archive_dir}:/backup:ro" \
  "${BACKUP_IMAGE}" \
  sh -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -xzf "/backup/$1" -C /data' sh "${archive_name}"
docker compose -f "${COMPOSE_FILE}" start signal-web >/dev/null

echo "恢复完成。请运行 docker compose -f ${COMPOSE_FILE} ps 检查健康状态。"