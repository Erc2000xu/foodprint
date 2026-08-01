import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // The mark form accepts up to nine compressed WebP photos. Next's
    // default Server Action limit is 1MB, which rejects a valid photo before
    // savePlaceMark can return an inline form error.
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
