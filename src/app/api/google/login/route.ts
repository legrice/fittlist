import { SignJWT } from "jose";
import { authUrlLogin, googleConfigured } from "@/lib/gcal";
import { siteOrigin } from "@/lib/format";
import { sessionSecret } from "@/lib/secret";

export const dynamic = "force-dynamic";

function secret() {
  return sessionSecret();
}

// "Continue with Google" from the login screen. No session yet; the signed
// state marks this as a login (vs the calendar-connect flow) and carries the
// growth-loop attribution through to the claim step.
export async function GET(req: Request) {
  if (!googleConfigured()) return Response.redirect(`${siteOrigin()}/`, 302);
  const via = new URL(req.url).searchParams.get("via")?.trim() || "";
  const state = await new SignJWT({ aud: "google-login", via })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(secret());
  return Response.redirect(authUrlLogin(state), 302);
}
