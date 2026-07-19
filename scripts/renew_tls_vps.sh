#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )); then
  echo "renew_tls_vps.sh must run as root" >&2
  exit 1
fi

domain=onedish.cyhao.space
letsencrypt_root=/opt/onedish/letsencrypt
source_dir="$letsencrypt_root/live/$domain"
certificate_dir="/opt/1panel/apps/openresty/openresty/conf/ssl/$domain"
openresty_container=1Panel-openresty-t0Tg

current_hash=missing
if [[ -f "$certificate_dir/fullchain.pem" && -f "$certificate_dir/privkey.pem" ]]; then
  current_hash=$(cat "$certificate_dir/fullchain.pem" "$certificate_dir/privkey.pem" | sha256sum | awk '{print $1}')
fi

docker run --rm \
  -v /opt/1panel/www/acme:/var/www/acme \
  -v "$letsencrypt_root":/etc/letsencrypt \
  certbot/certbot:latest renew --quiet

openssl x509 -in "$source_dir/fullchain.pem" -checkend 86400 -noout
renewed_hash=$(cat "$source_dir/fullchain.pem" "$source_dir/privkey.pem" | sha256sum | awk '{print $1}')
if [[ "$renewed_hash" == "$current_hash" ]]; then
  exit 0
fi

install -d -m 700 -o root -g root "$certificate_dir"
install -m 644 -o root -g root "$(readlink -f "$source_dir/fullchain.pem")" "$certificate_dir/fullchain.pem.new"
install -m 600 -o root -g root "$(readlink -f "$source_dir/privkey.pem")" "$certificate_dir/privkey.pem.new"
mv -f "$certificate_dir/fullchain.pem.new" "$certificate_dir/fullchain.pem"
mv -f "$certificate_dir/privkey.pem.new" "$certificate_dir/privkey.pem"

docker exec "$openresty_container" openresty -t
docker exec "$openresty_container" openresty -s reload
