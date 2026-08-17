import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { nextAvatarColor } from "@/lib/avatar-server";
import { appleConfigured, appleEmail, appleExchange } from "@/lib/apple";
import { createSession } from "@/lib/session";
import { acceptInvite, signupAllowed } from "@/lib/invites";
import { pushSignupPing } from "@/lib/push";
import { siteOrigin } from "@/lib/format";
import { landingHref } from "@/lib/flags";
import { sessionSecret } from "@/lib/secret";
import { signupSource } from "@/lib/attribution";

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
  if (form.get("error") || !code || !state) return toLogin("autherror=1");

  let via = "";
  try {
    const { payload } = await jwtVerify(state, secret());
    if (payload.aud !== "apple-login") return toLogin("autherror=1");
    via = typeof payload.via === "string" ? payload.via : "";
  } catch {
    return toLogin("autherror=1");
  }

  const tokens = await appleExchange(code);
  const email = (await appleEmail(tokens.id_token))?.toLowerCase();
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
  await createSession(user.id);
  if (!user.handle) return toLogin(via ? `via=${encodeURIComponent(via)}` : "");
  return Response.redirect(`${siteOrigin()}${await landingHref()}`, 302);
}
