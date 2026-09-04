import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { hiddenFrom } from "@/lib/blocks";
import { runsOn } from "@/lib/format";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The social action is public RPC: a feed card is not proof of permission. */
export async function canInteractWithCalendarActivity(viewerId: string, actorId: string, classId: string, iso: string, kind: string): Promise<boolean> {
  if (typeof actorId !== "string" || !UUID.test(actorId) || typeof classId !== "string" || !UUID.test(classId)) return false;
  if (kind !== "going" && kind !== "coaching") return false;
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return false;
  const db = await getDb();
  const hidden = await hiddenFrom(viewerId);
  if (hidden.has(actorId)) return false;
  const [actor] = await db.select({ shiftsPublic: schema.users.shiftsPublic }).from(schema.users).where(eq(schema.users.id, actorId));
  if (!actor) return false;
  if (viewerId !== actorId) {
    const [follow] = await db.select({ id: schema.subscribers.id }).from(schema.subscribers)
      .innerJoin(schema.users, eq(schema.users.email, schema.subscribers.email))
      .where(and(eq(schema.users.id, viewerId), eq(schema.subscribers.trainerUserId, actorId), isNull(schema.subscribers.optedOutAt))).limit(1);
    if (!follow) return false;
  }
  const [cls] = await db.select().from(schema.classes).where(eq(schema.classes.id, classId));
  if (!cls?.isPublic || hidden.has(cls.userId) || (cls.coachUserId && hidden.has(cls.coachUserId))) return false;
  if (!runsOn(cls, iso, (date.getUTCDay() + 6) % 7)) return false;
  if (kind === "going") {
    const [attendance] = await db.select({ id: schema.attendances.id }).from(schema.attendances).where(and(
      eq(schema.attendances.userId, actorId), eq(schema.attendances.classId, classId),
      eq(schema.attendances.occurrenceDate, iso), eq(schema.attendances.isPublic, true),
    )).limit(1);
    return !!attendance;
  }
  if (cls.userId === actorId) return true;
  if (!actor.shiftsPublic && viewerId !== actorId) return false;
  const [cover] = await db.select({ coachUserId: schema.shiftCovers.coachUserId }).from(schema.shiftCovers)
    .where(and(eq(schema.shiftCovers.classId, classId), eq(schema.shiftCovers.occurrenceDate, iso))).limit(1);
  return (cover ? cover.coachUserId : cls.coachUserId) === actorId;
}
