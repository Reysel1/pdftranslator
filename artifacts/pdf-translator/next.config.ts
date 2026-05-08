import type { NextConfig } from "next";

const rawBase = process.env.BASE_PATH?.trim();
const basePath =
  rawBase && rawBase !== "/" ? rawBase.replace(/\/$/, "") : undefined;

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  serverExternalPackages: ["pdfjs-dist", "pdf-lib"],
};

export default nextConfig;
