/** @type {import('next').NextConfig} */
const nextConfig = {
  // Minimal config to test if complex webpack optimizations are causing issues
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: false, // Disable React Strict Mode which can cause hydration issues
}

module.exports = nextConfig
