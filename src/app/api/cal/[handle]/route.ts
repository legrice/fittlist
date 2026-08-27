import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { publicSchedule } from "@/lib/coachweek";
import { mondayOfCurrentWeek } from "@/lib/format";
import { calendarTimeZoneLines, icsEsc as esc, icsFold as fold, recurrenceLines, zonedDateLine, zonedEndLine } from "@/lib/ics";

// Per-coach iCalendar feed. A trainer (or anyone) subscribes to this URL in
// Google/Apple/Outlook and their fittlist classes appear alongside everything
// else - weekly classes as recurring events, one-offs as single events.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) return new Response("Not found", { status: 404 });

  // Their own classes, and the gym shifts they've chosen to show. Same
  // loader as the page, so the feed can't say something the page doesn't.
  const classRows = await publicSchedule(user);
  const generatedAt = new Date();
  // Public classes only (this feed is reachable by handle, like the page);
  // weekly always, one-offs only if they haven't already passed. Private client
  // sessions stay out of the shared feed (they still sync to the coach's own
  // connected Google Calendar).
  const rows = classRows.filter((c) => c.isPublic && (!c.specificDate || c.specificDate >= mondayOfCurrentWeek(generatedAt, c.timeZone)));

  const studioIds = [...new Set(rows.map((c) => c.studioId).filter((id): id is string => !!id))];
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studios.map((s) => [s.id, s]));

  const stamp =
    new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//fittlist//schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(user.name || handle)} · fittlist`,
    `X-WR-TIMEZONE:${user.timeZone}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  lines.push(...calendarTimeZoneLines(rows.map((row) => row.timeZone)));

  for (const c of rows) {
    const studio = c.studioId ? studioById.get(c.studioId) : undefined;
    // Weekly classes anchor to this week's matching weekday and recur forever.
    const date =
      c.specificDate ??
      (() => {
        const d = new Date(`${mondayOfCurrentWeek(generatedAt, c.timeZone)}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + c.dayOfWeek);
        return d.toISOString().slice(0, 10);
      })();
    const desc = c.links.length
      ? c.links.map((l) => `Book via ${l.label}: ${l.url}`).join("\n") +
        `\n\nfittlist.co/${handle}`
      : `fittlist.co/${handle}`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${c.id}@fittlist.co`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(zonedDateLine("DTSTART", date, c.startTime, c.timeZone));
    lines.push(zonedEndLine(date, c.startTime, c.durationMin, c.timeZone));
    if (!c.specificDate)
      lines.push(...recurrenceLines(c.dayOfWeek, c.endsOn, c.skipDates, c.startTime, c.timeZone).map(fold));
    lines.push(fold(`SUMMARY:${esc(c.name)}`));
    if (studio) lines.push(fold(`LOCATION:${esc(`${studio.name}, ${studio.address}`)}`));
    lines.push(fold(`DESCRIPTION:${esc(desc)}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  const body = lines.join("\r\n") + "\r\n";

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `inline; filename="fittlist-${handle}.ics"`,
      "cache-control": "public, max-age=1800",
    },
  });
}
