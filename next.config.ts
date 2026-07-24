import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  // The story-image route reads vendored TTFs off disk at runtime.
  outputFileTracingIncludes: {
    "/api/story/[handle]": ["./src/assets/fonts/*.ttf"],
  },
};

export default nextConfig;
