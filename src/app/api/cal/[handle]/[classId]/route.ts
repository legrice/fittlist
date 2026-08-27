import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { mondayOfCurrentWeek, siteOrigin } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { calendarTimeZoneLines, icsEsc as esc, icsFold as fold, recurrenceLines, zonedDateLine, zonedEndLine } from "@/lib/ics";

// A single class as a downloadable .ics — the "Add to calendar" action on a
// class page. Apple Calendar and Outlook both import this; weekly classes get
// an RRULE so they recur, one-offs are a single dated event.

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ handle: string; classId: string }> },
) {
  const { handle, classId } = await params;
  if (!UUID_RE.test(classId)) return new Response("Not found", { status: 404 });

  const db = await getDb();
  // A handle, or a studio's slug when the class belongs to a gym: a gym's
  // account has no handle, so its classes are addressed under the studio.
  let [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) {
    const [studio] = await db.select().from(schema.studios).where(eq(schema.studios.slug, handle));
    if (studio?.accountUserId) {
      const [gym] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, studio.accountUserId));
      user = gym;
    }
  }
  if (!user) return new Response("Not found", { status: 404 });

  const [c] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, user.id)));
  if (!c) return new Response("Not found", { status: 404 });

  // Private client sessions are only downloadable by the coach themselves.
  if (!c.isPublic && (await getSessionUserId()) !== user.id)
    return new Response("Not found", { status: 404 });

  const [studio] = c.studioId
    ? await db.select().from(schema.studios).where(eq(schema.studios.id, c.studioId))
    : [];

  // Weekly classes anchor to this week's matching weekday and recur; one-offs
  // use their own date.
  const date =
    c.specificDate ??
    (() => {
      const d = new Date(`${mondayOfCurrentWeek(new Date(), c.timeZone)}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + c.dayOfWeek);
      return d.toISOString().slice(0, 10);
    })();

  const pageUrl = `${siteOrigin()}/${handle}/${c.id}`;
  const desc = c.links.length
    ? c.links.map((l) => `Book via ${l.label}: ${l.url}`).join("\n") + `\n\n${pageUrl}`
    : pageUrl;

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//fittlist//class//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-TIMEZONE:${c.timeZone}`,
    ...calendarTimeZoneLines([c.timeZone]),
    "BEGIN:VEVENT",
    `UID:${c.id}@fittlist.co`,
    `DTSTAMP:${stamp}`,
    zonedDateLine("DTSTART", date, c.startTime, c.timeZone),
    zonedEndLine(date, c.startTime, c.durationMin, c.timeZone),
  ];
  if (!c.specificDate)
    lines.push(...recurrenceLines(c.dayOfWeek, c.endsOn, c.skipDates, c.startTime, c.timeZone).map(fold));
  lines.push(fold(`SUMMARY:${esc(c.name)}`));
  const loc = studio ? `${studio.name}, ${studio.address}` : c.location ?? "";
  if (loc) lines.push(fold(`LOCATION:${esc(loc)}`));
  lines.push(fold(`DESCRIPTION:${esc(desc)}`));
  lines.push("END:VEVENT", "END:VCALENDAR");
  const body = lines.join("\r\n") + "\r\n";

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${handle}-${c.id.slice(0, 8)}.ics"`,
      "cache-control": c.isPublic ? "public, max-age=1800" : "private, no-store",
    },
  });
}
