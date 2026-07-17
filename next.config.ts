import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully client-side app: static export makes it deployable to any host.
  output: "export",
  // Set by the deploy workflow when hosting under a sub-path (GitHub Pages).
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
};

export default nextConfig;
