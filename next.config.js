/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker builds
  output: 'standalone',
  
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  reactStrictMode: true,
  
  // Enable compression for better performance
  compress: true,
  
  // Image optimizations
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days
  },
}

module.exports = nextConfig
