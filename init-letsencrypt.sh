#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# WeaveAI — 首次 SSL 证书申请脚本
# 用法：bash init-letsencrypt.sh
# 前置：.env 中已填好 DOMAIN 与 CERTBOT_EMAIL
# ─────────────────────────────────────────────────────────────
set -euo pipefail

# 加载 .env
if [ ! -f .env ]; then
  echo "❌ 找不到 .env，请先 cp .env.example .env 并填好 DOMAIN/CERTBOT_EMAIL"
  exit 1
fi
set -a; source .env; set +a

domains=("$DOMAIN" "www.${DOMAIN}")
rsa_key_size=4096
data_path="./certbot"
email="$CERTBOT_EMAIL"
staging="${CERTBOT_STAGING:-0}"

if [ ! -d "$data_path/conf" ]; then
  echo "### Creating dummy certificate for $domains ..."
  path="/etc/letsencrypt/live/${DOMAIN}"
  mkdir -p "$data_path/conf/live/${DOMAIN}"
  docker compose run --rm --entrypoint "\
    openssl req -x509 -nodes -newkey rsa:$rsa_key_size -days 1 \
      -keyout '$path/privkey.pem' \
      -out '$path/fullchain.pem' \
      -subj '/CN=localhost'" certbot
  echo
fi

echo "### Removing old nginx ..."
docker compose down --remove-orphans
docker compose up -d nginx
echo

echo "### Requesting Let's Encrypt certificate for $domains ..."
# 拼接 domain args
domain_args=""
for d in "${domains[@]}"; do
  domain_args="$domain_args -d $d"
done

# 选择 staging 或 prod
case "$staging" in
  1) staging_arg="--staging" ;;
  *) staging_arg="" ;;
esac

docker compose run --rm --entrypoint "\
  certbot certonly --webroot --webroot-path=/var/www/certbot \
    $staging_arg \
    $domain_args \
    --email $email \
    --rsa-key-size $rsa_key_size \
    --agree-tos --no-eff-email --force-renewal" certbot
echo

echo "### Reloading nginx ..."
docker compose exec nginx nginx -s reload

echo
echo "✅ 证书申请完成！现在启动全栈："
echo "   docker compose up -d"
echo
echo "访问： https://${DOMAIN}"