"use server";

import { desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { currentAdmin } from "@/lib/admin";
import { isBlocked } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";

// A "use server" file can only export async functions, so the reasons the UI
// offers live with the sheet that shows them (ReportClass.tsx). This action
// accepts any short string; the picker is a convenience, not a contract.

/** A signed-in person says a class isn't right. One report per person per class. */
export async function reportClass(
  classId: string,
  reasonRaw: string,
  noteRaw = "",
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  const reason = reasonRaw.trim().slice(0, 60);
  const note = noteRaw.trim().slice(0, 300);
  if (!reason) return { ok: false, error: "Pick a reason." };

  const db = await getDb();
  const [cls] = await db.select().from(schema.classes).where(eq(schema.classes.id, classId));
  if (!cls || !cls.isPublic) return { ok: false, error: "Class not found." };
  if (cls.userId === userId) return { ok: false, error: "That's your own class." };
  if (await isBlocked(cls.userId, userId)) return { ok: false, error: "Class not found." };

  await db
    .insert(schema.classReports)
    .values({ seriesId: cls.seriesId, coachUserId: cls.userId, reporterUserId: userId, reason, note })
    .onConflictDoNothing({
      target: [schema.classReports.seriesId, schema.classReports.reporterUserId],
    });
  revalidatePath("/admin");
  return { ok: true };
}

export type ReportedClass = {
  seriesId: string;
  count: number;
  reasons: string[];
  notes: string[];
  reporters: string[];
  latestAt: string;
  /** Null when the class has since been deleted; the reports still tell you it happened. */
  className: string | null;
  coachName: string;
  coachHandle: string | null;
  classHref: string | null;
};

/** ADMIN — every reported class, most-reported first. */
export async function listReports(): Promise<ReportedClass[]> {
  const admin = await currentAdmin();
  if (!admin) return [];
  const db = await getDb();
  const rows = await db
    .select({
      seriesId: schema.classReports.seriesId,
      coachUserId: schema.classReports.coachUserId,
      reason: schema.classReports.reason,
      note: schema.classReports.note,
      createdAt: schema.classReports.createdAt,
      reporterName: schema.users.name,
      reporterEmail: schema.users.email,
    })
    .from(schema.classReports)
    .leftJoin(schema.users, eq(schema.users.id, schema.classReports.reporterUserId))
    .orderBy(desc(schema.classReports.createdAt));
  if (!rows.length) return [];

  const seriesIds = [...new Set(rows.map((r) => r.seriesId))];
  const coachIds = [...new Set(rows.map((r) => r.coachUserId))];
  const [classRows, coachRows] = await Promise.all([
    db
      .select({
        id: schema.classes.id,
        seriesId: schema.classes.seriesId,
        name: schema.classes.name,
      })
      .from(schema.classes)
      .where(inArray(schema.classes.seriesId, seriesIds)),
    db
      .select({ id: schema.users.id, name: schema.users.name, handle: schema.users.handle })
      .from(schema.users)
      .where(inArray(schema.users.id, coachIds)),
  ]);
  const classBySeries = new Map(classRows.map((c) => [c.seriesId, c]));
  const coachById = new Map(coachRows.map((c) => [c.id, c]));

  const bySeries = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = bySeries.get(r.seriesId) ?? [];
    list.push(r);
    bySeries.set(r.seriesId, list);
  }
  return [...bySeries.entries()]
    .map(([seriesId, list]) => {
      const cls = classBySeries.get(seriesId);
      const coach = coachById.get(list[0].coachUserId);
      return {
        seriesId,
        count: list.length,
        reasons: [...new Set(list.map((r) => r.reason))],
        notes: list.map((r) => r.note).filter(Boolean),
        reporters: list.map((r) => r.reporterName?.trim() || r.reporterEmail || "someone"),
        latestAt: list[0].createdAt.toISOString(),
        className: cls?.name ?? null,
        coachName: coach?.name ?? "a deleted account",
        coachHandle: coach?.handle ?? null,
        classHref: cls && coach?.handle ? `/${coach.handle}/${cls.id}` : null,
      };
    })
    .sort((a, b) => b.count - a.count || b.latestAt.localeCompare(a.latestAt));
}

/** ADMIN — handled: clear every report on this class. */
export async function dismissReports(seriesId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const db = await getDb();
  await db.delete(schema.classReports).where(eq(schema.classReports.seriesId, seriesId));
  revalidatePath("/admin");
  return { ok: true };
}

export type DuplicateSlot = {
  studioName: string;
  day: number;
  startTime: string;
  entries: { className: string; coachName: string; href: string | null }[];
};

// ADMIN — the same studio, day and start time under two different accounts is
// how a member-recreated class looks from above. Not proof, but exactly where
// to start looking; the beta data predates the coach-only gate.
export async function listDuplicateSlots(): Promise<DuplicateSlot[]> {
  const admin = await currentAdmin();
  if (!admin) return [];
  const db = await getDb();
  const rows = (await db.select().from(schema.classes)).filter((c) => c.isPublic && c.studioId);
  const byKey = new Map<string, typeof rows>();
  for (const c of rows) {
    const k = `${c.studioId}|${c.dayOfWeek}|${c.startTime}`;
    const list = byKey.get(k) ?? [];
    list.push(c);
    byKey.set(k, list);
  }
  const clashes = [...byKey.values()].filter(
    (list) => new Set(list.map((c) => c.userId)).size > 1,
  );
  if (!clashes.length) return [];

  const userIds = [...new Set(clashes.flat().map((c) => c.userId))];
  const studioIds = [...new Set(clashes.flat().map((c) => c.studioId!))];
  const [users, studios] = await Promise.all([
    db
      .select({ id: schema.users.id, name: schema.users.name, handle: schema.users.handle })
      .from(schema.users)
      .where(inArray(schema.users.id, userIds)),
    db
      .select({ id: schema.studios.id, name: schema.studios.name })
      .from(schema.studios)
      .where(inArray(schema.studios.id, studioIds)),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const studioById = new Map(studios.map((s) => [s.id, s]));

  return clashes.map((list) => {
    const first = list[0];
    return {
      studioName: studioById.get(first.studioId!)?.name ?? "a studio",
      day: first.dayOfWeek,
      startTime: first.startTime,
      entries: list.map((c) => {
        const u = userById.get(c.userId);
        return {
          className: c.name,
          coachName: u?.name ?? "?",
          href: u?.handle ? `/${u.handle}/${c.id}` : null,
        };
      }),
    };
  });
}
