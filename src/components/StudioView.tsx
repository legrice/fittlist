import { and, eq, inArray, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { fmtDayHeader, occurrenceEnded, runsOn, timeToMinutes, todayIso } from "@/lib/format";
import { fansVisible } from "@/lib/flags";
import { avatarColor } from "@/lib/avatar";
import { viewerLook } from "@/lib/look";
import { getSessionUserId } from "@/lib/session";
import { mapsUrlFor } from "@/lib/studio";
import { studioAccess } from "@/lib/studioaccess";
import { AppChrome } from "@/components/AppChrome";
import { backToFor } from "@/lib/nav";
import { ContactSheet } from "@/components/ContactSheet";
import { Icon } from "@/components/Icon";
import { InviteCoach } from "@/components/InviteCoach";
import { CommunityNote } from "@/components/CommunityNote";
import { ProfileTabs } from "@/components/ProfileTabs";
import { PublicTopBar } from "@/components/PublicTopBar";
import { StudioMenu } from "@/components/StudioMenu";
import { StudioPhotoCta } from "@/components/StudioPhotoCta";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { StudioSchedule, type StudioDay } from "@/components/StudioSchedule";
import { Wordmark } from "@/components/Wordmark";
import { ProfileShare } from "@/components/ProfileShare";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One section per URL, the same shape a person's profile uses. Contact left
 *  the tabs and became the pill on the header, exactly as it did for a coach;
 *  /s/{slug}/contact still resolves and lands on the page with the pill. */
export type StudioTab = "schedule" | "about" | "coaches" | "contact";

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
    // Who is coaching, when the studio says so: the standing coach from the
    // rota, with that date's cover winning over the class, the same rule the
    // rota itself lives by. Off, the week lists classes without names, which
    // some gyms prefer; on is the default for a verified studio.
    let coachOf = new Map<string, { name: string; photo: string | null; color: string }>();
    let covers: (typeof schema.shiftCovers.$inferSelect)[] = [];
    if (s.showCoaches && rows.length) {
      covers = await db
        .select()
        .from(schema.shiftCovers)
        .where(inArray(schema.shiftCovers.classId, rows.map((c) => c.id)));
      const ids = [
        ...new Set(
          [...rows.map((c) => c.coachUserId), ...covers.map((cv) => cv.coachUserId)].filter(
            (x): x is string => !!x,
          ),
        ),
      ];
      if (ids.length) {
        const people = await db
          .select()
          .from(schema.users)
          .where(inArray(schema.users.id, ids));
        coachOf = new Map(
          people.map((u) => [u.id, { name: u.name, photo: u.photo, color: avatarColor(u) }]),
        );
      }
    }
    const coverBy = new Map(covers.map((cv) => [`${cv.classId}|${cv.occurrenceDate}`, cv.coachUserId]));
    const start = new Date(`${todayIso()}T00:00:00Z`);
    for (let i = 0; i < 7; i++) {
      const dt = new Date(start);
      dt.setUTCDate(start.getUTCDate() + i);
      const iso = dt.toISOString().slice(0, 10);
      const dow = (dt.getUTCDay() + 6) % 7;
      const items = rows
        .filter((c) => runsOn(c, iso, dow))
        // Been and gone comes off here too: a schedule is what's still coming.
        .filter((c) => !occurrenceEnded(iso, c.startTime, c.durationMin))
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
        .map((c) => {
          const key = `${c.id}|${iso}`;
          const onIt = coverBy.has(key) ? coverBy.get(key) : c.coachUserId;
          const who = s.showCoaches && onIt ? coachOf.get(onIt) : undefined;
          return {
            id: c.id,
            name: c.name,
            startTime: c.startTime,
            durationMin: c.durationMin,
            coachName: who?.name ?? null,
            coachPhoto: who?.photo ?? null,
            coachColor: who?.color ?? null,
          };
        });
      if (items.length) days.push({ iso, label: fmtDayHeader(iso), items });
    }
  }
  // The commons builds the week before the studio arrives: an unclaimed
  // studio's schedule is drawn from the public classes coaches list here.
  // Members' own entries used to join it as plain rows and no longer do, by
  // Matt's call: a member building their share week types classes here by
  // the dozen now, and what they add stays off every public page but their
  // own. The details still land in the studio's catalog, so the next person
  // typing the class gets them back; the catalog is memory, not a listing.
  // Gone the moment somebody claims the page either way: from then on what
  // it says is theirs to say.
  let community = false;
  if (!s.accountUserId && !access.claimed) {
    const pubAll = await db
      .select()
      .from(schema.classes)
      .where(eq(schema.classes.studioId, s.id));
    const pub = pubAll.filter((c) => c.isPublic);
    const owners = pub.length
      ? await db
          .select({
            id: schema.users.id,
            handle: schema.users.handle,
            name: schema.users.name,
            photo: schema.users.photo,
            avatarColor: schema.users.avatarColor,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, [...new Set(pub.map((c) => c.userId))]))
      : [];
    const handleOf = new Map(owners.map((o) => [o.id, o.handle]));
    // Their face and colour, so the coach line on these rows is the one
    // Following draws rather than a name in the added-tag's clothes.
    const faceOf = new Map(owners.map((o) => [o.id, { photo: o.photo, color: avatarColor(o) }]));
    // Who put this class here. An unclaimed page is built by the people who
    // train at the place, and whoever runs it had no way to ask anybody about
    // a listing they did not recognise. A coach's name is already public on
    // the class it names, so this shows nothing that was not already showing.
    const nameOf = new Map(owners.map((o) => [o.id, o.name]));
    const start = new Date(`${todayIso()}T00:00:00Z`);
    for (let i = 0; i < 7; i++) {
      const dt = new Date(start);
      dt.setUTCDate(start.getUTCDate() + i);
      const iso = dt.toISOString().slice(0, 10);
      const dow = (dt.getUTCDay() + 6) % 7;
      const seen = new Set<string>();
      const items: StudioDay["items"] = [];
      // Coaches' own listings first: they have real pages, so on a collision
      // the row that can be opened wins.
      for (const c of pub) {
        if (!runsOn(c, iso, dow)) continue;
        if (occurrenceEnded(iso, c.startTime, c.durationMin)) continue;
        const base = handleOf.get(c.userId);
        if (!base) continue;
        const key = `${c.name.trim().toLowerCase()}|${c.startTime}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          id: c.id,
          name: c.name,
          startTime: c.startTime,
          durationMin: c.durationMin,
          base,
          coachName: nameOf.get(c.userId) ?? null,
          coachPhoto: faceOf.get(c.userId)?.photo ?? null,
          coachColor: faceOf.get(c.userId)?.color ?? null,
          where: c.location,
        });
      }
      items.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      if (items.length) days.push({ iso, label: fmtDayHeader(iso), items });
    }
    community = days.length > 0;
  }

  const hasSchedule = !!s.accountUserId || community;
  // The viewer's going marks used to load here so each row's ribbon could
  // say Added. The ribbon left every list when plans did, and the new rows
  // carry no add at all, so the query went with it: a query nobody reads is
  // one that gets slower without anybody noticing.
  // Every studio page wears the same three tabs now, whatever it holds:
  // Schedule leads (it is what the link is for, and an empty one is the
  // pitch), About is the categories and the words, Coaches is who teaches
  // here. One layout to learn, however small the studio.
  const tab: StudioTab = wanted === "auto" ? "schedule" : wanted;
  const backTo = backToFor(from, signedIn);

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

  const base = `/s/${s.slug ?? s.id}`;

  // What the editor needs, once: the dots menu and the hero's photo button
  // open the same editor over the same row.
  const editProps = {
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
  };

  return (
    <div
      // pub-hero whether or not there is a photo, by Matt's call: a
      // no-photo studio wears its colour as the same full-bleed hero, so
      // the two pages are one page.
      className={`pub profile${signedIn ? " hasnav" : ""} pub-hero`}
      data-mode={await viewerLook()}
    >
      <div className="profwrap">
        {/* A stranger gets the wordmark and one way in, same as they do on a
            person's page. This page had neither, so a shared studio link was a
            dead end for anyone without an account. */}
        {signedIn && viewerId ? <AppChrome userId={viewerId} /> : <PublicTopBar next={`/s/${s.slug ?? s.id}`} />}
        {/* The same header a person wears. A studio is a place rather than a
            face, but it is the same kind of page: a photograph, a badge, a
            name, where it is, and the two things you can do about it. */}
        <ProfileTabs
          base={base}
          tab={tab}
          tabs={[
            {
              key: "schedule",
              label: "Schedule",
              // The commons' week explains itself from an info dot beside the
              // tab: the note was a paragraph over the list, read once and
              // scrolled past forever after. Its sheet carries the same Own
              // this page ask the badge's does.
              info: community ? <CommunityNote studioId={s.id} name={s.name} /> : undefined,
            },
            { key: "about", label: "Info" },
            { key: "coaches", label: "Coaches" },
          ]}
          name={s.name}
          summary={s.about}
          title=""
          location={s.address}
          // The same full-bleed hero a coach's page wears, by Matt's call:
          // one design for every profile, photo or not. Without a photo the
          // hero fills with the studio's own colour (the same one its
          // directory row derives), the name overlays it in white exactly
          // as it would a photograph, and the photo button offers anyone
          // allowed through the editor the way to fix the emptiness: a
          // coach who teaches there is exactly who has a picture of the
          // room.
          heroPhoto={s.photo}
          heroColor={avatarColor({ id: s.id })}
          heroCta={
            canEdit && !s.photo ? <StudioPhotoCta studio={editProps} /> : undefined
          }
          // The hero always renders (photo or colour), so the circle-avatar
          // slot has nothing to draw: a place has no face.
          avatar={null}
          backTo={backTo}
          // Above the name on every skin, hero and banner alike; the white
          // pill already reads over a photograph.
          badges={<VerifiedBadge studioId={s.id} name={s.name} verified={access.claimed} />}
          ownerTop={
            /* Everything you can do with a studio, behind one set of dots:
               share, suggest, report, and for coaches the edit. */
            <StudioMenu
              slug={s.slug ?? ""}
              canEdit={canEdit}
              claimed={access.claimed}
              signedIn={signedIn}
              studio={editProps}
            />
          }
          actions={
            /* Nothing to offer, no row: an empty pills row still spends its
               margin, which read as stray space between the address and the
               tabs on a studio with no contact ways. */
            <div className="profacts">
              {/* The same pill a person's page carries, opening the same
                  sheet. Nobody is messaged on fittlist here: a studio has no
                  account to write to, so the sheet is the ways in and no more. */}
              {hasContact && (
                <ContactSheet
                  coachName={s.name}
                  signedIn={signedIn}
                  canMessage={false}
                  ways={{
                    email: s.contactEmail ?? "",
                    phone: s.phone ?? "",
                    whatsapp: "",
                    instagram: s.instagram ?? "",
                    website: s.website ?? "",
                    links: [],
                  }}
                />
              )}
              <ProfileShare path={base} name={s.name} pill />
            </div>
          }
        >

        <section id="profile-schedule" className="profile-anchor-section">
          {hasSchedule ? (
            <StudioSchedule
              slug={s.slug ?? s.id}
              days={days}
              accent={avatarColor({ id: s.id })}
            />
          ) : (
            <div className="empty-block">
              <h2>No classes listed yet</h2>
              <p>
                The schedule fills in as coaches who teach here add their classes, or when
                the studio takes the page and runs its own.
              </p>
            </div>
          )}
        </section>

        <section id="profile-about" className="profile-anchor-section">
        <h2 className="profile-section-title">Info</h2>
        {/* What kind of place this is, first thing under the tabs: it is the
            answer to "is this for me", and it used to sit above the photo
            where it read as a caption on the name. */}
        {s.types.length > 0 && (
          <div className="studiotypes studiotypes-top">
            {s.types.map((t) => (
              <span key={t} className="studiotype">
                {t}
              </span>
            ))}
          </div>
        )}

        {s.about?.trim() && (
          <div className="studsec studsec-first">
            <h2 className="prof-sec-h">About</h2>
            <p className="profabout">{s.about}</p>
          </div>
        )}

        <div className="profstudios studsec">
          <h2 className="prof-sec-h">Where it is</h2>
          <a
            className="profstudio"
            href={mapsUrlFor(s)}
            target="_blank"
            rel="noopener nofollow"
          >
            <span className="profstudio-ic">
              <Icon name="place" size={22} />
            </span>
            <span className="profstudio-txt">
              <span className="nm">{s.address}</span>
              <span className="ad">Get directions</span>
            </span>
          </a>
        </div>
        </section>

        <section id="profile-coaches" className="profile-anchor-section">
        <h2 className="profile-section-title">Coaches</h2>
          {coaches.length === 0 ? (
            <>
              <div className="empty-block">
                <h2>Nobody listed yet</h2>
                <p>
                  Coaches appear here when they add {s.name} as a place they teach, or put a
                  class on at it.
                </p>
              </div>
              {signedIn && <InviteCoach studioName={s.name} />}
            </>
          ) : (
          <div className="profstudios coachlist">
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
                  <Icon name="chevron_right" size={20} />
                </span>
              </Link>
            ))}
            {/* The list fills in by word of mouth, and the person most
                likely to bring a coach in is somebody standing in their
                class. */}
            {signedIn && <InviteCoach studioName={s.name} />}
          </div>
          )}
        </section>

        </ProfileTabs>

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
