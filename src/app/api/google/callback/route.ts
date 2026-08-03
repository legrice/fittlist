import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { nextAvatarColor } from "@/lib/avatar-server";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCode, emailFromIdToken, syncUserToGoogle, googleConfigured } from "@/lib/gcal";
import { createSession } from "@/lib/session";
import { acceptInvite, signupAllowed } from "@/lib/invites";
import { pushSignupPing } from "@/lib/push";
import { siteOrigin } from "@/lib/format";
import { fansEnabled, landingHref } from "@/lib/flags";
import { sessionSecret } from "@/lib/secret";
import { signupSource } from "@/lib/attribution";

export const dynamic = "force-dynamic";

function secret() {
  return sessionSecret();
}

// The Google Calendar rows live on the You tab, so the connect flow lands
// back there with its verdict in the query.
const back = (q: string) => Response.redirect(`${siteOrigin()}/you?gcal=${q}`, 302);
const toLogin = (q: string) => Response.redirect(`${siteOrigin()}/?${q}`, 302);

// Persist (or refresh) the calendar connection when a refresh token comes back,
// then push the current schedule. Shared by both the connect and login flows.
async function storeCalendar(userId: string, refreshToken: string, email: string | null) {
  const db = await getDb();
  await db
    .insert(schema.googleConnections)
    .values({ userId, refreshToken: encryptSecret(refreshToken), email, syncedEventIds: [] })
    .onConflictDoUpdate({
      target: schema.googleConnections.userId,
      set: { refreshToken: encryptSecret(refreshToken), email, updatedAt: new Date() },
    });
  try {
    await syncUserToGoogle(userId);
  } catch (err) {
    console.error("initial gcal sync failed", err);
  }
}

export async function GET(req: Request) {
  if (!googleConfigured()) return back("unconfigured");
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  if (!state) return back("error");

  // Verify the signed state and learn which flow this is.
  let aud: unknown;
  let sub: unknown;
  let via = "";
  try {
    const { payload } = await jwtVerify(state, secret());
    aud = payload.aud;
    sub = payload.sub;
    via = typeof payload.via === "string" ? payload.via : "";
  } catch {
    return back("error");
  }

  const isLogin = aud === "google-login";
  if (url.searchParams.get("error")) {
    return isLogin ? toLogin("autherror=1") : back("denied");
  }
  const code = url.searchParams.get("code");
  if (!code) return isLogin ? toLogin("autherror=1") : back("error");

  const tokens = await exchangeCode(code);

  // ---- "Continue with Google": identify the trainer, log them in, and wire up
  // calendar sync if they granted it in the same consent.
  if (isLogin) {
    const email = emailFromIdToken(tokens.id_token)?.toLowerCase();
    if (!email) return toLogin("autherror=1");
    const db = await getDb();
    let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (!user) {
      if (!(await signupAllowed(email))) return toLogin("invite=1");
      [user] = await db.insert(schema.users)
      .values({ email, avatarColor: await nextAvatarColor(), signupSource: await signupSource() })
      .returning();
      pushSignupPing(email); // fire and forget
      await acceptInvite(email, user.id);
    }
    if (tokens.refresh_token) await storeCalendar(user.id, tokens.refresh_token, email);
    await createSession(user.id);
    if (!user.handle) return toLogin(via ? `via=${encodeURIComponent(via)}` : "");
    return Response.redirect(`${siteOrigin()}${fansEnabled() ? await landingHref() : "/app"}`, 302);
  }

  // ---- calendar connect flow (started while logged in): sub is the user id.
  if (aud !== "gcal" || typeof sub !== "string") return back("error");
  if (!tokens.refresh_token) return back("noretoken");
  await storeCalendar(sub, tokens.refresh_token, emailFromIdToken(tokens.id_token));
  return back("connected");
}
