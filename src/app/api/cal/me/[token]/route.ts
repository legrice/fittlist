import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { mondayOfCurrentWeek } from "@/lib/format";
import { verifyCalendarToken } from "@/lib/calfeed";
import { floatingEnd, floatingStart, icsEsc as esc, icsFold as fold, recurrenceLines } from "@/lib/ics";

// One member's whole week, across every coach they follow, as a calendar they
// subscribe to once.
//
// This is the coach feed's counterpart and the thing that makes following
// worth doing: the classes land in the calendar they already live in, and when
// a coach moves the 6am to 6:15 it moves there too. Behind a signed token
// rather than a handle, because who someone follows is private.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = await verifyCalendarToken(token);
  if (!userId) return new Response("Not found", { status: 404 });

  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return new Response("Not found", { status: 404 });

  // Follows are keyed on the email, the same as the feed and the digest.
  const follows = await db
    .select({ trainerUserId: schema.subscribers.trainerUserId })
    .from(schema.subscribers)
    .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt)));
  const coachIds = [...new Set(follows.map((f) => f.trainerUserId))];

  const coaches = coachIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, coachIds))
    : [];
  const coachById = new Map(coaches.map((c) => [c.id, c]));

  const monday = mondayOfCurrentWeek();
  const classRows = coachIds.length
    ? await db.select().from(schema.classes).where(inArray(schema.classes.userId, coachIds))
    : [];
  // Public only. A coach's private client sessions are on their own schedule
  // and must not reach a follower's calendar.
  const rows = classRows.filter((c) => c.isPublic && (!c.specificDate || c.specificDate >= monday));

  const studioIds = [...new Set(rows.map((c) => c.studioId).filter((id): id is string => !!id))];
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studios.map((s) => [s.id, s]));

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//fittlist//week//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:My week · fittlist",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const c of rows) {
    const coach = coachById.get(c.userId);
    const studio = c.studioId ? studioById.get(c.studioId) : undefined;
    const date =
      c.specificDate ??
      (() => {
        const d = new Date(`${monday}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + c.dayOfWeek);
        return d.toISOString().slice(0, 10);
      })();
    const page = coach?.handle ? `fittlist.co/${coach.handle}` : "fittlist.co";
    const desc = c.links.length
      ? c.links.map((l) => `Book via ${l.label}: ${l.url}`).join("\\n") + `\\n\\n${page}`
      : page;

    lines.push("BEGIN:VEVENT");
    // Namespaced so a member subscribed to both this and a coach's own feed
    // doesn't get the same event collapsed into one.
    lines.push(`UID:${c.id}.me@fittlist.co`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${floatingStart(date, c.startTime)}`);
    lines.push(`DTEND:${floatingEnd(date, c.startTime, c.durationMin)}`);
    if (!c.specificDate) {
      lines.push(...recurrenceLines(c.dayOfWeek, c.endsOn, c.skipDates, c.startTime));
    }
    // The coach's name is in the title: a merged week is several people's
    // classes, and "Stretch+" alone doesn't say whose.
    const who = coach?.name?.trim();
    lines.push(fold(`SUMMARY:${esc(who ? `${c.name} with ${who}` : c.name)}`));
    if (studio) lines.push(fold(`LOCATION:${esc(`${studio.name}, ${studio.address}`)}`));
    else if (c.location) lines.push(fold(`LOCATION:${esc(c.location)}`));
    lines.push(fold(`DESCRIPTION:${desc}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  const body = lines.join("\r\n") + "\r\n";

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="fittlist-my-week.ics"',
      "cache-control": "private, max-age=900",
    },
  });
}
