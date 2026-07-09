import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone 输出：Docker 镜像更小（不带 node_modules、不带 devDeps）
  output: "standalone",

  reactStrictMode: true,
  // 允许 Dockerfile 构建时通过跨域 env 注入
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    // 与父目录同时存在 pnpm-lock.yaml，Next.js 会误判根目录；
    // 显式指定后消除警告
    root: process.cwd(),
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https:",
              "connect-src 'self' https:",
              "frame-src 'none'",
            ].join('; '),
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
