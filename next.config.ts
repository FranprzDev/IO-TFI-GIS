import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the Turbopack workspace root to this project. Without this, Next.js
  // detected a stray lockfile in a parent directory and inferred the wrong
  // root, which broke file-watching/HMR (edits never hot-reloaded).
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
