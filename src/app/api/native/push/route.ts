import { cookies } from "next/headers";
import { decodeJwt } from "jose";
import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { adminEmails } from "@/lib/admin";
import { apnsConfigured } from "@/lib/apns";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function viewer() {
  const id = await getSessionUserId();
  if (!id) return null;
  const db = await getDb();
  const [user] = await db.select({ id: schema.users.id, email: schema.users.email, version: schema.users.sessionVersion }).from(schema.users).where(eq(schema.users.id, id));
  return user ? { ...user, admin: adminEmails().includes(user.email.toLowerCase()) } : null;
}
export async function GET(request: Request) {
  const me = await viewer();
  if (!me) return Response.json({ error: "Sign in to enable notifications." }, { status: 401, headers });
  const id = new URL(request.url).searchParams.get("device");
  const db = await getDb();
  const [device] = id && uuid.test(id) ? await db.select({ follows: schema.nativePushDevices.follows, messages: schema.nativePushDevices.messages, updates: schema.nativePushDevices.updates, adminActivity: schema.nativePushDevices.adminActivity })
    .from(schema.nativePushDevices).where(and(eq(schema.nativePushDevices.id, id), eq(schema.nativePushDevices.userId, me.id))) : [];
  return Response.json({ configured: apnsConfigured(), admin: me.admin, enabled: !!device, preferences: device ?? { follows: true, messages: true, updates: true, adminActivity: false } }, { headers });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.includes("application/json"))
    return Response.json({ error: "Invalid request origin." }, { status: 403, headers });
  const me = await viewer();
  if (!me) return Response.json({ error: "Sign in to enable notifications." }, { status: 401, headers });
  const raw = await request.text();
  if (raw.length > 4096) return Response.json({ error: "Invalid device." }, { status: 400, headers });
  let input;
  try { input = JSON.parse(raw); } catch { return Response.json({ error: "Invalid request." }, { status: 400, headers }); }
  if (!input || !uuid.test(input.id) || typeof input.enabled !== "boolean") return Response.json({ error: "Invalid device." }, { status: 400, headers });
  const db = await getDb();
  const jar = await cookies();
  if (!input.enabled) {
    await db.delete(schema.nativePushDevices).where(and(eq(schema.nativePushDevices.id, input.id), eq(schema.nativePushDevices.userId, me.id)));
    jar.delete("fl_push_device");
    return Response.json({ ok: true }, { headers });
  }
  if (!apnsConfigured()) return Response.json({ error: "Push notifications are not ready yet. Please try again later." }, { status: 503, headers });
  if (input.refresh === true) {
    const [existing] = await db.select().from(schema.nativePushDevices).where(and(eq(schema.nativePushDevices.id, input.id), eq(schema.nativePushDevices.userId, me.id)));
    if (!existing) return Response.json({ error: "Enable notifications first." }, { status: 409, headers });
    input.preferences = { follows: existing.follows, messages: existing.messages, updates: existing.updates, adminActivity: me.admin && existing.adminActivity };
  }
  if (typeof input.token !== "string" || !/^[0-9a-f]{64,256}$/i.test(input.token)
    || !input.preferences || (input.preferences.updates !== undefined && typeof input.preferences.updates !== "boolean") || ["follows", "messages", "adminActivity"].some(k => typeof input.preferences[k] !== "boolean"))
    return Response.json({ error: "Invalid device settings." }, { status: 400, headers });
  if (input.preferences.adminActivity && !me.admin) return Response.json({ error: "Not authorized." }, { status: 403, headers });
  const [prior] = await db.select({ updates: schema.nativePushDevices.updates }).from(schema.nativePushDevices).where(and(eq(schema.nativePushDevices.id, input.id), eq(schema.nativePushDevices.userId, me.id)));
  // Older builds omit this preference; retain an existing opt-out.
  const updates = input.preferences.updates ?? prior?.updates ?? true;
  // The session has already been verified by viewer(); use its actual expiry.
  const token = jar.get("fl_session")!.value;
  const exp = decodeJwt(token).exp!;
  const values = { userId: me.id, token: input.token.toLowerCase(), sessionVersion: me.version, expiresAt: new Date(exp * 1000),
    follows: input.preferences.follows, messages: input.preferences.messages, updates, adminActivity: me.admin && input.preferences.adminActivity, updatedAt: new Date() };
  await db.transaction(async tx => {
    // Reinstallation or account switching must not leave a second owner of the same APNs token.
    await tx.delete(schema.nativePushDevices).where(and(eq(schema.nativePushDevices.token, values.token), ne(schema.nativePushDevices.id, input.id)));
    if (input.refresh === true) {
      await tx.update(schema.nativePushDevices).set({ token: values.token, sessionVersion: values.sessionVersion, expiresAt: values.expiresAt, updatedAt: values.updatedAt }).where(and(eq(schema.nativePushDevices.id, input.id), eq(schema.nativePushDevices.userId, me.id)));
    } else {
      await tx.insert(schema.nativePushDevices).values({ id: input.id, ...values }).onConflictDoUpdate({ target: schema.nativePushDevices.id, set: values });
    }
  });
  jar.set("fl_push_device", input.id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: Math.max(0, exp - Math.floor(Date.now() / 1000)) });
  return Response.json({ ok: true }, { headers });
}
