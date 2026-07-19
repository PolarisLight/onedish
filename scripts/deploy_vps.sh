#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )); then
  echo "deploy_vps.sh must run as root" >&2
  exit 1
fi

release_root=${1:?usage: deploy_vps.sh RELEASE_ROOT BUILD_ENV RUNTIME_ENV IMAGE_TAG}
build_env=${2:?usage: deploy_vps.sh RELEASE_ROOT BUILD_ENV RUNTIME_ENV IMAGE_TAG}
runtime_env=${3:?usage: deploy_vps.sh RELEASE_ROOT BUILD_ENV RUNTIME_ENV IMAGE_TAG}
image_tag=${4:?usage: deploy_vps.sh RELEASE_ROOT BUILD_ENV RUNTIME_ENV IMAGE_TAG}

test -f "$release_root/compose.production.yml"
test -f "$build_env"
test -f "$runtime_env"
test "$(stat -c '%a' "$build_env")" = "600"
test "$(stat -c '%a' "$runtime_env")" = "600"
if ss -lnt | awk '{print $4}' | grep -qx '127.0.0.1:18080'; then
  docker ps --format '{{.Names}}' | grep -qx onedish || {
    echo "port 18080 is owned by another service" >&2
    exit 1
  }
fi

cd "$release_root"
set -a
. "$build_env"
set +a
export ONEDISH_IMAGE_TAG="$image_tag"
export ONEDISH_RUNTIME_ENV_FILE="$runtime_env"

docker compose -f compose.production.yml build --pull onedish
docker compose -f compose.production.yml up -d --no-deps onedish

for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1:18080/api/health >/dev/null; then
    exit 0
  fi
  sleep 2
done

docker compose -f compose.production.yml ps onedish >&2
docker compose -f compose.production.yml logs --tail 80 onedish >&2
exit 1
