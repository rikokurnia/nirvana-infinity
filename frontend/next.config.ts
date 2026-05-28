import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Three package-lock.json files exist up the tree (repo root, Nirvana-, here),
  // so Next/Turbopack guesses the workspace root wrong. Pin it to this dir.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
