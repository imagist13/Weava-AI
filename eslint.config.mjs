import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // vendor 第三方脚本（仓库自带 excalidraw 资源，绕过 lint）
    "public/excalidraw-assets/**",
    // 部署相关脚本（shell/yaml，不需要 eslint）
    "docker-compose*.yml",
    "Dockerfile",
    ".dockerignore",
    "deploy.sh",
    "init-letsencrypt.sh",
    "nginx/**",
  ]),
]);

export default eslintConfig;
