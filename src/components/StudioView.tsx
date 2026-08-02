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
import { coachAnalytics } from "@/lib/visits";
import { AppChrome } from "@/components/AppChrome";
import { backToFor } from "@/lib/nav";
import { ContactSheet } from "@/components/ContactSheet";
import { Icon } from "@/components/Icon";
import { InviteCoach } from "@/components/InviteCoach";
import { ProfileTabs } from "@/components/ProfileTabs";
import { PublicTopBar } from "@/components/PublicTopBar";
import { StudioAdminSheet } from "@/components/StudioAdminSheet";
import { StudioMenu } from "@/components/StudioMenu";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { StudioSchedule, type StudioDay } from "@/components/StudioSchedule";
import { Wordmark } from "@/components/Wordmark";

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
        .map((c) => ({
          id: c.id,
          name: c.name,
          startTime: c.startTime,
          durationMin: c.durationMin,
        }));
      if (items.length) days.push({ iso, label: fmtDayHeader(iso), items });
    }
  }
  // The commons builds the week before the studio arrives: an unclaimed
  // studio's schedule is drawn from the public classes coaches list here and
  // the entries members have added with this studio picked. Deduped on name
  // and time, never attributed (a member's entry surfaces the class's facts
  // and nothing about the member; the personal adder says so under its studio
  // field, which is the consent), and gone the moment somebody claims the
  // page: from then on what it says is theirs to say.
  let community = false;
  if (!s.accountUserId && !access.claimed) {
    const [pubAll, own] = await Promise.all([
      db.select().from(schema.classes).where(eq(schema.classes.studioId, s.id)),
      db.select().from(schema.personalClasses).where(eq(schema.personalClasses.studioId, s.id)),
    ]);
    const pub = pubAll.filter((c) => c.isPublic);
    const owners = pub.length
      ? await db
          .select({ id: schema.users.id, handle: schema.users.handle })
          .from(schema.users)
          .where(inArray(schema.users.id, [...new Set(pub.map((c) => c.userId))]))
      : [];
    const handleOf = new Map(owners.map((o) => [o.id, o.handle]));
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
        items.push({ id: c.id, name: c.name, startTime: c.startTime, durationMin: c.durationMin, base });
      }
      for (const p of own) {
        if (!runsOn({ ...p, skipDates: [] as string[] }, iso, dow)) continue;
        if (occurrenceEnded(iso, p.startTime, p.durationMin)) continue;
        const key = `${p.name.trim().toLowerCase()}|${p.startTime}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ id: p.id, name: p.name, startTime: p.startTime, durationMin: p.durationMin, plain: true });
      }
      items.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      if (items.length) days.push({ iso, label: fmtDayHeader(iso), items });
    }
    community = days.length > 0;
  }

  const hasSchedule = !!s.accountUserId || community;
  // Every studio page wears the same three tabs now, whatever it holds:
  // Schedule leads (it is what the link is for, and an empty one is the
  // pitch), Info is the categories and the words, Coaches is who teaches
  // here. One layout to learn, however small the studio.
  const tab: StudioTab = wanted === "auto" ? "schedule" : wanted;
  const show = (section: StudioTab) => tab === section;

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

  return (
    <div className={`pub profile${signedIn ? " hasnav" : ""}`} data-mode={await viewerLook()}>
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
            { key: "schedule", label: "Schedule" },
            { key: "about", label: "Info" },
            { key: "coaches", label: "Coaches" },
          ]}
          name={s.name}
          title=""
          location={s.address}
          // A studio's photo is a place, not a face, so it comes as the wide
          // rectangle its old page led with: a circle crops a room down to a
          // porthole, and the rectangle is also what tells a studio apart
          // from a person at a glance. No photo keeps the coloured circle
          // face; a full-width empty rectangle is a wall.
          avatar={
            /* One layout whether or not there is a photo: the banner space
               is always there, filled by the picture or by the studio's own
               colour (the same one its directory row derives), so a page
               without a photo is not a different page. */
            <span className="profbanner-wrap">
              {s.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="profbanner" src={s.photo} alt={s.name} />
              ) : (
                <span
                  className="profbanner profbanner-empty"
                  style={{ background: avatarColor({ id: s.id }) }}
                  aria-hidden="true"
                />
              )}
              {/* The badge rides the banner's bottom-left, above the name:
                  the claim (or its absence) sits on the thing it speaks
                  for. */}
              <span className="profbadges profbadges-onbanner">
                <VerifiedBadge studioId={s.id} name={s.name} verified={access.claimed} />
              </span>
            </span>
          }
          backTo={backTo}
          badges={null}
          ownerTop={
            /* Everything you can do with a studio, behind one set of dots:
               share, suggest, report, and for coaches the edit. */
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
          }
          actions={
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
              {/* No share circle up here any more: the dots carry Share
                  this studio, and one door beats two. */}
            </div>
          }
        >

        {tab === "schedule" &&
          (hasSchedule ? (
            <StudioSchedule slug={s.slug ?? s.id} days={days} community={community} />
          ) : (
            <div className="empty-block">
              <h2>No classes listed yet</h2>
              <p>
                The schedule fills in as coaches who teach here add their classes, or when
                the studio takes the page and runs its own.
              </p>
            </div>
          ))}

        {/* What kind of place this is, first thing under the tabs: it is the
            answer to "is this for me", and it used to sit above the photo
            where it read as a caption on the name. */}
        {show("about") && s.types.length > 0 && (
          <div className="studiotypes studiotypes-top">
            {s.types.map((t) => (
              <span key={t} className="studiotype">
                {t}
              </span>
            ))}
          </div>
        )}

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

        {show("coaches") &&
          (coaches.length === 0 ? (
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
                  <Icon name="chevron_right" size={18} />
                </span>
              </Link>
            ))}
            {/* The list fills in by word of mouth, and the person most
                likely to bring a coach in is somebody standing in their
                class. */}
            {signedIn && <InviteCoach studioName={s.name} />}
          </div>
          ))}

        </ProfileTabs>

        {/* The manager's own door, floating where the one action of a screen
            lives: on your own gym's page, that action is running the place. */}
        {access.isManager && (
          <StudioAdminSheet
            slug={s.slug ?? s.id}
            canSchedule={!!s.accountUserId}
            pageViews={s.accountUserId ? (await coachAnalytics(s.accountUserId)).profileViews : null}
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
