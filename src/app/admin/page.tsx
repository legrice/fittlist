import { desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { currentAdmin } from "@/lib/admin";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

export default async function AdminPage() {
  const admin = await currentAdmin();
  // Don't reveal the route to non-admins (signed in or not).
  if (!admin) notFound();

  const db = await getDb();
  const [users, studios, classes, subs, creds, gconns, picked, invitesRows, requestRows] =
    await Promise.all([
    db.select().from(schema.users).orderBy(schema.users.createdAt),
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
    classCountByStudio.set(c.studioId, (classCountByStudio.get(c.studioId) ?? 0) + 1);
    if (!coachesByStudio.has(c.studioId)) coachesByStudio.set(c.studioId, new Set());
    coachesByStudio.get(c.studioId)!.add(c.userId);
  }
  for (const p of picked) {
    if (!coachesByStudio.has(p.studioId)) coachesByStudio.set(p.studioId, new Set());
    coachesByStudio.get(p.studioId)!.add(p.userId);
  }
  const subCountByUser = new Map<string, number>();
  for (const s of subs) {
    if (s.optedOutAt) continue;
    subCountByUser.set(s.trainerUserId, (subCountByUser.get(s.trainerUserId) ?? 0) + 1);
  }
  const passkeyUsers = new Set(creds.map((c) => c.userId));
  const googleUsers = new Set(gconns.map((g) => g.userId));

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const coaches = users.map((u) => ({
    id: u.id,
    name: u.name || "(no name)",
    handle: u.handle ?? "",
    email: u.email,
    joined: fmt(u.createdAt),
    lastSeen: fmt(u.lastLoginAt),
    onboarded: !!u.onboardedAt,
    classCount: classCountByUser.get(u.id) ?? 0,
    subCount: subCountByUser.get(u.id) ?? 0,
    hasPassword: !!u.passwordHash,
    hasPasskey: passkeyUsers.has(u.id),
    hasGoogle: googleUsers.has(u.id),
  }));

  const studioRows = studios.map((s) => ({
    id: s.id,
    name: s.name,
    address: s.address,
    added: fmt(s.createdAt),
    coachCount: coachesByStudio.get(s.id)?.size ?? 0,
    classCount: classCountByStudio.get(s.id) ?? 0,
  }));

  const userById = new Map(users.map((u) => [u.id, u]));
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
    };
  });

  const requests = requestRows
    .filter((r) => !r.handledAt)
    .map((r) => ({ id: r.id, name: r.name, email: r.email, requested: fmt(r.createdAt) }));

  const stats = {
    coaches: users.filter((u) => u.handle).length,
    studios: studios.length,
    classes: classes.length,
    subscribers: subs.filter((s) => !s.optedOutAt).length,
    newThisWeek: users.filter((u) => u.createdAt && new Date(u.createdAt).getTime() >= weekAgo).length,
    pendingInvites: invitesRows.filter((i) => !i.acceptedAt).length,
    requests: requests.length,
  };

  return (
    <AdminPanel
      adminEmail={admin.email}
      coaches={coaches}
      studios={studioRows}
      invites={invites}
      requests={requests}
      stats={stats}
    />
  );
}
