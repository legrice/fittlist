import { SignJWT } from "jose";
import { appleAuthUrl, appleConfigured } from "@/lib/apple";
import { siteOrigin } from "@/lib/format";
import { sessionSecret } from "@/lib/secret";

export const dynamic = "force-dynamic";

function secret() {
  return sessionSecret();
}

// "Continue with Apple" from the login screen. The signed state doubles as CSRF
// proof and carries the growth-loop attribution through to the claim step.
export async function GET(req: Request) {
  if (!appleConfigured()) return Response.redirect(`${siteOrigin()}/`, 302);
  const via = new URL(req.url).searchParams.get("via")?.trim() || "";
  const state = await new SignJWT({ aud: "apple-login", via })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(secret());
  return Response.redirect(appleAuthUrl(state), 302);
}
