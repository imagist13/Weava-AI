# ─────────────────────────────────────────────────────────────
# WeaveAI — Production Dockerfile
# 多阶段构建：deps → build → runner
# 镜像基于 node:20-alpine（含 build-base 以支持 better-sqlite3 原生编译）
# ─────────────────────────────────────────────────────────────

# 1. 依赖安装层（仅缓存 lockfile + deps）
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# 优先复制 lockfile，最大化缓存命中
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN \
  if [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  elif [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  else echo "Lockfile not found." && exit 1; \
  fi

# 2. 构建层
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 关闭 telemetry & 跳过 lint，加快构建
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_DISABLE_ESLINT=1
ENV NODE_ENV=production

RUN \
  if [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  elif [ -f yarn.lock ]; then yarn build; \
  else npm run build; \
  fi

# 3. 生产运行层（standalone 输出，体积小）
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 创建非 root 用户运行
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# standalone 输出目录 + 静态资源 + public
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# SQLite 数据目录（持久化用 docker volume 挂载进来）
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]