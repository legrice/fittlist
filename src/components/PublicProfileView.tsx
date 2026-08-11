import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { fansEnabled, fansVisible } from "@/lib/flags";
import { viewerLook } from "@/lib/look";
import { getSessionUserId } from "@/lib/session";
import { clockParts, fmtDayHeaderRel, occurrenceEnded, runsOn, timeToMinutes, todayIso } from "@/lib/format";
import { avatarColor } from "@/lib/avatar";
import { backToFor } from "@/lib/nav";
import { classAddress, publicSchedule } from "@/lib/coachweek";

import { AgendaAvatar } from "@/components/Agenda";
import { AvatarZoom } from "@/components/AvatarZoom";
import { ClassRowMenu } from "@/components/ClassRowMenu";
import { Icon } from "@/components/Icon";
import { ContactSheet, type ContactWays } from "@/components/ContactSheet";
import { FollowSync } from "@/components/FollowSync";
import { NotifyCta } from "@/components/NotifyCta";
import { ScheduleMore } from "@/components/ScheduleMore";
import { ProfileOwnerBar } from "@/components/ProfileOwnerBar";
import { AppChrome } from "@/components/AppChrome";
import { ClassOpener } from "@/components/ClassOpener";
import { ProfileTabs, type ProfileTab } from "@/components/ProfileTabs";
import { PublicTopBar } from "@/components/PublicTopBar";
import { ProfileShare } from "@/components/ProfileShare";
import { ProfileEndorsements } from "@/components/ProfileEndorsements";
import { ProfileInfoEmpty } from "@/components/ProfileInfoEmpty";
import { ProfileStudioRail } from "@/components/ProfileStudioRail";
import { Wordmark } from "@/components/Wordmark";

// A continuous forward window, long enough that even a one-class-a-week
// schedule can fill seven populated days before View more runs dry.
const WINDOW_DAYS = 63;

// The visitor's sheet-opener, or nothing: the owner's rows link straight to
// the editor, and wrapping them would intercept the tap into the wrong thing.
function MaybeOpener({
  isOwner,
  handle,
  children,
}: {
  isOwner: boolean;
  handle: string;
  children: React.ReactNode;
}) {
  // Owners used to skip the sheet and jump straight into the editor. Now the
  // sheet is how a class opens from a list for everyone; the owner's copy of
  // it carries the roster and an Edit button, so nothing was lost but the
  // detour. `isOwner` stays in the signature for the call sites.
  void isOwner;
  return <ClassOpener handle={handle}>{children}</ClassOpener>;
}

type UserRow = typeof schema.users.$inferSelect;

// The public page: an identity header and one section under it. One URL per
// tab: /{handle} is the schedule, /{handle}/about and /{handle}/contact are the
// other two. The schedule is the bare handle because it's what the link is for,
// and a half-filled About is an awkward first thing to land on.
export async function PublicProfileView({
  user,
  isOwner,
  tab,
  from,
}: {
  user: UserRow;
  isOwner: boolean;
  tab: ProfileTab;
  /** Which tab sent them here: it names the back control's destination, and
   *  rides along on the class links below. */
  from?: string;
}) {
  // Somebody else's profile carries the header and no tab bar: its way out is
  // the arrow on the picture, which pops to whatever is underneath and names
  // the front door for a page opened cold. Your own keeps the bar, because it
  // is the You tab and arriving on a tab must not take the tabs away.
  const handle = user.handle!;
  const db = await getDb();

  // Fan side (flag-gated): a signed-in viewer gets a one-tap Follow button on
  // the subscribe bar instead of the email sheet.
  let account: { following: boolean; requested: boolean } | null = null;
  let signedIn = false;
  // Who's looking, for the app header. The owner gets it too: previewing your
  // own page shouldn't drop you out of the app.
  const viewerId = await getSessionUserId();
  if (!isOwner && (await fansVisible())) {
    if (viewerId) {
      const [viewer] = await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, viewerId));
      if (viewer) {
        signedIn = true;
        const [row] = await db
          .select({ optedOutAt: schema.subscribers.optedOutAt })
          .from(schema.subscribers)
          .where(
            and(
              eq(schema.subscribers.trainerUserId, user.id),
              eq(schema.subscribers.email, viewer.email),
            ),
          );
        const following = !!row && !row.optedOutAt;
        // Coaches can gate their followers too: a pending ask reads as
        // "Requested", and tapping it again withdraws the ask.
        let requested = false;
        if (!following) {
          const [req] = await db
            .select({ id: schema.followRequests.id })
            .from(schema.followRequests)
            .where(
              and(
                eq(schema.followRequests.trainerUserId, user.id),
                eq(schema.followRequests.requesterUserId, viewerId),
              ),
            );
          requested = !!req;
        }
        account = { following, requested };
      }
    }
  }

  // No arrow on your own page. It is what the Profile tab opens now, so
  // there is nothing behind it to go back to: the bar underneath is the way
  // on, and an arrow pointing at Following on a screen you reached from a tab
  // is a control offering to undo a tap you did not make.
  const backTo = isOwner ? undefined : backToFor(from, !!viewerId);

  // Their own classes, plus the shifts a gym has them on when they've said
  // those belong here. One loader, so the page, the share, the feed and the
  // .ics can't answer this differently. "Where I coach" is the union of
  // studios the coach picked in setup and any studio they've published a
  // class at.
  //
  // These three have nothing to say to one another, so they go together
  // rather than in a chain. This page is the link a coach hands out, which
  // makes it the route worth being careful about. It is not visible in the
  // local load check, and can't be: dev runs PGlite, a single-connection
  // embedded Postgres that serializes what a pooled one overlaps. The win
  // is three round trips becoming one on production's pool.
  const [allClassRows, pickedRows, visitedStudioRows, fansOn] = await Promise.all([
    publicSchedule(user),
    db
      .select({ studioId: schema.coachStudios.studioId })
      .from(schema.coachStudios)
      .where(eq(schema.coachStudios.userId, user.id)),
    db
      .select({ studio: schema.studios })
      .from(schema.studioEndorsements)
      .innerJoin(schema.studios, eq(schema.studioEndorsements.targetStudioId, schema.studios.id))
      .where(
        and(
          eq(schema.studioEndorsements.endorserUserId, user.id),
          eq(schema.studioEndorsements.trait, "been_here"),
          eq(schema.studios.placeKind, "studio"),
        ),
      ),
    fansVisible(),
  ]);
  const classRows = allClassRows.filter((c) => c.isPublic);
  const studioIds = [
    ...new Set([...classRows.map((c) => c.studioId), ...pickedRows.map((p) => p.studioId)]),
  ].filter((id): id is string => !!id);
  const studioRows = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioById = new Map(studioRows.map((s) => [s.id, s]));
  // Studios/spaces this coach is associated with, derived from where they coach.
  const coachStudios = [...studioRows].sort((a, b) => a.name.localeCompare(b.name));
  const visitedStudios = visitedStudioRows
    .map((row) => row.studio)
    .sort((a, b) => a.name.localeCompare(b.name));
  const endorsementRows = await db
    .select({ trait: schema.profileEndorsements.trait, endorserUserId: schema.profileEndorsements.endorserUserId })
    .from(schema.profileEndorsements)
    .where(eq(schema.profileEndorsements.targetUserId, user.id));
  const endorsementCounts = endorsementRows.reduce<Record<string, number>>((all, row) => {
    all[row.trait] = (all[row.trait] ?? 0) + 1;
    return all;
  }, {});

  // Continuous forward calendar: each date from today with classes. Days
  // group into chunks of seven POPULATED days, not seven calendar days, so a
  // Mon/Wed/Fri coach still shows a full week's worth of schedule before the
  // View more button, and each tap reveals seven more real days.
  // The viewer's own going marks used to be loaded here, so each row's ribbon
  // could say whether the class was already in their plans. Plans are gone: a
  // member reads the week of the people they follow and has no calendar to add
  // anything to, so the ribbon came off the row and the query went with it. A
  // query nobody reads is one that gets slower without anybody noticing.

  // Who they follow, only when that tab is the one being read: the other
  // tabs have no use for it, and a query nobody reads gets slower without
  // anybody noticing.
  const today = todayIso();
  const start = new Date(`${today}T00:00:00Z`);
  const days: { iso: string; week: number; items: typeof classRows }[] = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    const items = classRows
      .filter((c) => runsOn(c, iso, dow))
      // A class that has already ended is not something anyone can still go
      // to, so no schedule shows it.
      .filter((c) => !occurrenceEnded(iso, c.startTime, c.durationMin))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    if (items.length)
      days.push({ iso, week: Math.floor(days.length / 7), items });
  }

  const hasInfo = Boolean(
    user.disciplines.length || user.highlights.length || user.certifications.length,
  );
  const about = hasInfo ? (
    <>
      {user.disciplines.length > 0 && (
        <div className="profsec">
          <h2 className="prof-sec-h">Teaches</h2>
          <div className="studiotypes">
            {user.disciplines.map((d) => (
              <span key={d} className="studiotype">
                {d}
              </span>
            ))}
          </div>
        </div>
      )}
      {user.highlights.length > 0 && (
        <div className="profsec focussec">
          <h2 className="prof-sec-h">Coaching focus</h2>
          <ul className="expectlist">
            {user.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      )}
      {user.certifications.length > 0 && (
        <div className="profsec certsec">
          <h2 className="prof-sec-h">Certifications</h2>
          <ul className="expectlist">
            {user.certifications.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  ) : (
    <ProfileInfoEmpty
      handle={handle}
      firstName={user.name.trim().split(/\s+/)[0] || user.name}
      owner={isOwner}
    />
  );

  // Studios got their own tab: "where do they teach" is a question people
  // come with, and it was buried at the bottom of About. The heading stays
  // off, because the tab that got you here already says it.
  const studios = coachStudios.length > 0 || visitedStudios.length > 0;

  // How to reach them is a thing you do, not a section you read, so it lives
  // behind the Contact pill in the header rather than in a tab of its own.
  // /{handle}/contact still resolves, because that link is already out in the
  // world; it lands on the schedule and the pill is right there.
  const ways: ContactWays = {
    email: user.contactEmail ?? "",
    phone: user.phone ?? "",
    whatsapp: user.whatsapp ?? "",
    instagram: user.instagram ?? "",
    website: user.website ?? "",
    links: user.profileLinks,
  };
  const canMessage = !isOwner && user.messagesOpen;
  // Nothing behind the pill means no pill. The predicate lives here rather
  // than beside the sheet because a "use client" module's exports can't be
  // called from a server component, only rendered.
  const showContact =
    !isOwner &&
    (canMessage ||
      !!(
        ways.email ||
        ways.phone ||
        ways.whatsapp ||
        ways.instagram ||
        ways.website ||
        ways.links.length
      ));

  // The other hat used to be loaded here: the going week, behind a
  // Teaching/Going segment on this tab, gated on `canSeeWeek`. Going marks are
  // gone from the app, so there is one week on a coach's page and it is the
  // one the link is for. `canSeeWeek` and `sharedWeek` still exist for a
  // member's own profile, which is the other place they were read.

  const schedule = (
    <>
      {days.length === 0 ? (
        // The owner reads their own page in the first person, with the way
        // to fix it right there: the third-person copy told a coach on
        // their own profile that "Anotherone hasn't posted classes yet",
        // which is the app talking about them to them.
        isOwner ? (
          <div className="empty-block profile-empty-small">
            <h2>Nothing on your schedule</h2>
            <p>Add the classes you coach and this page fills in.</p>
            <Link className="btn si folfind" href="/calendar">
              Add a class
            </Link>
          </div>
        ) : (
          <div className="empty-block profile-empty-small">
            <h2>Nothing on the calendar</h2>
            <p>
              {user.name} hasn&rsquo;t posted classes yet. Join the list and you&rsquo;ll get an email
              the moment they do.
            </p>
          </div>
        )
      ) : (
        // Server-rendered rows. For a visitor they're wrapped so an ordinary
        // tap opens the class from the bottom instead of navigating, with the
        // href staying real for crawlers, cold loads and cmd-clicks. For the
        // owner a tap opens the editor instead: this is your class, and the
        // one thing you'd do with it from here is change it.
        <MaybeOpener isOwner={isOwner} handle={handle}>
        {/* The calendar's own rows, and the calendar's own day headings.
            This drew `.ps-event` cards in a `.callist` while the calendar and
            Following drew `.wkrow` on the ground, which is two designs for one
            list: a coach flipping between their calendar and their page was
            reading two apps. It is one row now, everywhere a class is listed.

            The ribbon went with them. It put a class in your plans, and plans
            are gone: a member reads the week of the people they follow, and
            there is nothing to add it to. */}
        <div className="daylist">
          {(() => {
            const renderDay = (d: (typeof days)[number]) => (
              <section key={d.iso} id={`day-${d.iso}`} className="dayblock">
                <div className="dayband">
                  <span className="dayband-d">{fmtDayHeaderRel(d.iso, today)}</span>
                </div>
                <div className="dayrows">
                  {d.items.map((c) => {
                    const s = c.studioId ? studioById.get(c.studioId) : undefined;
                    const where = s ? s.name : c.location;
                    const start = clockParts(c.startTime);
                    // A shift belongs to the gym, so its page lives under the
                    // studio. Pointing it at this handle would 404: the class
                    // is not this coach's to serve.
                    const at = classAddress(c, handle, s?.slug);
                    const base = at?.base ?? handle;
                    const href = `/${base}/${c.id}?d=${d.iso}`;
                    const row = (
                      <a
                        key={`${d.iso}-${c.id}`}
                        className="clline"
                        href={href}
                        data-cid={c.id}
                        data-d={d.iso}
                        data-base={at?.key}
                      >
                        <span className="clline-t">
                          {start.hm}
                          <span className="clline-ap">{start.ap.toUpperCase()}</span>
                        </span>
                        <span className="clline-nm">{c.name}</span>
                        {where && (
                          <span className="clline-w">{where}</span>
                        )}
                      </a>
                    );
                    // The dots ride a visitor's rows only: the owner's tap
                    // already opens the editor, and reporting your own class
                    // is a button that can only answer with an error.
                    if (isOwner) return row;
                    return (
                      <div key={`${d.iso}-${c.id}`} className="clrow">
                        {row}
                        {/* No coach row: whose class it is is the page you
                            are standing on. */}
                        <ClassRowMenu
                          classId={c.id}
                          base={base}
                          iso={d.iso}
                          name={c.name}
                          studio={s ? { name: s.name, href: `/s/${s.slug}` } : null}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            );
            let remaining = 8;
            const preview: typeof days = [];
            const later: typeof days = [];
            for (const day of days) {
              const first = day.items.slice(0, remaining);
              const rest = day.items.slice(remaining);
              if (first.length) preview.push({ ...day, items: first });
              if (rest.length) later.push({ ...day, items: rest });
              remaining = Math.max(0, remaining - first.length);
              if (!remaining && !rest.length && day.items.length) {
                // Later days remain intact once the eight-entry preview fills.
                const at = days.indexOf(day);
                later.push(...days.slice(at + 1));
                break;
              }
            }
            return (
              <>
                {preview.map(renderDay)}
                {later.length > 0 && (
                  <ScheduleMore
                    label="See more schedule"
                    chunks={[<div key="more-schedule" style={{ display: "contents" }}>{later.map(renderDay)}</div>]}
                  />
                )}
              </>
            );
          })()}
        </div>
        </MaybeOpener>
      )}
    </>
  );

  return (
    <div
      className={`pub profile${viewerId ? " hasnav" : ""}${isOwner ? " ownbar" : ""} pub-hero`}
      data-theme={user.theme}
      data-mode={await viewerLook()}
    >
      <div className="profwrap">
        {/* Signed in, this is still the app, so it keeps the app's header: the
            way home, search, updates and settings. A stranger gets the wordmark and one
            way in instead, because none of those mean anything to them yet. */}
        {/* Your own page is the You tab, so it lights up here; the pathname is
            a handle, which the bar can't read on its own. */}
        {viewerId ? (
          // The bar rides along on your own page and nowhere else: You is a
          // tab, so landing on it must not take the tabs away. Somebody
          // else's profile is a page you visited, and the arrow is its way
          // off.
          <AppChrome
            userId={viewerId}
            bar={isOwner}
            headerNav={false}
            active={isOwner ? "you" : undefined}
          />
        ) : (
          <PublicTopBar handle={handle} next={`/${handle}`} />
        )}
        {/* The Follow control renders twice below (the header pill and the
            sticky bar's compact copy); this provider is the one place the
            answer lives, so tapping either updates both. */}
        <FollowSync
          initial={{
            following: account?.following ?? false,
            requested: account?.requested ?? false,
            subscribed: false,
          }}
        >
        <ProfileTabs
          base={`/${handle}`}
          tab={tab}
          tabs={[
            { key: "schedule", label: "Schedule" },
            { key: "about", label: "Info" },
            ...(studios ? [{ key: "studios", label: "Studios" }] : []),
          ]}
          name={user.name}
          summary={user.about}
          sharePrompt={isOwner ? "Let people know where to find you." : `Know someone who should know ${user.name.trim().split(/\s+/)[0] || user.name}?`}
          shareLabel={isOwner ? "Share your profile" : "Share their profile"}
          title={user.title ?? ""}
          location={user.location ?? ""}
          trackSchedule={!isOwner}
          trackHandle={handle}
          backTo={backTo}
          // Settings lives in the shared app header. Somebody else's page
          // still keeps its back control here; your own page needs no second
          // settings door in that same corner.
          // The full-bleed hero for everybody, by Matt's call: the photo
          // when there is one, the person's own colour when there isn't,
          // the same rule the member page follows, so no photo is never a
          // lesser layout. The owner's colour hero carries the image
          // icon into the editor (?edit=1, which ProfileOwnerBar reads).
          heroPhoto={user.photo}
          heroColor={avatarColor(user)}
          heroCta={
            isOwner && !user.photo ? (
              <Link className="herocta" href={`/${handle}?edit=1`} aria-label="Add a photo">
                <Icon name="image" size={24} />
              </Link>
            ) : undefined
          }
          avatar={
            <AvatarZoom
              className="profav"
              handle={handle}
              name={user.name}
              photo={user.photo}
              color={avatarColor(user)}
              follow={!isOwner && account ? account : null}
              isOwner={isOwner}
              availability={user.availability}
              canMessage={canMessage}
              signedIn={signedIn}
            />
          }
          // The same two slots for everybody. A visitor gets Message and
          // Follow; the owner gets Share and Edit profile, which are the two
          // things they came to do with their own page.
          actions={
            isOwner ? (
              <ProfileOwnerBar
                name={user.name}
                title={user.title ?? ""}
                about={user.about ?? ""}
                location={user.location ?? ""}
                certifications={user.certifications}
                highlights={user.highlights}
                disciplines={user.disciplines}
                instagram={user.instagram ?? ""}
                website={user.website ?? ""}
                contactEmail={user.contactEmail ?? ""}
                phone={user.phone ?? ""}
                whatsapp={user.whatsapp ?? ""}
                profileLinks={user.profileLinks}
                photo={user.photo}
                avatarColor={user.avatarColor}
                userId={user.id}
                handle={handle}
              />
            ) : (
              <div className="profacts">
                <NotifyCta
                  trainerName={user.name}
                  handle={handle}
                  account={account}
                  canSignUp={fansEnabled()}
                />
                {showContact && (
                  <ContactSheet
                    handle={handle}
                    coachName={user.name}
                    signedIn={signedIn}
                    canMessage={canMessage}
                    ways={ways}
                  />
                )}
                <ProfileShare path={`/${handle}`} name={user.name} pill />
              </div>
            )
          }
          endorsement={
            <ProfileEndorsements
              handle={handle}
              firstName={user.name.trim().split(/\s+/)[0] || user.name}
              initial={endorsementCounts}
              mine={viewerId ? endorsementRows.filter((r) => r.endorserUserId === viewerId).map((r) => r.trait) : []}
              owner={isOwner}
            />
          }
          // The gear lives in the shared app header. Floating it on the photo
          // read as loose furniture; the stable header position is easier to
          // find and reach. The slot stays for a studio's dots.
          ownerTop={null}
          badges={null}
          // The sticky bar's Follow: the same control, smaller, so someone
          // three weeks deep in a schedule can say yes without climbing back.
          stickAction={
            !isOwner ? (
              <NotifyCta
                trainerName={user.name}
                handle={handle}
                account={account}
                canSignUp={fansEnabled()}
                compact
              />
            ) : null
          }
        >
          {/* One section, the one they asked for. Studios can vanish (nothing
              to show means no tab) and Contact is a sheet now, so both fall
              back to the schedule rather than rendering an empty page under a
              tab that isn't there. */}
          <section id="profile-schedule" className="profile-anchor-section">{schedule}</section>
          <section id="profile-about" className="profile-anchor-section">
            <h2 className="profile-section-title">Info</h2>
            {about}
          </section>
          {studios ? (
            <section id="profile-studios" className="profile-anchor-section">
              <h2 className="profile-section-title">Studios</h2>
              {coachStudios.length > 0 && (
                <div className="profile-studio-group">
                  <h3 className="profile-studio-group-title">Places I coach</h3>
                  <ProfileStudioRail studios={coachStudios} />
                </div>
              )}
              {visitedStudios.length > 0 && (
                <div className="profile-studio-group">
                  <h3 className="profile-studio-group-title">Places I&rsquo;ve been</h3>
                  <ProfileStudioRail studios={visitedStudios} />
                </div>
              )}
            </section>
          ) : null}
        </ProfileTabs>
        </FollowSync>
        {/* No Add class here. This page is where you look at your week, and
            the Schedule tab is where you work on it: the plus lives on the
            calendar, under a thumb, next to the week it adds to. A second
            door on the profile meant two screens both claiming to be where
            classes come from, and this is the one that is really a page you
            hand to somebody. */}
        {/* The growth loop is aimed at visitors — someone already signed in
            has an account, so it's noise on every page they open. */}
        {!isOwner && !signedIn && (
          <div className="madewith">
            Made with <Wordmark variant="ink" className="mw-logo" />. Coach classes?{" "}
            <Link href={`/?via=${handle}`}>Claim your page</Link>
          </div>
        )}
      </div>
    </div>
  );
}
