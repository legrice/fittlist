import { eq, inArray, isNull } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { getDb, schema } from "@/db";
import { sendMessage } from "@/lib/mailer";
import { fmtTime, siteOrigin, timeToMinutes } from "@/lib/format";

// All list email goes through here - the piece most likely to move to SMS
// later, so callers only describe the change and never touch the channel.

function secret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me");
}

const origin = siteOrigin;

export async function unsubTokenFor(subscriberId: string): Promise<string> {
  // No expiry: an unsubscribe link must keep working forever.
  return new SignJWT({ aud: "unsub" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subscriberId)
    .sign(secret());
}

export async function verifyUnsubToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.aud !== "unsub" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

async function unsubFooter(subscriberId: string): Promise<{ text: string; headers: Record<string, string> }> {
  const token = await unsubTokenFor(subscriberId);
  const pageUrl = `${origin()}/u/${token}`;
  const clickUrl = `${origin()}/api/unsub/${token}`;
  return {
    text: `\n\nUnsubscribe any time: ${pageUrl}`,
    headers: {
      "List-Unsubscribe": `<${clickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

type Trainer = { id: string; name: string; handle: string | null };

export async function sendWelcome(trainer: Trainer, subscriber: { id: string; email: string }) {
  const url = `fittlist.co/${trainer.handle}`;
  const unsub = await unsubFooter(subscriber.id);
  await sendMessage({
    to: subscriber.email,
    kind: "welcome",
    subject: `You're on ${trainer.name}'s list`,
    text:
      `You're subscribed to ${trainer.name}'s coaching schedule.\n\n` +
      `Once a week you'll get their upcoming classes in one email. Nothing else, ever.\n\n` +
      `The current week is always at ${url}.` +
      unsub.text,
    headers: unsub.headers,
  });
}

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Plain-text listing of the next 7 days that have classes, from today. Returns
// "" when the week is empty so callers can skip sending an empty digest.
function weekDigestText(
  classRows: (typeof schema.classes.$inferSelect)[],
  studioById: Map<string, typeof schema.studios.$inferSelect>,
): string {
  const todayIso = new Date().toISOString().slice(0, 10);
  const start = new Date(`${todayIso}T00:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    const items = classRows
      .filter((c) => (c.specificDate ? c.specificDate === iso : c.dayOfWeek === dow))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    if (!items.length) continue;
    out.push(`${WEEKDAY[dow]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`);
    for (const c of items) {
      const where = c.studioId ? studioById.get(c.studioId)?.name ?? "" : c.location ?? "";
      out.push(`  ${fmtTime(c.startTime)}  ${c.name}${where ? ` — ${where}` : ""}`);
    }
    out.push("");
  }
  return out.join("\n").trim();
}

/** Email one trainer's upcoming-week schedule to their active subscribers.
    Skips (returns 0) when there are no classes in the next 7 days. */
export async function sendWeeklyDigestForTrainer(
  trainerUserId: string,
  subs: { id: string; email: string }[],
): Promise<number> {
  if (!subs.length) return 0;
  const db = await getDb();
  const [trainer] = await db.select().from(schema.users).where(eq(schema.users.id, trainerUserId));
  if (!trainer?.handle) return 0;

  const classRows = (
    await db.select().from(schema.classes).where(eq(schema.classes.userId, trainerUserId))
  ).filter((c) => c.isPublic); // subscribers see the public schedule only

  const studioIds = [...new Set(classRows.map((c) => c.studioId).filter((x): x is string => !!x))];
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studios.map((s) => [s.id, s]));

  const body = weekDigestText(classRows, studioById);
  if (!body) return 0; // nothing on the calendar this week — don't send

  const url = `fittlist.co/${trainer.handle}`;
  for (const sub of subs) {
    const unsub = await unsubFooter(sub.id);
    await sendMessage({
      to: sub.email,
      kind: "weekly_schedule",
      subject: `${trainer.name}'s classes this week`,
      text: `${trainer.name}'s schedule this week:\n\n${body}\n\nFull schedule & booking: ${url}` + unsub.text,
      headers: unsub.headers,
    });
  }
  return subs.length;
}

// ---- merged digest (account follows)

export async function digestUnsubTokenFor(userId: string): Promise<string> {
  return new SignJWT({ aud: "unsub-digest" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .sign(secret());
}

export async function verifyDigestUnsubToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.aud !== "unsub-digest" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/** One email covering every coach an account follows, merged chronologically.
    Someone following twelve coaches gets one email, not twelve. Returns 0 when
    nobody they follow has anything on the calendar this week. */
export async function sendMergedDigestForFan(
  fanUserId: string,
  trainerUserIds: string[],
): Promise<number> {
  if (!trainerUserIds.length) return 0;
  const db = await getDb();
  const [fan] = await db.select().from(schema.users).where(eq(schema.users.id, fanUserId));
  if (!fan || fan.digestOptOutAt) return 0;

  const trainers = await db
    .select()
    .from(schema.users)
    .where(inArray(schema.users.id, trainerUserIds));
  const trainerById = new Map(trainers.map((t) => [t.id, t]));

  const classRows = (
    await db.select().from(schema.classes).where(inArray(schema.classes.userId, trainerUserIds))
  ).filter((c) => c.isPublic && trainerById.get(c.userId)?.handle);

  const studioIds = [...new Set(classRows.map((c) => c.studioId).filter((x): x is string => !!x))];
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studios.map((s) => [s.id, s]));

  const body = mergedWeekText(classRows, studioById, trainerById);
  if (!body) return 0; // nobody they follow is teaching this week

  const token = await digestUnsubTokenFor(fanUserId);
  const pageUrl = `${origin()}/u/digest/${token}`;
  const clickUrl = `${origin()}/api/unsub/digest/${token}`;
  const names = trainers
    .map((t) => t.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const who =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names[0]}, ${names[1]} and ${names.length - 2} more`;

  await sendMessage({
    to: fan.email,
    kind: "weekly_schedule",
    subject: "Your week",
    text:
      `This week with ${who}:\n\n${body}\n\n` +
      `Everything in one place: ${origin()}/feed` +
      `\n\nStop these weekly emails: ${pageUrl}`,
    headers: {
      "List-Unsubscribe": `<${clickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  return 1;
}

/** Like weekDigestText, but across coaches — each line carries whose class it is. */
function mergedWeekText(
  classRows: (typeof schema.classes.$inferSelect)[],
  studioById: Map<string, typeof schema.studios.$inferSelect>,
  trainerById: Map<string, typeof schema.users.$inferSelect>,
): string {
  const todayIso = new Date().toISOString().slice(0, 10);
  const start = new Date(`${todayIso}T00:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    const items = classRows
      .filter((c) => (c.specificDate ? c.specificDate === iso : c.dayOfWeek === dow))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    if (!items.length) continue;
    const head = i === 0 ? "Today" : i === 1 ? "Tomorrow" : `${WEEKDAY[dow]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
    out.push(head);
    for (const c of items) {
      const where = c.studioId ? studioById.get(c.studioId)?.name ?? "" : c.location ?? "";
      const coach = trainerById.get(c.userId)?.name?.trim().split(/\s+/)[0] ?? "";
      out.push(
        `  ${fmtTime(c.startTime)}  ${c.name} — ${coach}${where ? ` · ${where}` : ""}`,
      );
    }
    out.push("");
  }
  return out.join("\n").trim();
}

/** The weekly job. Account follows are merged into one email per fan; plain
    email subscribers keep getting their coach's own digest. */
export async function sendWeeklyDigests(): Promise<{ trainers: number; emails: number }> {
  const db = await getDb();
  const subs = await db
    .select()
    .from(schema.subscribers)
    .where(isNull(schema.subscribers.optedOutAt));

  const byTrainer = new Map<string, { id: string; email: string }[]>();
  const byFan = new Map<string, string[]>();
  for (const s of subs) {
    if (s.userId) {
      const arr = byFan.get(s.userId);
      if (arr) arr.push(s.trainerUserId);
      else byFan.set(s.userId, [s.trainerUserId]);
      continue;
    }
    const arr = byTrainer.get(s.trainerUserId);
    if (arr) arr.push({ id: s.id, email: s.email });
    else byTrainer.set(s.trainerUserId, [{ id: s.id, email: s.email }]);
  }

  let trainers = 0;
  let emails = 0;
  for (const [trainerUserId, list] of byTrainer) {
    try {
      const sent = await sendWeeklyDigestForTrainer(trainerUserId, list);
      if (sent > 0) trainers++;
      emails += sent;
    } catch (err) {
      console.error("weekly digest failed for trainer", trainerUserId, err);
    }
  }
  for (const [fanUserId, trainerIds] of byFan) {
    try {
      emails += await sendMergedDigestForFan(fanUserId, [...new Set(trainerIds)]);
    } catch (err) {
      console.error("merged digest failed for fan", fanUserId, err);
    }
  }
  return { trainers, emails };
}
