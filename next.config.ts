import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  // Files read off disk at runtime must be listed here or serverless
  // bundles omit them: drizzle/ (migrations run on boot, every route
  // touches the DB) and the story-image fonts.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
    "/api/story/[handle]": ["./src/assets/fonts/*.ttf"],
  },
};

export default nextConfig;
