import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',
  
  // Environment variables that should be available at runtime
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://backend:4001',
  },
  
  // Optimize for production
  compress: true,
  
  // ESLint configuration for builds
  eslint: {
    // Ignore ESLint during production builds
    ignoreDuringBuilds: true,
  },
  
  // TypeScript configuration
  typescript: {
    // Ignore TypeScript errors during production builds (for Docker)
    ignoreBuildErrors: process.env.NODE_ENV === 'production',
  },
  
  // Enable experimental features if needed
  experimental: {
    // Add any experimental features here
  },
};

export default nextConfig;
