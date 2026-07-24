import type { Metadata } from "next";
import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { DAYS, fmtTime, palForSeq, timeToMinutes } from "@/lib/format";
import { NotifyCta } from "@/components/NotifyCta";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) return { title: "fittlist" };
  return {
    title: `${user.name} — fittlist`,
    description: `${user.name}'s coaching schedule, this week — every studio, one link.`,
  };
}

export default async function PublicPage({ params }: Props) {
  const { handle } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) notFound();

  const classRows = await db.select().from(schema.classes).where(eq(schema.classes.userId, user.id));
  const studioIds = [...new Set(classRows.map((c) => c.studioId))];
  const studioRows = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studioRows.map((s) => [s.id, s]));

  const byDay = DAYS.map((_, di) =>
    classRows
      .filter((c) => c.dayOfWeek === di)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)),
  );
  const gymNames = [...new Set(classRows.map((c) => studioById.get(c.studioId)?.name).filter(Boolean))];

  return (
    <div className="pub screen">
      <div className="pubhero">
        <div className="eyebrow">Coaching schedule · this week</div>
        <div className="big">{user.name}</div>
        <div className="gyms">
          {gymNames.length
            ? gymNames.join(" + ")
            : "Schedules for every studio they coach at, in one place."}
        </div>
        <NotifyCta trainerName={user.name} handle={handle} />
      </div>
      <div className="pubbody">
        {classRows.length === 0 ? (
          <div className="empty-block" style={{ background: "#fff" }}>
            <div className="glyph">MON–SUN</div>
            <h2>Nothing published yet</h2>
            <p>
              {user.name} hasn&rsquo;t posted this week&rsquo;s classes. Join the list and
              you&rsquo;ll get an email the moment they do.
            </p>
          </div>
        ) : (
          DAYS.map((day, di) => {
            if (!byDay[di].length) return null;
            return (
              <div key={day}>
                <div className="daylabel">{day}</div>
                {byDay[di].map((c) => {
                  const s = studioById.get(c.studioId);
                  const p = palForSeq(s?.seq ?? 1);
                  return (
                    <div key={c.id} className="class-card">
                      <div className="rail" style={{ background: p.rail }} />
                      <div className="time">{fmtTime(c.startTime)}</div>
                      <div className="body">
                        <div className="name">{c.name}</div>
                        <div className="meta">
                          {c.durationMin} min{s ? ` · ${s.address}` : ""}
                        </div>
                        {s && (
                          <span className="loctag" style={{ background: p.bg, color: p.tx }}>
                            <span className="swd" style={{ background: p.rail }} />
                            {s.name}
                          </span>
                        )}
                        {c.links.length > 0 && (
                          <>
                            <br />
                            {c.links.map((l, i) => (
                              <a
                                key={i}
                                className="booklink"
                                href={l.url}
                                target="_blank"
                                rel="noopener nofollow"
                              >
                                Book via {l.label} ↗
                              </a>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
        <div className="madewith">
          Made with{" "}
          <Wordmark className="mw-logo" />
          {" "}— coach classes? <Link href="/">Claim your page</Link>
        </div>
      </div>
    </div>
  );
}
