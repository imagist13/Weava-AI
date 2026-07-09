#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# WeaveAI — 首次 SSL 证书申请脚本
# 用法：bash init-letsencrypt.sh
# 前置：.env 中已填好 DOMAIN 与 CERTBOT_EMAIL；deploy.sh 已启动 nginx
# ─────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")"

# 加载 .env
if [ ! -f .env ]; then
  echo "❌ 找不到 .env，请先 cp .env.example .env 并填好 DOMAIN/CERTBOT_EMAIL"
  exit 1
fi
set -a; source .env; set +a

if [ -z "${DOMAIN:-}" ]; then
  echo "❌ .env 中 DOMAIN 为空"; exit 1
fi
if [ -z "${CERTBOT_EMAIL:-}" ]; then
  echo "❌ .env 中 CERTBOT_EMAIL 为空"; exit 1
fi

domains=("$DOMAIN" "www.${DOMAIN}")
rsa_key_size=4096
email="$CERTBOT_EMAIL"
staging="${CERTBOT_STAGING:-0}"

# 确保 nginx 在跑（用于响应 http-01 challenge）
if ! docker compose ps --status running nginx | grep -q nginx; then
  echo "⚠️  nginx 未运行，先启动 ..."
  docker compose up -d nginx
  sleep 3
fi

# 清理旧的 dummy 证书（如果存在），避免与真实证书冲突
echo "### 清理 dummy 证书（如有） ..."
docker compose run --rm --entrypoint sh certbot -c "
  if [ -f /etc/letsencrypt/live/${DOMAIN}/fullchain.pem ]; then
    # 只删掉自签的 dummy：通过 issuer 判断（简单起见按大小判断，dummy 只有 1 天有效期）
    if openssl x509 -in /etc/letsencrypt/live/${DOMAIN}/fullchain.pem -noout -issuer 2>/dev/null | grep -qi 'CN=${DOMAIN}'; then
      echo '删除 dummy 证书 ...'
      rm -rf /etc/letsencrypt/live/${DOMAIN} \
             /etc/letsencrypt/archive/${DOMAIN} \
             /etc/letsencrypt/renewal/${DOMAIN}.conf
    fi
  fi
" || true

echo "### 申请 Let's Encrypt 证书 for ${domains[*]} ..."
domain_args=""
for d in "${domains[@]}"; do
  domain_args="$domain_args -d $d"
done

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

echo "### 重载 nginx ..."
docker compose exec nginx nginx -s reload

echo
echo "✅ 证书申请完成"
echo "访问： https://${DOMAIN}"
