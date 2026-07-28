import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { recurrenceLines } from "@/lib/ics";
import { decryptSecret } from "@/lib/crypto";
import { mondayOfCurrentWeek, siteOrigin } from "@/lib/format";

// One-way mirror: fittlist classes -> the trainer's Google Calendar. Weekly
// classes become recurring events; one-offs single events. On every schedule
// change we clear the events we previously created and repopulate, so their
// personal events are never touched.

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];


export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(): string {
  return `${siteOrigin()}/api/google/callback`;
}

export function authUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // ask for a refresh token
    prompt: "consent", // force the refresh token even on re-connect
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH}?${p.toString()}`;
}

// "Continue with Google" for sign-in. Same redirect + token exchange as the
// calendar connect, but the consent also carries profile + calendar scope, so
// one tap can log a trainer in AND wire up calendar sync. We don't force
// prompt=consent here, so returning logins stay a single tap; the granular
// consent screen still lets a new user skip calendar and just sign in.
const LOGIN_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
];

export function authUrlLogin(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: LOGIN_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "select_account",
    state,
  });
  return `${AUTH}?${p.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
};

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  return res.json();
}

async function accessTokenFrom(refreshToken: string): Promise<string | null> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as TokenResponse;
  return json.access_token ?? null;
}

/** best-effort decode of the id_token payload for the account email */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-07-20" + "06:00" (+mins) -> local "YYYY-MM-DDTHH:MM:SS" (no offset) */
function localDateTime(dateStr: string, hhmm: string, addMin = 0): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCHours(h, m + addMin, 0, 0);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`
  );
}

/** Rebuild all fittlist-created events in the trainer's calendar. Safe to call
    often; silently no-ops when the trainer hasn't connected. */
export async function syncUserToGoogle(userId: string): Promise<void> {
  if (!googleConfigured()) return;
  const db = await getDb();
  const [conn] = await db
    .select()
    .from(schema.googleConnections)
    .where(eq(schema.googleConnections.userId, userId));
  if (!conn) return;

  const token = await accessTokenFrom(decryptSecret(conn.refreshToken));
  if (!token) {
    // refresh token revoked/expired - drop the connection so the UI resets
    await db.delete(schema.googleConnections).where(eq(schema.googleConnections.userId, userId));
    return;
  }
  const auth = { authorization: `Bearer ${token}` };

  // calendar timezone so floating "6:00a" lands in the trainer's local time
  let tz = conn.timeZone;
  if (!tz) {
    try {
      const cal = await fetch(CAL, { headers: auth }).then((r) => r.json());
      tz = cal.timeZone || "UTC";
    } catch {
      tz = "UTC";
    }
  }

  // clear the events we created last time
  for (const id of conn.syncedEventIds) {
    try {
      await fetch(`${CAL}/events/${encodeURIComponent(id)}`, { method: "DELETE", headers: auth });
    } catch {
      /* ignore individual delete failures */
    }
  }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const monday = mondayOfCurrentWeek();
  const classRows = (
    await db.select().from(schema.classes).where(eq(schema.classes.userId, userId))
  ).filter((c) => !c.specificDate || c.specificDate >= monday);
  const studioIds = [...new Set(classRows.map((c) => c.studioId).filter((id): id is string => !!id))];
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studios.map((s) => [s.id, s]));
  const origin = siteOrigin();

  const newIds: string[] = [];
  for (const c of classRows) {
    const studio = c.studioId ? studioById.get(c.studioId) : undefined;
    const date =
      c.specificDate ??
      (() => {
        const d = new Date(`${monday}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + c.dayOfWeek);
        return d.toISOString().slice(0, 10);
      })();
    const desc =
      (c.links.length ? c.links.map((l) => `Book via ${l.label}: ${l.url}`).join("\n") + "\n\n" : "") +
      `${origin}/${user?.handle ?? ""}`;
    const event: Record<string, unknown> = {
      summary: c.name,
      description: desc,
      start: { dateTime: localDateTime(date, c.startTime), timeZone: tz },
      end: { dateTime: localDateTime(date, c.startTime, c.durationMin), timeZone: tz },
      source: { title: "fittlist", url: `${origin}/${user?.handle ?? ""}` },
    };
    if (studio) event.location = `${studio.name}, ${studio.address}`;
    else if (c.location) event.location = c.location;
    if (!c.specificDate)
      event.recurrence = recurrenceLines(c.dayOfWeek, c.endsOn, c.skipDates, c.startTime);

    try {
      const res = await fetch(`${CAL}/events`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify(event),
      });
      if (res.ok) {
        const created = await res.json();
        if (created.id) newIds.push(created.id);
      }
    } catch {
      /* ignore individual insert failures */
    }
  }

  await db
    .update(schema.googleConnections)
    .set({ syncedEventIds: newIds, timeZone: tz, updatedAt: new Date() })
    .where(eq(schema.googleConnections.userId, userId));
}

/** Remove fittlist's events and forget the connection. */
export async function disconnectGoogle(userId: string): Promise<void> {
  const db = await getDb();
  const [conn] = await db
    .select()
    .from(schema.googleConnections)
    .where(eq(schema.googleConnections.userId, userId));
  if (!conn) return;
  if (googleConfigured()) {
    const token = await accessTokenFrom(decryptSecret(conn.refreshToken));
    if (token) {
      for (const id of conn.syncedEventIds) {
        try {
          await fetch(`${CAL}/events/${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: { authorization: `Bearer ${token}` },
          });
        } catch {
          /* ignore */
        }
      }
    }
  }
  await db.delete(schema.googleConnections).where(eq(schema.googleConnections.userId, userId));
}

export async function isGoogleConnected(userId: string): Promise<{ connected: boolean; email: string | null }> {
  const db = await getDb();
  const [conn] = await db
    .select({ email: schema.googleConnections.email })
    .from(schema.googleConnections)
    .where(eq(schema.googleConnections.userId, userId));
  return { connected: Boolean(conn), email: conn?.email ?? null };
}
