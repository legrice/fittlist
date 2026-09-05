import { siteOrigin } from "@/lib/format";

/** Email sign-in must stay on the deployment that issued the token. Only
 * platform configuration can select a preview host, never request headers. */
export function authOrigin(): string {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    const host = process.env.VERCEL_URL;
    if (/^[a-z0-9-]+\.vercel\.app$/i.test(host)) return `https://${host}`;
  }
  return siteOrigin();
}
