import type { NextConfig } from 'next';

// Fully static build: the same `out/` folder is served by Vercel and bundled into the iOS app (Capacitor).
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // Dev only: lets a phone on the same Wi-Fi load http://<your-mac-ip>:3000 (Next 16 blocks other hosts by default).
  allowedDevOrigins: ['10.56.56.25', '10.*.*.*', '192.168.*.*'],
};
export default nextConfig;
