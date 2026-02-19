import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_BOOSTER_ASSET_VERSION:
      process.env.NEXT_PUBLIC_BOOSTER_ASSET_VERSION ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      "1",
  },
};

export default nextConfig;
