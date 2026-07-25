import { SignJWT } from "jose";
import { getSessionUserId } from "@/lib/session";
import { authUrl, googleConfigured } from "@/lib/gcal";
import { siteOrigin } from "@/lib/format";

export const dynamic = "force-dynamic";

function secret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me");
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return Response.redirect(`${siteOrigin()}/`, 302);
  if (!googleConfigured()) {
    return Response.redirect(`${siteOrigin()}/app?gcal=unconfigured`, 302);
  }
  // Signed, short-lived state carries the user id and doubles as CSRF proof.
  const state = await new SignJWT({ aud: "gcal", sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(secret());
  return Response.redirect(authUrl(state), 302);
}
