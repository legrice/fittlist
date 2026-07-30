import { eq, gte, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { adminEmails } from "@/lib/admin";
import { todayIso } from "@/lib/format";
import { sendMessage } from "@/lib/mailer";

// The daily pulse, emailed to whoever runs the place: every count worth
// watching, each with how much of it is new since yesterday. "New" is the
// last 24 hours by row timestamps; visits are per app-day because that's how
// the rollup stores them.

const dayAgo = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

export async function sendDailyAdminStats(): Promise<{ sent: number }> {
  const admins = adminEmails();
  if (!admins.length) return { sent: 0 };
  const db = await getDb();
  const since = dayAgo();

  const [
    users,
    classes,
    personal,
    studios,
    subs,
    marks,
    msgs,
    threads,
    invites,
    asks,
    classReports,
    studioReports,
    suggestions,
    visits,
  ] = await Promise.all([
    db.select().from(schema.users),
    db.select().from(schema.classes),
    db.select().from(schema.personalClasses),
    db.select().from(schema.studios),
    db.select().from(schema.subscribers).where(isNull(schema.subscribers.optedOutAt)),
    db.select().from(schema.attendances),
    db.select().from(schema.inquiryMessages).where(gte(schema.inquiryMessages.createdAt, since)),
    db.select().from(schema.inquiryThreads).where(eq(schema.inquiryThreads.kind, "inquiry")),
    db.select().from(schema.invites).where(isNull(schema.invites.acceptedAt)),
    db.select().from(schema.coachRequests).where(isNull(schema.coachRequests.handledAt)),
    db.select().from(schema.classReports),
    db.select().from(schema.studioReports),
    db.select().from(schema.studioSuggestions),
    db.select().from(schema.pageVisits).where(eq(schema.pageVisits.date, todayIso())),
  ]);

  const coaches = users.filter((u) => u.kind !== "fan");
  const members = users.filter((u) => u.kind === "fan");
  const fresh = (rows: { createdAt: Date }[]) => rows.filter((r) => r.createdAt >= since).length;

  // A weekly class is one row per weekday; the series id is what a person
  // means by "a class". A series is new when its earliest row is new.
  const seriesOldest = new Map<string, Date>();
  for (const c of classes) {
    const cur = seriesOldest.get(c.seriesId);
    if (!cur || c.createdAt < cur) seriesOldest.set(c.seriesId, c.createdAt);
  }
  const totalClasses = seriesOldest.size;
  const newClasses = [...seriesOldest.values()].filter((d) => d >= since).length;
  const publicClasses = new Set(classes.filter((c) => c.isPublic).map((c) => c.seriesId)).size;

  const visitsToday = visits.reduce((n, v) => n + v.count, 0);
  const scheduleOpens = visits.reduce((n, v) => n + v.scheduleOpens, 0);
  const accountFollows = subs.filter((s) => s.userId).length;
  const emailFollows = subs.length - accountFollows;
  const onboarded = users.filter((u) => u.handle).length;

  const line = (label: string, total: number, added?: number) =>
    `${label}: ${total}${added ? ` (+${added} today)` : ""}`;

  // Where today's signups came from: the first-touch source on each new
  // account, so an Instagram push shows up as instagram.com the same day.
  const newBySource = new Map<string, number>();
  for (const u of users.filter((u) => u.createdAt >= since)) {
    const src = u.signupSource ?? "direct";
    newBySource.set(src, (newBySource.get(src) ?? 0) + 1);
  }
  const sourceLines = [...newBySource.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([src, n]) => `  ${src}: ${n}`);

  const text = [
    "The numbers, once a day.",
    "",
    "People",
    line("  Coaches", coaches.length, fresh(coaches)),
    line("  Members", members.length, fresh(members)),
    line("  Signed up but not set up", users.length - onboarded),
    line("  Coach requests waiting", asks.length),
    line("  Invites pending", invites.length),
    ...(sourceLines.length ? ["", "Today's signups came from", ...sourceLines] : []),
    "",
    "Classes",
    line("  Classes", totalClasses, newClasses),
    line("  Public", publicClasses),
    line("  Members' own entries", personal.length, fresh(personal)),
    line("  Studios", studios.length, fresh(studios)),
    "",
    "Activity",
    line("  Follows", subs.length, fresh(subs)),
    `  (${accountFollows} in-app, ${emailFollows} email-only)`,
    line("  Going marks", marks.length, fresh(marks)),
    line("  Messages sent today", msgs.length),
    line("  Conversations", threads.length),
    line("  Profile visits today", visitsToday),
    line("  Schedule opens today", scheduleOpens),
    "",
    "Moderation",
    line("  Class reports open", classReports.length),
    line("  Studio reports open", studioReports.length),
    line("  Studio edit suggestions", suggestions.length),
  ].join("\n");

  const newPeople = fresh(coaches) + fresh(members);
  const subject = `fittlist today: ${newPeople} new ${newPeople === 1 ? "person" : "people"}, ${newClasses} new ${newClasses === 1 ? "class" : "classes"}`;

  let sent = 0;
  for (const to of admins) {
    try {
      await sendMessage({ to, kind: "adminstats", subject, text });
      sent++;
    } catch (err) {
      console.error("daily stats email failed", to, err);
    }
  }
  return { sent };
}
