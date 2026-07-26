import type { Metadata } from "next";
import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { fmtDateLong, fmtTime, siteOrigin, timeToMinutes } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { NotifyCta } from "@/components/NotifyCta";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 28; // a continuous forward window

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) return { title: "fittlist" };
  return {
    title: `${user.name}'s schedule · fittlist`,
    alternates: { canonical: `${siteOrigin()}/${handle}/schedule` },
  };
}

export default async function SchedulePage({ params }: Props) {
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

  // Continuous forward calendar: each date from today with classes - weekly
  // classes recur on their weekday, one-offs land on their date.
  const start = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const days: { iso: string; label: string; items: typeof classRows }[] = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    const items = classRows
      .filter((c) => (c.specificDate ? c.specificDate === iso : c.dayOfWeek === dow))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    if (items.length) days.push({ iso, label: fmtDateLong(iso), items });
  }

  const isOwner = (await getSessionUserId()) === user.id;

  return (
    <div className="pub screen" data-theme={user.theme}>
      {isOwner && (
        <div className="previewbar">
          <span>
            <Icon name="visibility" size={16} className="pv-eye" /> Previewing your schedule
          </span>
          <BackLink className="previewback" href="/app">
            ← Back to your account
          </BackLink>
        </div>
      )}
      <div className="pubhero">
        <BackLink className="pubback" href={`/${handle}`}>
          ← {user.name}
        </BackLink>
        <div className="eyebrow">Coaching schedule</div>
        <div className="big">Schedule</div>
        <NotifyCta trainerName={user.name} handle={handle} />
      </div>
      <div className="pubbody">
        {days.length === 0 ? (
          <div className="empty-block" style={{ background: "#fff" }}>
            <div className="glyph">MON–SUN</div>
            <h2>Nothing on the calendar</h2>
            <p>
              {user.name} hasn&rsquo;t posted classes yet. Join the list and you&rsquo;ll get an
              email the moment they do.
            </p>
          </div>
        ) : (
          <div className="ps-week">
            {days.map((d) => (
              <div key={d.iso} className="ps-daygroup">
                <div className="ps-daycol">{d.label}</div>
                <div className="ps-daycards">
                  {d.items.map((c) => {
                    const s = studioById.get(c.studioId);
                    return (
                      <Link key={`${d.iso}-${c.id}`} className="ps-event" href={`/${handle}/${c.id}`}>
                        <span className="ps-etimecol">
                          <span className="ps-etime">{fmtTime(c.startTime)}</span>
                          <span className="ps-edur">{c.durationMin} min</span>
                        </span>
                        <span className="ps-ebody">
                          <span className="ps-enm">{c.name}</span>
                          {s && <span className="ps-estudio">{s.name}</span>}
                        </span>
                        <span className="ps-echev" aria-hidden="true">
                          <Icon name="chevron_right" size={20} />
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="madewith">
          Made with <Wordmark variant="ink" className="mw-logo" />. Coach classes?{" "}
          <Link href={`/?via=${handle}`}>Claim your page</Link>
        </div>
      </div>
    </div>
  );
}
