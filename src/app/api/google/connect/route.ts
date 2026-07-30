import { SignJWT } from "jose";
import { getSessionUserId } from "@/lib/session";
import { authUrl, googleConfigured } from "@/lib/gcal";
import { siteOrigin } from "@/lib/format";
import { sessionSecret } from "@/lib/secret";

export const dynamic = "force-dynamic";

function secret() {
  return sessionSecret();
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
