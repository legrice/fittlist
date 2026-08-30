import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        destination: "/api/apple-app-site-association",
      },
    ];
  },
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // Profile originals are resized in the browser before this request. The
    // sharper hero source can legitimately pass Next's 1MB default once it is
    // base64 encoded; the action validates the image again before storage.
    serverActions: { bodySizeLimit: "3mb" },
    // Keep recently visited dynamic routes in the browser's in-memory working
    // set. Five minutes is long enough for normal tab/profile hopping to feel
    // immediate without persisting private pages to disk. Mutations still bust
    // affected entries through revalidatePath/router.refresh; action-loaded
    // sheets use the account-scoped stale-while-refresh cache alongside this.
    staleTimes: { dynamic: 300 },
  },
  // Files read off disk at runtime must be listed here or serverless
  // bundles omit them: drizzle/ (migrations run on boot, every route
  // touches the DB) and the story-image fonts.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
    "/api/story/[handle]": ["./src/assets/fonts/*.ttf"],
  },
};

export default nextConfig;
