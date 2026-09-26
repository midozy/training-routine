import type { NextConfig } from 'next';

// Fully static build: the same `out/` folder is served by Vercel and bundled into the iOS app (Capacitor).
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;
