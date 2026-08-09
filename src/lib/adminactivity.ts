import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { adminEmails } from "@/lib/admin";

// The admin's pulse: what happened across the app, derived from the tables
// that already record it, so nothing new is written and nothing private can
// leak by construction. Deliberately absent: follows, Going marks, messages,
// feedback. Those are between people; this list is the public shape of the
// app changing (accounts, classes, studios, events).

export type ActivityEntry = { when: Date; icon: string; text: string };

const nameOf = (u: { name: string; email: string } | undefined | null) =>
  u ? u.name.trim() || u.email.split("@")[0] : "Someone";

export async function adminActivity(limit = 100): Promise<ActivityEntry[]> {
  const db = await getDb();
  const [users, classRows, studios, edits, events] = await Promise.all([
    db.select().from(schema.users),
    db.select().from(schema.classes),
    db.select().from(schema.studios),
    db.select().from(schema.studioEdits).orderBy(desc(schema.studioEdits.createdAt)).limit(200),
    db.select().from(schema.events),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const admins = new Set(
    users.filter((u) => adminEmails().includes(u.email.toLowerCase())).map((u) => u.id),
  );
  const out: ActivityEntry[] = [];

  for (const u of users) {
    if (!u.createdAt || admins.has(u.id)) continue;
    out.push({
      when: u.createdAt,
      icon: "person_add",
      text: `${nameOf(u)} joined as a ${u.kind === "fan" ? "member" : "coach"}`,
    });
  }

  // One entry per series, on its newest row: edits recreate rows, so this
  // honestly reads "added or updated" rather than pretending to know which.
  const bySeries = new Map<string, (typeof classRows)[number]>();
  for (const c of classRows) {
    if (!c.isPublic) continue; // private rows are nobody's business, admin included
    const cur = bySeries.get(c.seriesId);
    if (!cur || (c.createdAt && cur.createdAt && c.createdAt > cur.createdAt))
      bySeries.set(c.seriesId, c);
  }
  for (const c of bySeries.values()) {
    if (!c.createdAt) continue;
    out.push({
      when: c.createdAt,
      icon: "event",
      text: `${nameOf(userById.get(c.userId))} added or updated ${c.name}`,
    });
  }

  for (const s of studios) {
    if (!s.createdAt) continue;
    out.push({
      when: s.createdAt,
      icon: "place",
      text: `${nameOf(s.createdByUserId ? userById.get(s.createdByUserId) : null)} added ${s.name} to the directory`,
    });
  }

  const studioById = new Map(studios.map((s) => [s.id, s]));
  for (const e of edits) {
    out.push({
      when: e.createdAt,
      icon: "edit",
      text: `${nameOf(e.editorUserId ? userById.get(e.editorUserId) : null)} edited ${
        studioById.get(e.studioId)?.name ?? "a studio"
      }${e.changes.length ? `: ${e.changes[0]}${e.changes.length > 1 ? ", and more" : ""}` : ""}`,
    });
  }

  for (const e of events) {
    out.push({
      when: e.createdAt,
      icon: "campaign",
      text: `${nameOf(e.createdByUserId ? userById.get(e.createdByUserId) : null)} posted ${e.name}`,
    });
  }

  return out.sort((a, b) => b.when.getTime() - a.when.getTime()).slice(0, limit);
}

/** How many entries are newer than the admin's last look. Cheap enough at
 *  beta scale to run in the header for the one account that is an admin. */
export async function adminNewActivityCount(adminUserId: string): Promise<number> {
  const db = await getDb();
  const [me] = await db
    .select({ at: schema.users.adminActivityAt })
    .from(schema.users)
    .where(eq(schema.users.id, adminUserId));
  const since = me?.at?.getTime() ?? 0;
  const entries = await adminActivity(200);
  return entries.filter((e) => e.when.getTime() > since).length;
}

/** Guard helper for the header: is this signed-in user an admin at all? */
export async function isAdminUser(userId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(inArray(schema.users.id, [userId]));
  return !!rows[0] && adminEmails().includes(rows[0].email.toLowerCase());
}

/** Anything new since the admin last opened the activity list? The cheap
 *  question the header's dot asks on every render: one existence check per
 *  table the list is built from, with the list's own filters, rather than
 *  loading the whole feed to count it. */
export async function adminActivityFreshSince(seenAt: Date | null): Promise<boolean> {
  const db = await getDb();
  const since = seenAt ?? new Date(0);
  const [u, c, st, ev] = await Promise.all([
    db
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(gt(schema.users.createdAt, since)),
    db
      .select({ id: schema.classes.id })
      .from(schema.classes)
      .where(and(gt(schema.classes.createdAt, since), eq(schema.classes.isPublic, true)))
      .limit(1),
    db.select({ id: schema.studios.id }).from(schema.studios).where(gt(schema.studios.createdAt, since)).limit(1),
    db.select({ id: schema.events.id }).from(schema.events).where(gt(schema.events.createdAt, since)).limit(1),
  ]);
  const adminList = adminEmails();
  const freshUser = u.some((x) => !adminList.includes(x.email.toLowerCase()));
  return freshUser || c.length > 0 || st.length > 0 || ev.length > 0;
}
