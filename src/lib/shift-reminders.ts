import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { emailHtml } from "@/lib/email-html";
import { dowOfDate, fmtDateLong, fmtTime, runsOn, siteOrigin } from "@/lib/format";
import { sendMessage } from "@/lib/mailer";
import { addNotification } from "@/lib/notify";
import { pushToUser } from "@/lib/push";

const zonedTarget = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: process.env.APP_TIME_ZONE || "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { iso: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")) % 24 };
};

/** Notify each assigned coach during the hour that begins 12 hours before a shift. */
export async function sendShiftReminders(now = new Date()): Promise<{ sent: number }> {
  const target = zonedTarget(new Date(now.getTime() + 12 * 60 * 60 * 1000));
  const db = await getDb();
  const rows = (await db.select().from(schema.classes)).filter((row) =>
    row.isPublic &&
    Number(row.startTime.slice(0, 2)) === target.hour &&
    runsOn(row, target.iso, dowOfDate(target.iso)) &&
    (!row.createdAt || target.iso >= new Date(row.createdAt).toISOString().slice(0, 10)),
  );
  if (!rows.length) return { sent: 0 };
  const classIds = rows.map((row) => row.id);
  const studioIds = [...new Set(rows.map((row) => row.studioId).filter((id): id is string => !!id))];
  const [covers, studios, closures] = await Promise.all([
    db.select().from(schema.shiftCovers).where(and(
      inArray(schema.shiftCovers.classId, classIds),
      eq(schema.shiftCovers.occurrenceDate, target.iso),
    )),
    studioIds.length ? db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds)) : [],
    studioIds.length ? db.select().from(schema.studioClosedDays).where(and(
      inArray(schema.studioClosedDays.studioId, studioIds),
      eq(schema.studioClosedDays.occurrenceDate, target.iso),
    )) : [],
  ]);
  const coverByClass = new Map(covers.map((cover) => [cover.classId, cover.coachUserId]));
  const studioById = new Map(studios.map((studio) => [studio.id, studio]));
  const closed = new Set(closures.map((closure) => closure.studioId));
  const assignments = rows.flatMap((row) => {
    const coachUserId = coverByClass.has(row.id) ? coverByClass.get(row.id) : row.coachUserId;
    return coachUserId && (!row.studioId || !closed.has(row.studioId)) ? [{ row, coachUserId }] : [];
  });
  const userIds = [...new Set(assignments.map((item) => item.coachUserId))];
  const people = userIds.length ? await db.select().from(schema.users).where(inArray(schema.users.id, userIds)) : [];
  const personById = new Map(people.map((person) => [person.id, person]));
  let sent = 0;
  for (const { row, coachUserId } of assignments) {
    const studio = row.studioId ? studioById.get(row.studioId) : null;
    const body = `${fmtDateLong(target.iso)} at ${fmtTime(row.startTime)}${studio ? ` · ${studio.name}` : ""}`;
    const title = `Your ${row.name} shift is in 12 hours`;
    const [already] = await db.select({ id: schema.notifications.id }).from(schema.notifications).where(and(
      eq(schema.notifications.userId, coachUserId),
      eq(schema.notifications.type, "shift_reminder"),
      eq(schema.notifications.title, title),
      eq(schema.notifications.body, body),
    ));
    if (already) continue;
    await addNotification(coachUserId, {
      type: "shift_reminder",
      title,
      body,
      href: studio ? `/s/${studio.slug ?? studio.id}/shifts` : "/week",
    });
    const person = personById.get(coachUserId);
    if (person) {
      const url = `${siteOrigin()}${studio ? `/s/${studio.slug ?? studio.id}/shifts` : "/week"}`;
      try {
        await sendMessage({
          to: person.email,
          kind: "schedule_change",
          subject: `Reminder: ${row.name} in 12 hours`,
          text: `${body}\n\n${url}`,
          html: emailHtml({
            heading: "Your shift is in 12 hours",
            body: [row.name, body],
            cta: { label: "View shift", url },
            footer: "This reminder was sent because the studio assigned this shift to you on FittList.",
          }),
        });
      } catch (error) {
        console.error("shift reminder email failed", person.email, error);
      }
      void pushToUser(coachUserId, { title: `${row.name} in 12 hours`, body, url });
    }
    sent++;
  }
  return { sent };
}
