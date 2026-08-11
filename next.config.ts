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
    // Let the client router reuse a dynamic page it rendered in the last 30
    // seconds instead of round-tripping to the server again. Every screen is
    // force-dynamic, so without this each tab tap re-rendered a page you were
    // just looking at; with it, hopping between tabs is instant and the data
    // is at most half a minute old, which for a weekly schedule is nothing.
    // Mutations still bust it: server actions call revalidatePath.
    staleTimes: { dynamic: 30 },
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
