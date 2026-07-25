import type { Metadata } from "next";
import { eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb, schema } from "@/db";
import {
  DAYS,
  blocksFill,
  fmtDateLong,
  fmtTime,
  mondayOfCurrentWeek,
  palForSeq,
  siteOrigin,
  timeToMinutes,
  weekBucket,
} from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { looksLikeBot, recordVisit } from "@/lib/visits";
import { Icon } from "@/components/Icon";
import { NotifyCta } from "@/components/NotifyCta";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) return { title: "fittlist" };
  const title = `${user.name} — this week's classes`;
  const description = `${user.name}'s coaching schedule — every studio they coach at, one link. Always the current week.`;
  const url = `${siteOrigin()}/${handle}`;
  return {
    title: `${user.name} — fittlist`,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "fittlist", type: "profile" },
    twitter: { card: "summary", title, description },
  };
}

export default async function PublicPage({ params }: Props) {
  const { handle } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) notFound();

  // Count the visit — but a trainer viewing their own page doesn't count,
  // and neither do crawlers (link unfurlers would inflate the number).
  const [viewerId, hdrs] = await Promise.all([getSessionUserId(), headers()]);
  if (viewerId !== user.id && !looksLikeBot(hdrs.get("user-agent"))) {
    try {
      await recordVisit(user.id);
    } catch (err) {
      console.error("visit rollup failed", err);
    }
  }

  const allClassRows = await db.select().from(schema.classes).where(eq(schema.classes.userId, user.id));
  // The public page is always "this week": weekly classes plus one-offs dated
  // inside the current Mon–Sun week. Future/past one-offs never leak here.
  const classRows = allClassRows.filter((c) => weekBucket(c.specificDate) === "current");
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

  // "Mon, July 20" for each weekday of the current week — the day heading.
  const weekDateLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${mondayOfCurrentWeek()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return fmtDateLong(d.toISOString().slice(0, 10));
  });

  const isOwner = viewerId === user.id;

  return (
    <div className="pub screen" data-theme={user.theme}>
      {isOwner && (
        <div className="previewbar">
          <span>
            <Icon name="visibility" size={16} className="pv-eye" /> Previewing your page
          </span>
          <Link className="previewback" href="/app">
            ← Back to your account
          </Link>
        </div>
      )}
      <div className="pubhero">
        <div className="eyebrow">Coaching schedule · this week</div>
        <div className="big">{user.name}</div>
        <div className="gyms">Every studio they coach at, one page.</div>
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
        ) : user.theme === "poster" ? (
          <div className="ps-week">
            {DAYS.map((day, di) =>
              byDay[di].length ? (
                <div key={day} className="ps-daygroup">
                  <div className="ps-daycol">{weekDateLabels[di]}</div>
                  <div className="ps-daycards">
                    {byDay[di].map((c) => {
                      const s = studioById.get(c.studioId);
                      return (
                        <Link key={c.id} className="ps-event" href={`/${handle}/${c.id}`}>
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
              ) : null,
            )}
          </div>
        ) : user.theme === "blocks" ? (
          <div className="blweek" style={{ marginLeft: -18, marginRight: -18 }}>
            {byDay.flat().map((c, idx, arr) => {
              const s = studioById.get(c.studioId);
              const bf = blocksFill(s?.seq ?? 1);
              const showDay = idx === 0 || arr[idx - 1].dayOfWeek !== c.dayOfWeek;
              return (
                <div
                  key={c.id}
                  className="bl-band"
                  style={{ ["--bbg" as string]: bf.bg, ["--bfg" as string]: bf.fg }}
                >
                  <span className="bl-day">{showDay ? DAYS[c.dayOfWeek] : ""}</span>
                  <span className="bl-body">
                    <span className="bl-nm">{c.name}</span>
                    <span className="bl-mt">
                      {fmtTime(c.startTime)} · {c.durationMin} min
                    </span>
                    {s && <span className="bl-loc">{s.address}</span>}
                    {c.links.map((l, i) => (
                      <a
                        key={i}
                        className="bl-book"
                        href={l.url}
                        target="_blank"
                        rel="noopener nofollow"
                        style={{ marginRight: 14 }}
                      >
                        Book via {l.label} ↗
                      </a>
                    ))}
                  </span>
                </div>
              );
            })}
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
                  const bf = blocksFill(s?.seq ?? 1);
                  return (
                    <div
                      key={c.id}
                      className="class-card"
                      style={{ ["--bbg" as string]: bf.bg, ["--bfg" as string]: bf.fg }}
                    >
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
          <Wordmark variant="ink" className="mw-logo" />
          {" "}— coach classes? <Link href={`/?via=${handle}`}>Claim your page</Link>
        </div>
      </div>
    </div>
  );
}
