import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Required for Cloudflare Pages / next-on-pages
  output: 'standalone',
  experimental: {
    // Use React 19 features
    reactCompiler: false,
  },
}

export default nextConfig
