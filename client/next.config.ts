import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack:{},
  // Puzzle SDK is ESM-only ("type": "module"). transpilePackages tells Next.js
  // to run these through Webpack/SWC instead of trying to require() them as CJS.
  transpilePackages: [
    '@puzzlehq/sdk',
    '@puzzlehq/sdk-core',
    '@puzzlehq/types',
  ],
  webpack(config, { isServer }) {
    if (isServer) {
      // Puzzle SDK uses `ws` for WebSocket subscriptions — only meaningful in the browser.
      // Stub it out on the server to prevent SSR build errors.
      config.resolve.alias = {
        ...config.resolve.alias,
        ws: false,
      };
    }
    return config;
  },
};

export default nextConfig;
