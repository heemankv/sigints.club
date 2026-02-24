/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
  },
  async rewrites() {
    const backend = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001").replace(/\/$/, "");
    return [
      {
        source: "/actions/:path*",
        destination: `${backend}/actions/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
