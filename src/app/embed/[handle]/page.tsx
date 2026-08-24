import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { publicSchedules } from "@/lib/coachweek";
import { clockParts, fmtDayHeader, occurrenceEnded, runsOn, timeToMinutes, todayIso } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EmbeddedSchedule({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ studio?: string | string[] }> }) {
  const { handle } = await params;
  const requestedStudios = await searchParams;
  const studioFilter = new Set(typeof requestedStudios.studio === "string" ? [requestedStudios.studio] : requestedStudios.studio ?? []);
  const db = await getDb();
  const [person] = await db
    .select({ id: schema.users.id, name: schema.users.name, handle: schema.users.handle, shiftsPublic: schema.users.shiftsPublic })
    .from(schema.users)
    .where(eq(schema.users.handle, handle))
    .limit(1);
  if (!person?.handle) notFound();

  const classes = (await publicSchedules([{ id: person.id, shiftsPublic: person.shiftsPublic }]))
    .filter((row) => studioFilter.size === 0 || (!!row.studioId && studioFilter.has(row.studioId)));
  const studioIds = [...new Set(classes.map((row) => row.studioId).filter((id): id is string => !!id))];
  const studios = studioIds.length
    ? await db.select({ id: schema.studios.id, name: schema.studios.name, slug: schema.studios.slug }).from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studios.map((studio) => [studio.id, studio]));
  const start = new Date(`${todayIso()}T00:00:00Z`);
  const days: { iso: string; items: { id: string; name: string; time: string; place: string | null; href: string }[] }[] = [];
  for (let offset = 0; offset < 120; offset++) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    const iso = date.toISOString().slice(0, 10);
    const dow = (date.getUTCDay() + 6) % 7;
    const items = classes
      .filter((row) => runsOn(row, iso, dow) && !occurrenceEnded(iso, row.startTime, row.durationMin))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
      .map((row) => {
        const studio = row.studioId ? studioById.get(row.studioId) : null;
        const clock = clockParts(row.startTime);
        return {
          id: row.id,
          name: row.name,
          time: `${clock.hm} ${clock.ap}`,
          place: studio?.name ?? row.location,
          href: studio ? `/s/${studio.slug}/${row.id}?date=${iso}` : `/${person.handle}/${row.id}?date=${iso}`,
        };
      });
    if (items.length) days.push({ iso, items });
    if (days.length >= 24) break;
  }

  return (
    <main className="embed-calendar">
      <header><div><span>Schedule</span><h1>{person.name}</h1></div><Link href={`/${person.handle}`} target="_blank">View on FittList</Link></header>
      {days.length ? days.map((day) => (
        <section key={day.iso}>
          <h2>{fmtDayHeader(day.iso)}</h2>
          {day.items.map((item) => (
            <Link key={`${item.id}|${day.iso}`} href={item.href} target="_blank" className="embed-class">
              <div><strong>{item.name}</strong>{item.place && <span>{item.place}</span>}</div><time>{item.time}</time>
            </Link>
          ))}
        </section>
      )) : <p className="muted">No upcoming public classes.</p>}
      <footer><Link href="https://fittlist.co" target="_blank">Powered by FittList</Link></footer>
    </main>
  );
}
