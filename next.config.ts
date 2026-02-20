import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins: ["https://beautyhub.art", "https://www.beautyhub.art"],
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.devtool = "source-map";
    }

    return config;
  },
};

export default nextConfig;
