import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
  },
  images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: '*.public.blob.vercel-storage.com', // Vercel Blob Storage
          port: '',
          pathname: '/**',
        },
        // Add other image hosts if needed
        {
          protocol: 'https',
          hostname: 'avatar.vercel.sh',
        },
      ],
    },
};

export default nextConfig;
