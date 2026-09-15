import type { NextConfig } from "next";

const deploymentId = process.env.DEPLOYMENT_VERSION?.trim();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  deploymentId: deploymentId || undefined,
};

export default nextConfig;
