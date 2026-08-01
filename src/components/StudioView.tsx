import { and, eq, inArray, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { fmtDayHeader, runsOn, timeToMinutes, todayIso } from "@/lib/format";
import { fansVisible } from "@/lib/flags";
import { avatarColor, initialOf } from "@/lib/avatar";
import { viewerLook } from "@/lib/look";
import { getSessionUserId } from "@/lib/session";
import { mapsUrlFor } from "@/lib/studio";
import { studioAccess } from "@/lib/studioaccess";
import { AppChrome } from "@/components/AppChrome";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { InstagramGlyph } from "@/components/InstagramGlyph";
import { StudioMenu } from "@/components/StudioMenu";
import { StudioSchedule, type StudioDay } from "@/components/StudioSchedule";
import { Wordmark } from "@/components/Wordmark";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One section per URL, the same shape a person's profile uses. */
export type StudioTab = "schedule" | "about" | "contact";

// Slug is the address; the id still resolves, so links made before slugs (and
// anything holding a raw id) keep working.
export async function findStudio(slug: string) {
  const db = await getDb();
  const [s] = await db
    .select()
    .from(schema.studios)
    .where(
      UUID_RE.test(slug)
        ? or(eq(schema.studios.slug, slug), eq(schema.studios.id, slug))
        : eq(schema.studios.slug, slug),
    );
  return s;
}

// A studio's own page, built on the coach profile layout: photo, name, what
// kind of gym it is, where it is, about, and how to reach it.
//
// A studio running its own schedule wears the same tabs a person does, for the
// same reason: the schedule is what the link is for, so it leads, and every
// section has its own URL. A directory entry with no schedule has nothing to
// put in tabs and keeps the single sectioned page it always had, which is most
// of the table and should stay that way.
export async function StudioView({
  slug,
  tab: wanted,
  from,
}: {
  slug: string;
  /** "auto" lets the schedule lead when there is one, About when there isn't. */
  tab: StudioTab | "auto";
  from?: string;
}) {
  const s = await findStudio(slug);
  if (!s) notFound();

  const db = await getDb();
  // A studio is a screen of the app like any other: signed in, the header
  // rides above and the tab bar below, same as a coach's profile.
  let viewerKind: string | null = null;
  let viewerId: string | null = null;
  let signedIn = false;
  if (await fansVisible()) {
    viewerId = await getSessionUserId();
    if (viewerId) {
      const [viewer] = await db
        .select({ kind: schema.users.kind })
        .from(schema.users)
        .where(eq(schema.users.id, viewerId));
      if (viewer) {
        signedIn = true;
        viewerKind = viewer.kind;
      }
    }
  }
  // Unclaimed, any coach may fix it; claimed, only the people who run it. The
  // rule lives in studioAccess so the page and the action can't disagree.
  const access = await studioAccess(
    s.id,
    viewerId && viewerKind ? { id: viewerId, kind: viewerKind } : null,
  );
  const canEdit = access.canEdit;

  // The gym's own week, if it runs one. Seven days from today, expanded the
  // same way every other surface expands a recurrence.
  let days: StudioDay[] = [];
  if (s.accountUserId) {
    const rows = (
      await db
        .select()
        .from(schema.classes)
        .where(
          and(eq(schema.classes.userId, s.accountUserId), eq(schema.classes.studioId, s.id)),
        )
    ).filter((c) => c.isPublic);
    const start = new Date(`${todayIso()}T00:00:00Z`);
    for (let i = 0; i < 7; i++) {
      const dt = new Date(start);
      dt.setUTCDate(start.getUTCDate() + i);
      const iso = dt.toISOString().slice(0, 10);
      const dow = (dt.getUTCDay() + 6) % 7;
      const items = rows
        .filter((c) => runsOn(c, iso, dow))
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
        .map((c) => ({
          id: c.id,
          name: c.name,
          startTime: c.startTime,
          durationMin: c.durationMin,
        }));
      if (items.length) days.push({ iso, label: fmtDayHeader(iso), items });
    }
  }
  const hasSchedule = !!s.accountUserId;
  const tab: StudioTab = wanted === "auto" ? (hasSchedule ? "schedule" : "about") : wanted;
  // Without a schedule there are no tabs, so there is nothing to divide the
  // page into: it stays the single sectioned page it has always been, which is
  // what almost every row in the directory is and should remain.
  const show = (section: StudioTab) => !hasSchedule || tab === section;

  // A tab we know by name gets a named destination; anything else walks back
  // through history, which is where they actually tapped from.
  const backTo =
    from === "discover"
      ? { href: "/discover", label: "Back to Discover" }
      : from === "home"
        ? { href: "/feed", label: "Back to Following" }
        : from === "schedule"
          ? { href: "/app", label: "Back to your schedule" }
          : null;

  const hasContact = !!(s.contactEmail || s.phone || s.website || s.instagram);

  // Who teaches here: everyone who picked this studio in setup or has a class
  // at it. The same union the coach profile uses for "Where I coach", from the
  // other end.
  const [picked, classRows] = await Promise.all([
    db
      .select({ userId: schema.coachStudios.userId })
      .from(schema.coachStudios)
      .where(eq(schema.coachStudios.studioId, s.id)),
    db
      .select({ userId: schema.classes.userId })
      .from(schema.classes)
      .where(eq(schema.classes.studioId, s.id)),
  ]);
  const coachIds = [...new Set([...picked.map((p) => p.userId), ...classRows.map((c) => c.userId)])];
  const coachRows = coachIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, coachIds))
    : [];
  const coaches = coachRows
    .filter((u) => u.kind !== "fan" && !!u.handle)
    .map((u) => ({
      id: u.id,
      handle: u.handle!,
      name: u.name,
      title: u.title ?? "",
      photo: u.photo,
      color: avatarColor(u),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className={`pub profile${signedIn ? " hasnav" : ""}`} data-mode={await viewerLook()}>
      <div className="profwrap">
        {signedIn && viewerId && <AppChrome userId={viewerId} bar />}
        <div className="pubhead">
          {/* The two page controls face each other across the top, the way
              they do on a class: out on the left, everything you can do on
              the right. The name gets the width to itself underneath. */}
          <div className="studiotop">
            {signedIn ? (
              <BackLink className="evback" href={backTo?.href} label={backTo?.label ?? "Back"}>
                <Icon name="arrow_back" size={21} />
              </BackLink>
            ) : (
              <span aria-hidden="true" />
            )}
            {/* Everything you can do with a studio, behind one set of dots:
                share, suggest, report, and for coaches the edit. */}
            <StudioMenu
            slug={s.slug ?? ""}
            canEdit={canEdit}
            claimed={access.claimed}
            signedIn={signedIn}
            studio={{
              id: s.id,
              name: s.name,
              address: s.address,
              types: s.types,
              about: s.about ?? "",
              photo: s.photo,
              contactEmail: s.contactEmail ?? "",
              phone: s.phone ?? "",
              website: s.website ?? "",
              instagram: s.instagram ?? "",
            }}
            />
          </div>
          <h1 className="profname">{s.name}</h1>
          {/* Said once, quietly: it explains why the pencil is gone for
              everyone else, and it is the thing that makes the page worth
              trusting. */}
          {access.claimed && (
            <p className="studiorun">
              <Icon name="verified" size={15} /> Kept by the studio
            </p>
          )}
          {/* The way into the rota, for the people who run the place. */}
          {access.isManager && s.accountUserId && (
            <Link className="btn ghost studiomanage" href={`/s/${s.slug ?? s.id}/manage`}>
              <Icon name="calendar_month" size={17} /> The schedule
            </Link>
          )}
        </div>
        {s.types.length > 0 && (
          <div className="studiotypes">
            {s.types.map((t) => (
              <span key={t} className="studiotype">
                {t}
              </span>
            ))}
          </div>
        )}

        {s.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="profphoto" src={s.photo} alt={s.name} />
        ) : (
          <div
            className="profphoto profphoto-empty"
            style={{ background: avatarColor({ id: s.id }) }}
            aria-hidden="true"
          >
            {initialOf(s.name)}
          </div>
        )}

        {/* The tabs are links, one URL per section, exactly as a person's
            profile does it. They only appear when there is a schedule to lead
            with: two tabs over two short sections is worse than the sectioned
            page underneath. */}
        {hasSchedule && (
          <div className="pubtabs studiotabs" aria-label="Studio sections">
            <Link
              href={`/s/${s.slug ?? s.id}`}
              aria-current={tab === "schedule" ? "page" : undefined}
              className={`pubtab${tab === "schedule" ? " sel" : ""}`}
              scroll={false}
            >
              Schedule
            </Link>
            <Link
              href={`/s/${s.slug ?? s.id}/about`}
              aria-current={tab === "about" ? "page" : undefined}
              className={`pubtab${tab === "about" ? " sel" : ""}`}
              scroll={false}
            >
              About
            </Link>
            {hasContact && (
              <Link
                href={`/s/${s.slug ?? s.id}/contact`}
                aria-current={tab === "contact" ? "page" : undefined}
                className={`pubtab${tab === "contact" ? " sel" : ""}`}
                scroll={false}
              >
                Contact
              </Link>
            )}
          </div>
        )}

        {hasSchedule && tab === "schedule" && <StudioSchedule slug={s.slug ?? s.id} days={days} />}

        {show("about") && s.about?.trim() && (
          <div className="studsec studsec-first">
            <h2 className="prof-sec-h">About</h2>
            <p className="profabout">{s.about}</p>
          </div>
        )}

        {show("about") && (
        <div className="profstudios studsec">
          <h2 className="prof-sec-h">Where it is</h2>
          <a
            className="profstudio"
            href={mapsUrlFor(s)}
            target="_blank"
            rel="noopener nofollow"
          >
            <span className="profstudio-ic">
              <Icon name="place" size={20} />
            </span>
            <span className="profstudio-txt">
              <span className="nm">{s.address}</span>
              <span className="ad">Get directions</span>
            </span>
          </a>
        </div>
        )}

        {show("about") && coaches.length > 0 && (
          <div className="profstudios studsec">
            <h2 className="prof-sec-h">Coaches here</h2>
            {coaches.map((c) => (
              <Link key={c.id} className="coachstudio" href={`/${c.handle}`}>
                {c.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="coachstudio-av" src={c.photo} alt="" />
                ) : (
                  <span
                    className="coachstudio-av coachstudio-av-empty"
                    style={{ background: c.color }}
                    aria-hidden="true"
                  >
                    {(c.name.trim().charAt(0) || "?").toUpperCase()}
                  </span>
                )}
                <span className="coachstudio-txt">
                  <span className="nm">{c.name}</span>
                  {c.title && <span className="ad">{c.title}</span>}
                </span>
                <span className="coachstudio-chev">
                  <Icon name="chevron_right" size={18} />
                </span>
              </Link>
            ))}
          </div>
        )}

        {show("contact") && hasContact && (
          <div className={`studsec${hasSchedule ? " studsec-first" : ""}`}>
            <h2 className="prof-sec-h">Contact</h2>
            <div className="contactlist">
              {s.contactEmail && (
                <a className="proflink" href={`mailto:${s.contactEmail}`}>
                  <Icon name="mail" size={18} /> Email
                </a>
              )}
              {s.phone && (
                <a className="proflink" href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>
                  <Icon name="call" size={18} /> Call
                </a>
              )}
              {s.instagram && (
                <a
                  className="proflink"
                  href={`https://instagram.com/${s.instagram}`}
                  target="_blank"
                  rel="noopener nofollow"
                >
                  <InstagramGlyph /> Instagram
                </a>
              )}
              {s.website && (
                <a className="proflink" href={s.website} target="_blank" rel="noopener nofollow">
                  <Icon name="public" size={18} /> Website
                </a>
              )}
            </div>
          </div>
        )}

        {!signedIn && (
          <div className="madewith">
            Made with <Wordmark variant="ink" className="mw-logo" />. Coach classes?{" "}
            <Link href="/">Claim your page</Link>
          </div>
        )}
      </div>
    </div>
  );
}
