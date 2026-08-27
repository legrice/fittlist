import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, schema } from "@/db";
import { nextAvatarColor } from "@/lib/avatar-server";
import { appleConfigured, appleExchange, appleIdentity } from "@/lib/apple";
import { createSession } from "@/lib/session";
import { acceptInvite, signupAllowed } from "@/lib/invites";
import { pushSignupPing } from "@/lib/push";
import { siteOrigin } from "@/lib/format";
import { fansEnabled, landingHref } from "@/lib/flags";
import { sessionSecret } from "@/lib/secret";
import { signupSource } from "@/lib/attribution";
import { claimRosterPlaceholders } from "@/lib/roster";
import { APPLE_LOGIN_STATE_COOKIE, oauthStateMatches } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

function secret() {
  return sessionSecret();
}

const toLogin = (q: string) => Response.redirect(`${siteOrigin()}/${q ? `?${q}` : ""}`, 302);

// Apple posts the result here (response_mode=form_post). Verify our state,
// exchange the code for an id_token, then find-or-create the trainer by email
// and start their session.
export async function POST(req: Request) {
  if (!appleConfigured()) return toLogin("autherror=1");
  const form = await req.formData();
  const state = String(form.get("state") ?? "");
  const code = String(form.get("code") ?? "");
  if (!state) return toLogin("autherror=1");

  const jar = await cookies();
  const expectedState = jar.get(APPLE_LOGIN_STATE_COOKIE)?.value;
  jar.set(APPLE_LOGIN_STATE_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/api/apple/callback",
    maxAge: 0,
  });
  if (!oauthStateMatches(expectedState, state)) return toLogin("autherror=1");
  if (form.get("error") || !code) return toLogin("autherror=1");

  let via = "";
  try {
    const { payload } = await jwtVerify(state, secret());
    if (payload.aud !== "apple-login") return toLogin("autherror=1");
    via = typeof payload.via === "string" ? payload.via : "";
  } catch {
    return toLogin("autherror=1");
  }

  const tokens = await appleExchange(code);
  const identity = await appleIdentity(tokens.id_token);
  if (!identity) return toLogin("autherror=1");

  const db = await getDb();
  const [linked] = await db
    .select({ userId: schema.appleIdentities.userId })
    .from(schema.appleIdentities)
    .where(eq(schema.appleIdentities.subject, identity.subject));
  let [user] = linked
    ? await db.select().from(schema.users).where(eq(schema.users.id, linked.userId))
    : identity.email
      ? await db.select().from(schema.users).where(eq(schema.users.email, identity.email))
      : [];
  if (!user) {
    const email = identity.email;
    if (!email) return toLogin("autherror=1");
    if (!(await signupAllowed(email))) return toLogin("invite=1");
    [user] = await db.insert(schema.users)
      .values({
        email,
        kind: fansEnabled() ? "fan" : "coach",
        discoverable: false,
        avatarColor: await nextAvatarColor(),
        signupSource: await signupSource(),
      })
      .returning();
    pushSignupPing(email); // fire and forget
    await acceptInvite(email, user.id);
    await claimRosterPlaceholders(email, user.id);
    [user] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  }
  await db
    .insert(schema.appleIdentities)
    .values({ subject: identity.subject, userId: user.id, email: identity.email })
    .onConflictDoUpdate({
      target: schema.appleIdentities.subject,
      set: { userId: user.id, email: identity.email, updatedAt: new Date() },
    });
  await createSession(user.id);
  if (!user.handle) return toLogin(via ? `via=${encodeURIComponent(via)}` : "");
  return Response.redirect(`${siteOrigin()}${await landingHref()}`, 302);
}
