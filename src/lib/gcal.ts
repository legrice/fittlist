import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { recurrenceLines } from "@/lib/ics";
import { decryptSecret } from "@/lib/crypto";
import { mondayOfCurrentWeek, siteOrigin } from "@/lib/format";
import { DEFAULT_TIME_ZONE } from "@/lib/timezone";

// One-way mirror: fittlist classes -> the trainer's Google Calendar. Weekly
// classes become recurring events; one-offs single events. Stable remote ids
// let us reconcile in place without ever touching personal events.

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
  if (!res.ok) return null;
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

type GoogleClassRow = typeof schema.classes.$inferSelect;

/**
 * Google accepts caller-selected event ids made from lowercase base32hex
 * characters. A SHA-256 hex prefix fits that alphabet and gives each fittlist
 * series/day a stable remote identity across edits (edits replace local row
 * ids but deliberately retain seriesId).
 */
export function googleEventIdForClass(
  row: Pick<GoogleClassRow, "seriesId" | "dayOfWeek" | "specificDate">,
): string {
  const occurrence = row.specificDate ?? `weekly-${row.dayOfWeek}`;
  return `fittlist${createHash("sha256").update(`v1:${row.seriesId}:${occurrence}`).digest("hex").slice(0, 32)}`;
}

function scheduleFingerprint(rows: GoogleClassRow[]): string {
  const eventFields = rows
    .map((row) => ({
      id: row.id,
      seriesId: row.seriesId,
      dayOfWeek: row.dayOfWeek,
      specificDate: row.specificDate,
      endsOn: row.endsOn,
      skipDates: row.skipDates,
      startTime: row.startTime,
      timeZone: row.timeZone,
      durationMin: row.durationMin,
      name: row.name,
      studioId: row.studioId,
      location: row.location,
      links: row.links,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return createHash("sha256").update(JSON.stringify(eventFields)).digest("hex");
}

async function upsertGoogleEvent(
  id: string,
  event: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<void> {
  const url = `${CAL}/events/${encodeURIComponent(id)}`;
  const write = (method: "PUT" | "POST", body: Record<string, unknown>, target = url) =>
    fetch(target, {
      method,
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  // Update the deterministic id in place. The first sync gets a 404 and
  // inserts it; a concurrent first sync can win that insert, in which case a
  // final update makes this payload authoritative.
  let response = await write("PUT", event);
  if (response.status === 404) {
    response = await write("POST", { ...event, id }, `${CAL}/events`);
    if (response.status === 409) response = await write("PUT", event);
  }
  if (!response.ok) throw new Error(`Google event upsert failed (${response.status})`);
}

async function deleteGoogleEvent(id: string, headers: Record<string, string>): Promise<boolean> {
  try {
    const response = await fetch(`${CAL}/events/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    });
    return response.ok || response.status === 404 || response.status === 410;
  } catch {
    return false;
  }
}

/** Reconcile all fittlist-created events in the trainer's calendar. Safe to
    call often; silently no-ops when the trainer hasn't connected. */
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

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const connectionTimeZone = user?.timeZone ?? conn.timeZone ?? DEFAULT_TIME_ZONE;
  const syncStartedAt = new Date();
  const readCurrentClasses = async () =>
    (await db.select().from(schema.classes).where(eq(schema.classes.userId, userId)))
      .filter((row) => !row.specificDate || row.specificDate >= mondayOfCurrentWeek(syncStartedAt, row.timeZone));
  const classRows = await readCurrentClasses();
  const sourceFingerprint = scheduleFingerprint(classRows);
  const studioIds = [...new Set(classRows.map((c) => c.studioId).filter((id): id is string => !!id))];
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studios.map((s) => [s.id, s]));
  const origin = siteOrigin();

  const successfulIds: string[] = [];
  const failures: string[] = [];
  for (const c of classRows) {
    const eventId = googleEventIdForClass(c);
    const studio = c.studioId ? studioById.get(c.studioId) : undefined;
    const date =
      c.specificDate ??
      (() => {
        const d = new Date(`${mondayOfCurrentWeek(syncStartedAt, c.timeZone)}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + c.dayOfWeek);
        return d.toISOString().slice(0, 10);
      })();
    const desc =
      (c.links.length ? c.links.map((l) => `Book via ${l.label}: ${l.url}`).join("\n") + "\n\n" : "") +
      `${origin}/${user?.handle ?? ""}`;
    const event: Record<string, unknown> = {
      summary: c.name,
      description: desc,
      start: { dateTime: localDateTime(date, c.startTime), timeZone: c.timeZone },
      end: { dateTime: localDateTime(date, c.startTime, c.durationMin), timeZone: c.timeZone },
      source: { title: "fittlist", url: `${origin}/${user?.handle ?? ""}` },
      extendedProperties: {
        private: {
          fittlist: "true",
          fittlistSeriesId: c.seriesId,
          fittlistOccurrence: c.specificDate ?? `weekly-${c.dayOfWeek}`,
        },
      },
    };
    if (studio) event.location = `${studio.name}, ${studio.address}`;
    else if (c.location) event.location = c.location;
    if (!c.specificDate)
      event.recurrence = recurrenceLines(c.dayOfWeek, c.endsOn, c.skipDates, c.startTime, c.timeZone);

    try {
      await upsertGoogleEvent(eventId, event, auth);
      successfulIds.push(eventId);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Google event upsert failed");
    }
  }

  // On a partial run, retain every previously tracked event and add the new
  // deterministic ids that did succeed. Nothing old is removed until the
  // complete desired schedule exists remotely.
  const mergeTrackedIds = async (ids: string[]) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const [latest] = await db
        .select({ syncedEventIds: schema.googleConnections.syncedEventIds, syncVersion: schema.googleConnections.syncVersion })
        .from(schema.googleConnections)
        .where(eq(schema.googleConnections.userId, userId));
      if (!latest) return false;
      const merged = [...new Set([...latest.syncedEventIds, ...ids])];
      const updated = await db
        .update(schema.googleConnections)
        .set({
          syncedEventIds: merged,
          timeZone: connectionTimeZone,
          syncVersion: latest.syncVersion + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.googleConnections.userId, userId),
            eq(schema.googleConnections.syncVersion, latest.syncVersion),
          ),
        )
        .returning({ userId: schema.googleConnections.userId });
      if (updated.length) return true;
    }
    return false;
  };

  if (failures.length) {
    await mergeTrackedIds(successfulIds);
    throw new Error(`Google calendar sync incomplete (${failures.length} event${failures.length === 1 ? "" : "s"})`);
  }

  // A schedule edit can land while remote requests are in flight. Never let
  // that stale snapshot delete events: a changed fingerprint leaves all old
  // ids tracked and lets the newer post-commit sync reconcile them.
  const currentRows = await readCurrentClasses();
  if (scheduleFingerprint(currentRows) !== sourceFingerprint) {
    await mergeTrackedIds(successfulIds);
    throw new Error("Google calendar sync superseded by a newer schedule");
  }

  const desiredIds = new Set(successfulIds);
  const failedDeletes: string[] = [];
  for (const id of conn.syncedEventIds) {
    if (desiredIds.has(id)) continue;
    if (!(await deleteGoogleEvent(id, auth))) failedDeletes.push(id);
  }

  // Only replace the tracked set if nobody updated this connection since the
  // snapshot was read. If another sync won, merge instead of overwriting its
  // work; deterministic ids make the next reconciliation safe.
  const trackedIds = [...desiredIds, ...failedDeletes];
  const updated = await db
    .update(schema.googleConnections)
    .set({
      syncedEventIds: trackedIds,
      timeZone: connectionTimeZone,
      syncVersion: conn.syncVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.googleConnections.userId, userId),
        eq(schema.googleConnections.syncVersion, conn.syncVersion),
      ),
    )
    .returning({ userId: schema.googleConnections.userId });
  if (!updated.length) {
    await mergeTrackedIds(trackedIds);
    throw new Error("Google calendar sync superseded by another reconciliation");
  }
  if (failedDeletes.length)
    throw new Error(`Google calendar cleanup incomplete (${failedDeletes.length} event${failedDeletes.length === 1 ? "" : "s"})`);
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
      const failed: string[] = [];
      for (const id of conn.syncedEventIds) {
        if (!(await deleteGoogleEvent(id, { authorization: `Bearer ${token}` }))) failed.push(id);
      }
      // Keep the connection and its ids so a temporary Google failure can be
      // retried. Forgetting them here would make those events permanent
      // orphans that fittlist could no longer identify.
      if (failed.length)
        throw new Error(`Google calendar disconnect incomplete (${failed.length} event${failed.length === 1 ? "" : "s"})`);
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
