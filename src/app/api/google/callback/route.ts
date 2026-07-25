import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCode, emailFromIdToken, syncUserToGoogle, googleConfigured } from "@/lib/gcal";
import { siteOrigin } from "@/lib/format";

export const dynamic = "force-dynamic";

function secret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me");
}

const back = (q: string) => Response.redirect(`${siteOrigin()}/app?gcal=${q}`, 302);

export async function GET(req: Request) {
  if (!googleConfigured()) return back("unconfigured");
  const url = new URL(req.url);
  if (url.searchParams.get("error")) return back("denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back("error");

  // verify the signed state -> the user who started the flow
  let userId: string;
  try {
    const { payload } = await jwtVerify(state, secret());
    if (payload.aud !== "gcal" || typeof payload.sub !== "string") return back("error");
    userId = payload.sub;
  } catch {
    return back("error");
  }

  const tokens = await exchangeCode(code);
  if (!tokens.refresh_token) {
    // No refresh token (e.g. previously granted without prompt=consent).
    return back("noretoken");
  }

  const db = await getDb();
  await db
    .insert(schema.googleConnections)
    .values({
      userId,
      refreshToken: encryptSecret(tokens.refresh_token),
      email: emailFromIdToken(tokens.id_token),
      syncedEventIds: [],
    })
    .onConflictDoUpdate({
      target: schema.googleConnections.userId,
      set: {
        refreshToken: encryptSecret(tokens.refresh_token),
        email: emailFromIdToken(tokens.id_token),
        updatedAt: new Date(),
      },
    });

  // push the current schedule immediately
  try {
    await syncUserToGoogle(userId);
  } catch (err) {
    console.error("initial gcal sync failed", err);
  }

  return back("connected");
}
