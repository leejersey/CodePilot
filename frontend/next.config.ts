import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pyodide 从 CDN 动态加载，不需要特殊 webpack/turbopack 配置
  // 服务端渲染时排除 pyodide
  serverExternalPackages: ["pyodide"],
  turbopack: {},
};

export default nextConfig;
