import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins: ["https://beautyhub.art", "https://www.beautyhub.art"],
};

export default nextConfig;
