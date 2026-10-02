import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep production validation from overwriting a running development server.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // The hosted demo sits behind a platform proxy whose x-forwarded-host
  // differs from the browser origin, which otherwise makes Next 15 abort
  // every Server Action (login/signup/transactions) with digest 3928600931.
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
      allowedOrigins: ["1gvhztfrh0-4310.hosted.obvious.ai", "localhost:4310"],
    },
  },
};

export default nextConfig;
