import { desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { adminEmails, currentAdmin } from "@/lib/admin";
import { listDuplicateSlots, listReports } from "@/app/actions/reports";
import { listStudioReports, listStudioSuggestions } from "@/app/actions/studios";
import { vapidPublicKey } from "@/lib/push";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

export default async function AdminPage() {
  const admin = await currentAdmin();
  // Don't reveal the route to non-admins (signed in or not).
  if (!admin) notFound();

  const adminList = adminEmails();
  const db = await getDb();
  const [users, studios, classes, subs, creds, gconns, picked, invitesRows, requestRows] =
    await Promise.all([
    // Newest first: the person you're looking for in a beta is almost always
    // the one who just signed up.
    db.select().from(schema.users).orderBy(desc(schema.users.createdAt)),
    db.select().from(schema.studios).orderBy(schema.studios.seq),
    db
      .select({
        id: schema.classes.id,
        userId: schema.classes.userId,
        studioId: schema.classes.studioId,
      })
      .from(schema.classes),
    db
      .select({
        trainerUserId: schema.subscribers.trainerUserId,
        // Follows are keyed on the email, not the account: a plain email
        // subscriber has no user row at all.
        email: schema.subscribers.email,
        optedOutAt: schema.subscribers.optedOutAt,
      })
      .from(schema.subscribers),
    db.select({ userId: schema.credentials.userId }).from(schema.credentials),
    db.select({ userId: schema.googleConnections.userId }).from(schema.googleConnections),
    db
      .select({ userId: schema.coachStudios.userId, studioId: schema.coachStudios.studioId })
      .from(schema.coachStudios),
    db.select().from(schema.invites).orderBy(desc(schema.invites.createdAt)),
    db
      .select()
      .from(schema.inviteRequests)
      .orderBy(desc(schema.inviteRequests.createdAt)),
  ]);

  // Roll the join tables up into per-user and per-studio counts in memory (beta
  // scale; a handful of coaches).
  const classCountByUser = new Map<string, number>();
  const classCountByStudio = new Map<string, number>();
  const coachesByStudio = new Map<string, Set<string>>();
  for (const c of classes) {
    classCountByUser.set(c.userId, (classCountByUser.get(c.userId) ?? 0) + 1);
    if (!c.studioId) continue; // private items may have no studio
    classCountByStudio.set(c.studioId, (classCountByStudio.get(c.studioId) ?? 0) + 1);
    if (!coachesByStudio.has(c.studioId)) coachesByStudio.set(c.studioId, new Set());
    coachesByStudio.get(c.studioId)!.add(c.userId);
  }
  for (const p of picked) {
    if (!coachesByStudio.has(p.studioId)) coachesByStudio.set(p.studioId, new Set());
    coachesByStudio.get(p.studioId)!.add(p.userId);
  }
  // Two different numbers that both live in `subscribers`: how many people
  // follow you, and how many coaches you follow. A coach cares about the
  // first, a member only has the second.
  const subCountByUser = new Map<string, number>();
  const followingByEmail = new Map<string, number>();
  for (const s of subs) {
    if (s.optedOutAt) continue;
    subCountByUser.set(s.trainerUserId, (subCountByUser.get(s.trainerUserId) ?? 0) + 1);
    const e = s.email.toLowerCase();
    followingByEmail.set(e, (followingByEmail.get(e) ?? 0) + 1);
  }
  const passkeyUsers = new Set(creds.map((c) => c.userId));
  const googleUsers = new Set(gconns.map((g) => g.userId));

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const people = users.map((u) => ({
    id: u.id,
    // The one thing that decides which side someone is on. Not the handle:
    // members claim those too, which is exactly how this panel ended up
    // calling every account a coach.
    kind: u.kind === "fan" ? ("member" as const) : ("coach" as const),
    name: u.name || "(no name)",
    handle: u.handle ?? "",
    email: u.email,
    joined: fmt(u.createdAt),
    lastSeen: fmt(u.lastLoginAt),
    onboarded: !!u.onboardedAt,
    classCount: classCountByUser.get(u.id) ?? 0,
    subCount: subCountByUser.get(u.id) ?? 0,
    followingCount: followingByEmail.get(u.email.toLowerCase()) ?? 0,
    hasPassword: !!u.passwordHash,
    hasPasskey: passkeyUsers.has(u.id),
    hasGoogle: googleUsers.has(u.id),
    source: u.signupSource ?? "direct",
  }));

  const studioRows = studios.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    address: s.address,
    added: fmt(s.createdAt),
    coachCount: coachesByStudio.get(s.id)?.size ?? 0,
    classCount: classCountByStudio.get(s.id) ?? 0,
  }));

  const userById = new Map(users.map((u) => [u.id, u]));
  const nameOf = (id: string | null) => {
    if (!id) return "";
    const u = userById.get(id);
    if (!u) return "";
    return u.name.trim() || u.email.split("@")[0];
  };
  const invites = invitesRows.map((i) => {
    const accepted = i.acceptedUserId ? userById.get(i.acceptedUserId) : undefined;
    return {
      id: i.id,
      email: i.email,
      label: i.label ?? "",
      invited: fmt(i.createdAt),
      accepted: !!i.acceptedAt,
      acceptedOn: fmt(i.acceptedAt),
      acceptedName: accepted?.name || "",
      acceptedHandle: accepted?.handle ?? "",
      invitedBy: nameOf(i.invitedByUserId),
      invitedByAdmin: !!i.invitedByUserId && adminList.includes(
        (userById.get(i.invitedByUserId)?.email ?? "").toLowerCase(),
      ),
    };
  });

  // Where people are coming from. One row per person who has brought anyone in,
  // busiest first — the answer to "is this spreading, and through whom".
  const byInviter = new Map<string, { name: string; admin: boolean; sent: number; joined: number }>();
  for (const i of invitesRows) {
    if (!i.invitedByUserId) continue;
    const u = userById.get(i.invitedByUserId);
    if (!u) continue;
    const cur = byInviter.get(i.invitedByUserId) ?? {
      name: u.name.trim() || u.email.split("@")[0],
      admin: adminList.includes(u.email.toLowerCase()),
      sent: 0,
      joined: 0,
    };
    cur.sent += 1;
    if (i.acceptedAt) cur.joined += 1;
    byInviter.set(i.invitedByUserId, cur);
  }
  const referrers = [...byInviter.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.joined - a.joined || b.sent - a.sent || a.name.localeCompare(b.name));

  const requests = requestRows
    .filter((r) => !r.handledAt)
    .map((r) => ({ id: r.id, name: r.name, email: r.email, requested: fmt(r.createdAt) }));

  // Who changed what in the shared studio directory, newest first. The
  // directory is open to every coach on purpose; this is the receipt that
  // makes that openness safe to keep.
  const studioById = new Map(studios.map((s) => [s.id, s]));
  const editRows = await db
    .select()
    .from(schema.studioEdits)
    .orderBy(desc(schema.studioEdits.createdAt))
    .limit(80);
  const studioEdits = editRows.map((e) => ({
    id: e.id,
    studioName: studioById.get(e.studioId)?.name ?? "A deleted studio",
    studioSlug: studioById.get(e.studioId)?.slug ?? null,
    editor: nameOf(e.editorUserId) || "A deleted account",
    editorHandle: e.editorUserId ? (userById.get(e.editorUserId)?.handle ?? "") : "",
    when: fmt(e.createdAt),
    changes: e.changes,
  }));

  const stats = {
    // A coach is kind, not handle. Counting handles quietly added every member
    // to the coach total from the day members started claiming links.
    coaches: users.filter((u) => u.kind !== "fan").length,
    members: users.filter((u) => u.kind === "fan").length,
    studios: studios.length,
    classes: classes.length,
    subscribers: subs.filter((s) => !s.optedOutAt).length,
    newThisWeek: users.filter((u) => u.createdAt && new Date(u.createdAt).getTime() >= weekAgo).length,
    pendingInvites: invitesRows.filter((i) => !i.acceptedAt).length,
    requests: requests.length,
  };

  const [reports, duplicates, studioReports, studioSuggestions] = await Promise.all([
    listReports(),
    listDuplicateSlots(),
    listStudioReports(),
    listStudioSuggestions(),
  ]);
  const coachAskRows = await db
    .select({
      id: schema.coachRequests.id,
      note: schema.coachRequests.note,
      createdAt: schema.coachRequests.createdAt,
      name: schema.users.name,
      email: schema.users.email,
      handle: schema.users.handle,
    })
    .from(schema.coachRequests)
    .leftJoin(schema.users, eq(schema.users.id, schema.coachRequests.userId))
    .where(isNull(schema.coachRequests.handledAt))
    .orderBy(desc(schema.coachRequests.createdAt));
  const coachAsks = coachAskRows.map((r) => ({
    id: r.id,
    note: r.note,
    asked: fmt(r.createdAt),
    name: r.name?.trim() || r.email || "?",
    email: r.email ?? "",
    handle: r.handle ?? "",
  }));

  return (
    <AdminPanel
      adminEmail={admin.email}
      reports={reports}
      studioReports={studioReports}
      studioSuggestions={studioSuggestions}
      coachAsks={coachAsks}
      duplicates={duplicates}
      people={people}
      studios={studioRows}
      studioEdits={studioEdits}
      invites={invites}
      referrers={referrers}
      requests={requests}
      stats={stats}
      vapidKey={vapidPublicKey()}
      dark={admin.look === "dark"}
    />
  );
}
