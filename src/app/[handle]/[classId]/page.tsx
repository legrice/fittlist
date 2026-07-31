import type { Metadata } from "next";
import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { fmtDateLong, fmtTime, occurrenceEnded, runsOn, siteOrigin, todayIso } from "@/lib/format";
import { hiddenFrom, isBlocked } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";
import { fansVisible } from "@/lib/flags";
import { viewerLook } from "@/lib/look";
import { floatingEnd, floatingStart, weeklyRule } from "@/lib/ics";
import { avatarColor } from "@/lib/avatar";
import { studioPath } from "@/lib/studio";
import { BackLink } from "@/components/BackLink";
import { CoachLink } from "@/components/CoachLink";
import { EventActions } from "@/components/EventActions";
import { GoingButton } from "@/components/GoingButton";
import { Roster } from "@/components/Roster";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ handle: string; classId: string }>;
  searchParams: Promise<{ d?: string; from?: string; g?: string }>;
};

// The link preview is the mini poster: /api/og/class composes the date tile,
// the name, the when-and-where and the coach, and the ?d= the share links
// carry rides through so the poster names the same day the sender meant.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { handle, classId } = await params;
  const { d, g } = await searchParams;
  if (!UUID_RE.test(classId)) return { title: "fittlist" };
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) return { title: "fittlist" };
  const [c] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, user.id)));
  if (!c || !c.isPublic) return { title: "fittlist" };
  const [studio] = c.studioId
    ? await db.select().from(schema.studios).where(eq(schema.studios.id, c.studioId))
    : [];
  const title = `${c.name} with ${user.name} · fittlist`;
  const place = studio?.name ?? c.location ?? "";
  const description = [fmtTime(c.startTime), `${c.durationMin} min`, place]
    .filter(Boolean)
    .join(" · ");
  const dOk = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  const gOk = g && /^[a-z0-9-]{1,40}$/i.test(g) ? g : null;
  const imgQs = [dOk && `d=${dOk}`, gOk && `g=${gOk}`].filter(Boolean).join("&");
  const image = `${siteOrigin()}/api/og/class/${c.id}${imgQs ? `?${imgQs}` : ""}`;
  const url = `${siteOrigin()}/${handle}/${c.id}${dOk ? `?d=${dOk}` : ""}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "fittlist",
      images: [{ url: image, width: 1200, height: 630, alt: c.name }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function EventPage({ params, searchParams }: Props) {
  const { handle, classId } = await params;
  const { d: dParam, from } = await searchParams;
  if (!UUID_RE.test(classId)) notFound();

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) notFound();

  const [c] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, user.id)));
  if (!c) notFound();

  const viewerId = await getSessionUserId();
  if (await isBlocked(user.id, viewerId)) notFound();
  const isOwner = viewerId === user.id;
  // Private client sessions aren't public; only the owner can open their page.
  if (!c.isPublic && !isOwner) notFound();

  const [studio] = c.studioId
    ? await db.select().from(schema.studios).where(eq(schema.studios.id, c.studioId))
    : [];

  // A weekly class shows this week's date for its weekday; a one-off shows its
  // own. A ?d= from the schedule pins the occurrence that was tapped, so
  // "next Wednesday" opens as next Wednesday rather than this one.
  const dowOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  const askedIso =
    dParam && /^\d{4}-\d{2}-\d{2}$/.test(dParam) && !Number.isNaN(Date.parse(dParam))
      ? dParam
      : null;
  // Only honour a date this class actually runs on — which rules out a week
  // past its end date, and a single week cancelled out of it.
  const askedFits = askedIso ? runsOn(c, askedIso, dowOf(askedIso)) : false;
  // Otherwise show the next date it does run. A saved link to a cancelled
  // Friday should land on the following one, not on a class that isn't on.
  // The scan starts today rather than at this week's Monday, and skips an
  // occurrence whose end time has gone by: a link with no date on it should
  // open on one you could still turn up to. From Monday, a Monday class opened
  // on Monday for the rest of the week, with no way to add it.
  const nextIso =
    c.specificDate ??
    (() => {
      const start = new Date(`${todayIso()}T00:00:00Z`);
      for (let i = 0; i < 366; i++) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        const iso = d.toISOString().slice(0, 10);
        if (
          runsOn(c, iso, (d.getUTCDay() + 6) % 7) &&
          !occurrenceEnded(iso, c.startTime, c.durationMin)
        )
          return iso;
      }
      // Every occurrence is behind an end date: fall back to today so the page
      // still renders something dated rather than nothing.
      return todayIso();
    })();
  const whenIso = askedFits ? askedIso! : nextIso;

  // "Add to calendar" targets. Google gets a prefilled template link; Apple and
  // Outlook get the downloadable .ics. Weekly classes carry a weekly recurrence.
  const classUrl = `${siteOrigin()}/${handle}/${c.id}`;
  const locationText = studio ? `${studio.name}, ${studio.address}` : c.location ?? "";
  const gcalDetails = c.links.length
    ? c.links.map((l) => `Book via ${l.label}: ${l.url}`).join("\n") + `\n\n${classUrl}`
    : classUrl;
  const gcalParams = new URLSearchParams({
    action: "TEMPLATE",
    text: c.name,
    dates: `${floatingStart(whenIso, c.startTime)}/${floatingEnd(whenIso, c.startTime, c.durationMin)}`,
    details: gcalDetails,
  });
  if (locationText) gcalParams.set("location", locationText);
  if (!c.specificDate) gcalParams.set("recur", weeklyRule(c.dayOfWeek, c.endsOn));
  const googleUrl = `https://calendar.google.com/calendar/render?${gcalParams.toString()}`;
  const icsHref = `/api/cal/${handle}/${c.id}`;

  // "I'm going" lives here rather than on the schedule rows — one tap into the
  // class, then commit. Owners don't attend their own classes.
  // Already run: nothing to add. A shared link carries its date, so an old one
  // opens on the day it named, and that day can be behind us.
  const past = occurrenceEnded(whenIso, c.startTime, c.durationMin);
  const canGo = !isOwner && !!viewerId && c.isPublic && !past && (await fansVisible());
  // Joanne's link, opened by someone without an account: the details are all
  // here, and saying "I'm in" is what the door is for.
  const askToJoin = !viewerId && c.isPublic && !past && (await fansVisible());
  let going = false;
  let myCompanions: string[] = [];
  let viewerHandle: string | null = null;
  if (viewerId) {
    const [v] = await db
      .select({ handle: schema.users.handle })
      .from(schema.users)
      .where(eq(schema.users.id, viewerId));
    viewerHandle = v?.handle ?? null;
  }
  if (canGo) {
    const [row] = await db
      .select({ id: schema.attendances.id, companions: schema.attendances.companions })
      .from(schema.attendances)
      .where(
        and(
          eq(schema.attendances.userId, viewerId!),
          eq(schema.attendances.classId, c.id),
          eq(schema.attendances.occurrenceDate, whenIso),
        ),
      );
    going = !!row;
    myCompanions = row?.companions ?? [];
  }

  // The coach's roster for this occurrence: who marked Going, owner only.
  // They marked it at this coach; showing the coach is what the mark meant.
  // A fellow goer gets the same faces minus themselves: the price of seeing
  // the room is being in it.
  let roster: { name: string; photo: string | null; color: string; handle: string | null }[] = [];
  let alsoGoing: typeof roster = [];
  if (isOwner || going) {
    const marks = await db
      .select({ userId: schema.attendances.userId })
      .from(schema.attendances)
      .where(
        and(eq(schema.attendances.classId, c.id), eq(schema.attendances.occurrenceDate, whenIso)),
      );
    let ids = [...new Set(marks.map((m) => m.userId))];
    if (!isOwner) {
      const hidden = await hiddenFrom(viewerId!);
      ids = ids.filter((id) => id !== viewerId && !hidden.has(id));
    }
    const people = ids.length
      ? await db.select().from(schema.users).where(inArray(schema.users.id, ids))
      : [];
    const faces = people
      .map((p) => ({
        name: p.name.trim() || p.email.split("@")[0],
        photo: p.photo,
        color: avatarColor(p),
        handle: p.handle,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (isOwner) roster = faces;
    else alsoGoing = faces;
  }

  // Back goes where you actually came from — off the Following tab it returns
  // there, not into a coach's calendar you never opened. (`from=home` is the
  // link's own token; the tab it names is Following.)
  const backHref = from === "home" ? "/feed" : `/${handle}/schedule`;
  const backLabel = from === "home" ? "Back to Following" : `Back to ${user.name}’s schedule`;

  return (
    <div
      className={`pub evpage${canGo ? " hascta" : ""}`}
      data-theme={user.theme}
      data-mode={await viewerLook()}
    >
      {isOwner && (
        <div className="previewbar">
          <span>
            <Icon name="visibility" size={16} className="pv-eye" /> Previewing your page
          </span>
          <BackLink className="previewback" href="/app">
            ← Back to your account
          </BackLink>
        </div>
      )}
      <div className="evtopbar">
        <BackLink className="evback" href={backHref} label={backLabel}>
          <Icon name="arrow_back" size={21} />
        </BackLink>
      </div>
      <div className="evwrap">
        {c.classType && <span className="evtype">{c.classType}</span>}
        <h1 className="evname">{c.name}</h1>
        <CoachLink className="evcoach" href={`/${handle}`}>
          {user.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="evcoach-av" src={user.photo} alt="" />
          ) : (
            <span
              className="evcoach-av evcoach-av-empty"
              style={{ background: avatarColor(user) }}
              aria-hidden="true"
            >
              {user.name.trim().charAt(0).toUpperCase() || "?"}
            </span>
          )}
          <span className="evcoach-nm">{user.name}</span>
          <Icon name="chevron_right" size={16} />
        </CoachLink>

        <div className="evfacts">
          <div className="evfact">
            <Icon name="event" size={20} />
            <span className="evfact-txt">
              <span className="t">{fmtDateLong(whenIso)}</span>
              <span className="s">
                {fmtTime(c.startTime)} · {c.durationMin} min
              </span>
            </span>
          </div>
          {studio ? (
            <Link className="evfact" href={studioPath(studio)}>
              <Icon name="place" size={20} />
              <span className="evfact-txt">
                <span className="t">{studio.name}</span>
                <span className="s">{studio.address}</span>
              </span>
            </Link>
          ) : (
            c.location && (
              <div className="evfact">
                <Icon name="place" size={20} />
                <span className="evfact-txt">
                  <span className="t">{c.location}</span>
                </span>
              </div>
            )
          )}
        </div>

        {/* No booking link means nothing to say — an empty row beats a line of
            filler where a button would be. */}
        {c.links.length > 0 && (
          <div className="evbook">
            {c.links.map((l, i) => (
              <a
                key={i}
                className="btn si evbtn"
                href={l.url}
                target="_blank"
                rel="noopener nofollow"
              >
                Book via {l.label}
                <Icon name="north_east" size={18} className="evbtn-ico" />
              </a>
            ))}
          </div>
        )}
        <EventActions
          googleUrl={googleUrl}
          icsHref={icsHref}
          shareUrl={classUrl}
          shareTitle={c.name}
        />

        {c.description?.trim() && (
          <section className="evsec">
            <h2 className="evsec-h">Details</h2>
            <p className="evdesc">{c.description}</p>
          </section>
        )}

        {isOwner && (
          <section className="evsec">
            <h2 className="evsec-h">
              Going{roster.length > 0 ? ` · ${roster.length}` : ""}
            </h2>
            <Roster people={roster} />
          </section>
        )}

        {alsoGoing.length > 0 && (
          <section className="evsec">
            <h2 className="evsec-h">Also going · {alsoGoing.length}</h2>
            <Roster people={alsoGoing} />
          </section>
        )}

        {past && !isOwner && <p className="classsheet-gone evgone">This one has already run.</p>}

        {/* Visitors only — anyone signed in already has an account. */}
        {!viewerId && (
          <div className="madewith">
            Made with <Wordmark variant="ink" className="mw-logo" />. Coach classes?{" "}
            <Link href={`/?via=${handle}`}>Claim your page</Link>
          </div>
        )}
      </div>
      {askToJoin && (
        <div className="evcta">
          <div className="evcta-inner">
            <p className="evctanote">Add it to your week and see who else is going.</p>
            <Link className="btn evctabtn" href={`/?via=${handle}`}>
              <Icon name="add" size={18} /> Sign up to say you&rsquo;re going
            </Link>
          </div>
        </div>
      )}
      {/* The one commitment on this page sits under the thumb, pinned. */}
      {canGo && (
        <GoingButton
          classId={c.id}
          iso={whenIso}
          initialGoing={going}
          hasBooking={c.links.length > 0}
          className={c.name}
          dateLong={fmtDateLong(whenIso)}
          shareUrl={`${classUrl}?d=${whenIso}`}
          initialCompanions={myCompanions}
          myHandle={viewerHandle}
          canAnnounce={going}
        />
      )}
    </div>
  );
}
