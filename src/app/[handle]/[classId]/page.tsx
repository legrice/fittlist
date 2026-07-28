import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { fmtDateLong, fmtTime, mondayOfCurrentWeek, siteOrigin } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { fansVisible } from "@/lib/flags";
import { viewerLook } from "@/lib/look";
import { BYDAY, floatingEnd, floatingStart } from "@/lib/ics";
import { avatarColor } from "@/lib/avatar";
import { BackLink } from "@/components/BackLink";
import { EventActions } from "@/components/EventActions";
import { GoingButton } from "@/components/GoingButton";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ handle: string; classId: string }>;
  searchParams: Promise<{ d?: string; from?: string }>;
};

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
  const isOwner = viewerId === user.id;
  // Private client sessions aren't public; only the owner can open their page.
  if (!c.isPublic && !isOwner) notFound();

  const [studio] = c.studioId
    ? await db.select().from(schema.studios).where(eq(schema.studios.id, c.studioId))
    : [];

  // A weekly class shows this week's date for its weekday; a one-off shows its
  // own. A ?d= from the schedule pins the occurrence that was tapped, so
  // "next Wednesday" opens as next Wednesday rather than this one.
  const thisWeekIso =
    c.specificDate ??
    (() => {
      const d = new Date(`${mondayOfCurrentWeek()}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + c.dayOfWeek);
      return d.toISOString().slice(0, 10);
    })();
  const askedIso =
    dParam && /^\d{4}-\d{2}-\d{2}$/.test(dParam) && !Number.isNaN(Date.parse(dParam))
      ? dParam
      : null;
  // Only honour a date this class actually falls on.
  const askedFits = askedIso
    ? c.specificDate
      ? c.specificDate === askedIso
      : (new Date(`${askedIso}T00:00:00Z`).getUTCDay() + 6) % 7 === c.dayOfWeek
    : false;
  const whenIso = askedFits ? askedIso! : thisWeekIso;
  const mapsUrl = studio
    ? `https://maps.google.com/?q=${encodeURIComponent(`${studio.name}, ${studio.address}`)}`
    : null;

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
  if (!c.specificDate) gcalParams.set("recur", `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[c.dayOfWeek]}`);
  const googleUrl = `https://calendar.google.com/calendar/render?${gcalParams.toString()}`;
  const icsHref = `/api/cal/${handle}/${c.id}`;

  // "I'm going" lives here rather than on the schedule rows — one tap into the
  // class, then commit. Owners don't attend their own classes.
  const canGo = !isOwner && !!viewerId && c.isPublic && (await fansVisible());
  let going = false;
  if (canGo) {
    const [row] = await db
      .select({ id: schema.attendances.id })
      .from(schema.attendances)
      .where(
        and(
          eq(schema.attendances.userId, viewerId!),
          eq(schema.attendances.classId, c.id),
          eq(schema.attendances.occurrenceDate, whenIso),
        ),
      );
    going = !!row;
  }

  // Back goes where you actually came from — off Home it returns to Home, not
  // into a coach's calendar you never opened.
  const backHref = from === "home" ? "/feed" : `/${handle}/schedule`;
  const backLabel = from === "home" ? "Back to Home" : `Back to ${user.name}’s schedule`;

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
        <Link className="evcoach" href={`/${handle}`}>
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
        </Link>

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
            <a className="evfact" href={mapsUrl!} target="_blank" rel="noopener nofollow">
              <Icon name="place" size={20} />
              <span className="evfact-txt">
                <span className="t">{studio.name}</span>
                <span className="s">{studio.address}</span>
              </span>
            </a>
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

        <div className="madewith">
          Made with <Wordmark variant="ink" className="mw-logo" />. Coach classes?{" "}
          <Link href={`/?via=${handle}`}>Claim your page</Link>
        </div>
      </div>
      {/* The one commitment on this page sits under the thumb, pinned. */}
      {canGo && (
        <GoingButton
          classId={c.id}
          iso={whenIso}
          initialGoing={going}
          hasBooking={c.links.length > 0}
        />
      )}
    </div>
  );
}
