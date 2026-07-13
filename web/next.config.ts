import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app. Without this, Next can infer the wrong
  // root when a stray lockfile exists higher up the filesystem (e.g. a global
  // pnpm-lock.yaml), which would make builds non-deterministic on Vercel.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
