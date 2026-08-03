import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { fansEnabled, fansVisible } from "@/lib/flags";
import { viewerLook } from "@/lib/look";
import { getSessionUserId } from "@/lib/session";
import { clockParts, fmtDayHeader, occurrenceEnded, runsOn, timeToMinutes, todayIso } from "@/lib/format";
import { avatarColor } from "@/lib/avatar";
import { backToFor } from "@/lib/nav";
import { studioPath } from "@/lib/studio";
import { classAddress, publicSchedule } from "@/lib/coachweek";

import { AgendaAvatar } from "@/components/Agenda";
import { AvatarZoom } from "@/components/AvatarZoom";
import { ClassCardActions } from "@/components/ClassCardActions";
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

  const backTo = backToFor(from, !!viewerId);

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
  const [allClassRows, pickedRows, fansOn] = await Promise.all([
    publicSchedule(user),
    db
      .select({ studioId: schema.coachStudios.studioId })
      .from(schema.coachStudios)
      .where(eq(schema.coachStudios.userId, user.id)),
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

  // Continuous forward calendar: each date from today with classes. Days
  // group into chunks of seven POPULATED days, not seven calendar days, so a
  // Mon/Wed/Fri coach still shows a full week's worth of schedule before the
  // View more button, and each tap reveals seven more real days.
  // The viewer's own marks on these classes, so the card's ribbon can say
  // what is already in their plans. Visitors with the member side only; the
  // server-side setGoing still holds the real rules.
  const canAddAny = !isOwner && !!viewerId && fansOn;
  const myMarks = new Set<string>();
  if (canAddAny && classRows.length) {
    const marks = await db
      .select({
        classId: schema.attendances.classId,
        occurrenceDate: schema.attendances.occurrenceDate,
      })
      .from(schema.attendances)
      .where(
        and(
          eq(schema.attendances.userId, viewerId!),
          inArray(
            schema.attendances.classId,
            classRows.map((c) => c.id),
          ),
        ),
      );
    for (const m of marks) myMarks.add(`${m.classId}|${m.occurrenceDate}`);
  }

  const start = new Date(`${todayIso()}T00:00:00Z`);
  const days: { iso: string; label: string; week: number; items: typeof classRows }[] = [];
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
      days.push({ iso, label: fmtDayHeader(iso), week: Math.floor(days.length / 7), items });
  }

  const about = (
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
      {user.about?.trim() && (
        <div className="profsec aboutsec">
          {/* Labelled like the sections after it. Without the label the bio
              floated as bare text and Coaching focus read as the page's first
              real section. */}
          <h2 className="prof-sec-h">About</h2>
          <p className="profabout">{user.about}</p>
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
  );

  // Studios got their own tab: "where do they teach" is a question people
  // come with, and it was buried at the bottom of About. The heading stays
  // off, because the tab that got you here already says it.
  const studios =
    coachStudios.length > 0 ? (
      <div className="profstudios">
        {coachStudios.map((s) => (
          // A place is somewhere with a face, same as a person. The card
          // around each one made a list of two look like a form; the photo
          // carries the row instead, and an initial stands in without one.
          <Link key={s.id} className="coachstudio" href={studioPath(s)}>
            {s.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="coachstudio-av" src={s.photo} alt="" />
            ) : (
              <span className="coachstudio-av coachstudio-av-empty" aria-hidden="true">
                {(s.name.trim().charAt(0) || "?").toUpperCase()}
              </span>
            )}
            <span className="coachstudio-txt">
              <span className="nm">{s.name}</span>
              <span className="ad">{s.address}</span>
            </span>
            <span className="coachstudio-chev">
              <Icon name="chevron_right" size={18} />
            </span>
          </Link>
        ))}
      </div>
    ) : null;

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

  const schedule = (
    <>
      {days.length === 0 ? (
        <div className="empty-block">
          <h2>Nothing on the calendar</h2>
          <p>
            {user.name} hasn&rsquo;t posted classes yet. Join the list and you&rsquo;ll get an email
            the moment they do.
          </p>
        </div>
      ) : (
        // Server-rendered rows. For a visitor they're wrapped so an ordinary
        // tap opens the class from the bottom instead of navigating, with the
        // href staying real for crawlers, cold loads and cmd-clicks. For the
        // owner a tap opens the editor instead: this is your class, and the
        // one thing you'd do with it from here is change it.
        <MaybeOpener isOwner={isOwner} handle={handle}>
        <div className="ps-week ps-agenda callist">
          {(() => {
            const renderDay = (d: (typeof days)[number]) => (
              <div key={d.iso} className="ps-daygroup">
                <div className="ps-daycol">{d.label}</div>
                <div className="ps-daycards">
                  {d.items.map((c) => {
                    const s = c.studioId ? studioById.get(c.studioId) : undefined;
                    const where = s ? s.name : c.location;
                    const start = clockParts(c.startTime);
                    // A shift belongs to the gym, so its page lives under the
                    // studio. Pointing it at this handle would 404: the class
                    // is not this coach's to serve.
                    const at = classAddress(c, handle, s?.slug);
                    const href = `/${at?.base ?? handle}/${c.id}?d=${d.iso}`;
                    return (
                      <div key={`${d.iso}-${c.id}`} className="ps-erow">
                      <Link
                        className="ps-event"
                        data-cid={c.id}
                        data-d={d.iso}
                        data-base={at?.key}
                        href={href}
                      >
                        <span
                          className="ps-accent"
                          style={{ background: avatarColor(user) }}
                          aria-hidden="true"
                        />
                        <span className="ps-ebody">
                          {/* Redundant on purpose, by Matt's call: the page
                              already names the coach, and the row says it
                              again so it reads exactly like the same row on
                              Following. */}
                          <span className="ps-ecoach">
                            <AgendaAvatar
                              photo={user.photo}
                              name={user.name}
                              color={avatarColor(user)}
                            />
                            <span className="ps-ecoach-txt">{user.name}</span>
                          </span>
                          <span className="ps-enm">{c.name}</span>
                          {where && <span className="ps-estudio">{where}</span>}
                        </span>
                        <span className="ps-etimecol">
                          <span className="ps-etime">
                            {start.hm}
                            <span className="ps-ap">{start.ap}</span>
                          </span>
                          <span className="ps-edur">{c.durationMin} min</span>
                        </span>
                      </Link>
                      {/* The ribbon, only for somebody the class could
                          belong to. The owner adds nothing: it is already
                          their class. A coach on the slot doesn't either,
                          for the same reason. */}
                      <ClassCardActions
                        classId={c.id}
                        iso={d.iso}
                        name={c.name}
                        canAdd={canAddAny && c.coachUserId !== viewerId}
                        initialOn={myMarks.has(`${c.id}|${d.iso}`)}
                      />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
            // One week at a time: the first non-empty week renders now, and
            // the rest wait behind View more, revealed a week per tap. Empty
            // weeks never make a chunk, so the button always shows something.
            const weekIdxs = [...new Set(days.map((d) => d.week))].sort((a, b) => a - b);
            const [firstWeek, ...laterWeeks] = weekIdxs;
            return (
              <>
                {days.filter((d) => d.week === firstWeek).map(renderDay)}
                {laterWeeks.length > 0 && (
                  <ScheduleMore
                    chunks={laterWeeks.map((w) => (
                      <div key={w} style={{ display: "contents" }}>
                        {days.filter((d) => d.week === w).map(renderDay)}
                      </div>
                    ))}
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
      className={`pub profile${viewerId ? " hasnav" : ""}${isOwner ? " ownbar" : ""}`}
      data-theme={user.theme}
      data-mode={await viewerLook()}
    >
      <div className="profwrap">
        {/* Signed in, this is still the app, so it keeps the app's header: the
            way home, the bell, your week. A stranger gets the wordmark and one
            way in instead, because none of those mean anything to them yet. */}
        {/* Your own page is the You tab, so it lights up here; the pathname is
            a handle, which the bar can't read on its own. */}
        {viewerId ? (
          // The bar rides along on your own page and nowhere else: You is a
          // tab, so landing on it must not take the tabs away. Somebody
          // else's profile is a page you visited, and the arrow is its way
          // off.
          <AppChrome userId={viewerId} bar={isOwner} headerNav={false} active={isOwner ? "you" : undefined} />
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
          title={user.title ?? ""}
          location={user.location ?? ""}
          trackSchedule={!isOwner}
          trackHandle={handle}
          backTo={backTo}
          // The face is a circle again; tapping it blows it up with the
          // person's follow/share/link/QR actions under it.
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
                {showContact && (
                  <ContactSheet
                    handle={handle}
                    coachName={user.name}
                    signedIn={signedIn}
                    canMessage={canMessage}
                    ways={ways}
                  />
                )}
                <NotifyCta
                  trainerName={user.name}
                  handle={handle}
                  account={account}
                  canSignUp={fansEnabled()}
                />
              </div>
            )
          }
          // No gear here any more: settings live behind the app header's
          // gear, so the profile stops carrying a door to somewhere else.
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
          {tab === "about" ? about : tab === "studios" && studios ? studios : schedule}
        </ProfileTabs>
        </FollowSync>
        {/* The primary action holds the thumb spot, in the same glass the
            Discover filter wears; sharing sits up top as the tinted pill. Schedule section only:
            About and Contact aren't places you add a class from. */}
        {isOwner && tab === "schedule" && (
          <Link className="fab" href="/app?add=1">
            <Icon name="add" size={20} />
            Add class
          </Link>
        )}
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
