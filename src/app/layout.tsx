import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "WeaveAI · 用 AI 编织你的画布",
  description: "WeaveAI — 在 Excalidraw 画布上用自然语言与 AI 对话，自动生成、改写并连接提示词。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        {/* 引入 DM Sans 字体 - 现代、优雅、可读性强 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body>
        {/* 设置 Excalidraw 资源路径为本地 /excalidraw-assets/ 目录 */}
        <Script id="excalidraw-config" strategy="beforeInteractive">
          {`window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";`}
        </Script>
        {children}
      </body>
    </html>
  );
}
