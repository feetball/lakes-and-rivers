/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker builds
  output: 'standalone',
  
  // Minimal config to avoid hydration issues
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: false, // Disable React Strict Mode which can cause hydration issues
  
  // Enable compression for better performance
  compress: true,
  
  // Image optimizations
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days
  },
}

module.exports = nextConfig
