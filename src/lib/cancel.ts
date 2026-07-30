import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { fmtDayHeader, siteOrigin } from "@/lib/format";
import { sendMessage } from "@/lib/mailer";
import { addNotification } from "@/lib/notify";

// Telling the people who said they were coming that it's off.
//
// Marking Going is a promise the app made on the coach's behalf: you said
// you'd be there, so we'll keep you right. Cancelling silently is worse than
// never having offered the mark, because they've stopped checking.

export type CancelledFor = {
  userId: string;
  email: string;
  /** ISO date of the occurrence they were coming to. */
  date: string;
};

export type CancelledClass = {
  coachName: string;
  className: string;
  /** "6:00 AM", already formatted for a human. */
  time: string;
  where: string | null;
};

/** 12-hour, no leading zero: "6:00 AM". */
export function humanTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ap}`;
}

export async function notifyCancelled(
  cls: CancelledClass,
  people: CancelledFor[],
): Promise<void> {
  const coach = cls.coachName.trim() || "Your coach";
  // Who turned cancellation emails off. The in-app note goes to everyone; a
  // pref should quiet an inbox, not hide a cancelled class.
  const db = await getDb();
  const ids = [...new Set(people.map((p) => p.userId))];
  const prefRows = ids.length
    ? await db
        .select({ id: schema.users.id, emailCancellations: schema.users.emailCancellations })
        .from(schema.users)
        .where(inArray(schema.users.id, ids))
    : [];
  const emailOff = new Set(prefRows.filter((r) => !r.emailCancellations).map((r) => r.id));
  for (const p of people) {
    // check-copy-ignore: fmtDayHeader is the date label, dash and all.
    const day = fmtDayHeader(p.date);
    const line = `${cls.className} at ${cls.time}${cls.where ? `, ${cls.where}` : ""}`;
    await addNotification(p.userId, {
      type: "class_cancelled",
      title: `${coach} cancelled ${cls.className}`,
      body: `${day}, ${cls.time}. It was in your week.`,
      href: "/feed",
    }).catch(() => {});
    if (emailOff.has(p.userId)) continue;
    await sendMessage({
      to: p.email,
      kind: "cancelled",
      subject: `Cancelled: ${cls.className} on ${day}`,
      text:
        `${coach} cancelled a class you marked Going.\n\n` +
        `${line}\n${day}\n\n` +
        `The rest of your week: ${siteOrigin()}/feed`,
    }).catch((err) => console.error("cancellation email failed", err));
  }
}
