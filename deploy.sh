#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# WeaveAI — 一键部署脚本（在云服务器上执行）
# 用法：bash deploy.sh [--ssl]
#   --ssl    同时申请并启用 Let's Encrypt 证书（否则用自签 dummy 证书）
# ─────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")"

WITH_SSL=0
for arg in "$@"; do
  case "$arg" in
    --ssl) WITH_SSL=1 ;;
    *) echo "未知参数：$arg"; exit 1 ;;
  esac
done

echo "═══════════════════════════════════════════════"
echo "  WeaveAI · 部署"
echo "═══════════════════════════════════════════════"

# ── 1. 检查 Docker ──
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ 未安装 docker，请先安装：curl -fsSL https://get.docker.com | sh"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "❌ 未安装 docker compose plugin"
  exit 1
fi

# ── 2. 检查 .env ──
if [ ! -f .env ]; then
  echo "📋 生成 .env ..."
  cp .env.example .env
  echo "⚠️  请编辑 .env 填入真实配置（特别是 DOMAIN 和 CERTBOT_EMAIL）后重试"
  exit 1
fi

set -a; source .env; set +a
if [ -z "${DOMAIN:-}" ]; then
  echo "❌ .env 中 DOMAIN 为空"
  exit 1
fi

echo "✓ DOMAIN = $DOMAIN"

# ── 3. 构建镜像 ──
echo "🐳 构建应用镜像 ..."
docker compose build app

# ── 4. 确保证书目录/文件存在（nginx 启动前置条件） ──
echo "🔐 检查/生成 dummy 证书（供 nginx 首次启动） ..."
docker volume create weaveai-certbot-conf >/dev/null
docker volume create weaveai-certbot-www >/dev/null

# 用一个临时 alpine 容器检查并生成自签证书（挂载到最终的 volume 上）
docker run --rm \
  -e DOMAIN="$DOMAIN" \
  -v weaveai-certbot-conf:/etc/letsencrypt \
  alpine sh -c '
    set -e
    LIVE="/etc/letsencrypt/live/$DOMAIN"
    if [ -f "$LIVE/fullchain.pem" ] && [ -f "$LIVE/privkey.pem" ]; then
      echo "已存在证书，跳过 dummy 生成"
      exit 0
    fi
    apk add --no-cache openssl >/dev/null
    mkdir -p "$LIVE"
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout "$LIVE/privkey.pem" \
      -out   "$LIVE/fullchain.pem" \
      -subj "/CN=$DOMAIN" >/dev/null 2>&1
    echo "已生成 dummy 证书 → $LIVE"
  '

# ── 5. 启动 ──
echo "🚀 启动服务 ..."
docker compose up -d

# ── 6. 可选：申请正式 SSL 证书 ──
if [ "$WITH_SSL" = "1" ]; then
  echo "🔐 申请 Let's Encrypt 证书 ..."
  bash init-letsencrypt.sh
fi

# ── 7. 等待并打印状态 ──
sleep 5
echo
echo "═══════════════════════════════════════════════"
echo "  容器状态"
echo "═══════════════════════════════════════════════"
docker compose ps

echo
echo "═══════════════════════════════════════════════"
echo "  访问地址"
echo "═══════════════════════════════════════════════"
if [ "$WITH_SSL" = "1" ]; then
  echo "  https://${DOMAIN}"
else
  echo "  http://${DOMAIN}   （浏览器会因为自签证书告警，请用 --ssl 申请正式证书）"
fi
echo
echo "后续操作："
echo "  查看日志：    docker compose logs -f"
echo "  重启服务：    docker compose restart"
echo "  停止服务：    docker compose down"
echo "  申请 SSL：    bash deploy.sh --ssl"
