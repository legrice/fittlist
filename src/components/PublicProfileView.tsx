import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { fansEnabled, fansVisible } from "@/lib/flags";
import { viewerLook } from "@/lib/look";
import { getSessionUserId } from "@/lib/session";
import { clockParts, fmtDayHeader, runsOn, timeToMinutes, todayIso } from "@/lib/format";
import { avatarColor } from "@/lib/avatar";
import { AvatarZoom } from "@/components/AvatarZoom";
import { studioPath } from "@/lib/studio";
import { classAddress, publicSchedule } from "@/lib/coachweek";

import { Icon } from "@/components/Icon";
import { FollowSync } from "@/components/FollowSync";
import { InstagramGlyph } from "@/components/InstagramGlyph";
import { NotifyCta } from "@/components/NotifyCta";
import { ShareWeekPill } from "@/components/ShareWeekFab";
import { ScheduleMore } from "@/components/ScheduleMore";
import { ProfileOwnerBar } from "@/components/ProfileOwnerBar";
import { RequestSessionButton } from "@/components/RequestSessionButton";
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
  /** Which tab sent them here. Kept for the class links below; there's no back
   *  arrow any more, because the tab bar is the way out. */
  from?: string;
}) {
  // A profile is a screen of the app like any other: the header above it and
  // the tab bar below. It used to carry a back arrow instead, which meant the
  // only way off a coach's page was the one route you arrived by.
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

  // Their own classes, plus the shifts a gym has them on when they've said
  // those belong here. One loader, so the page, the share, the feed and the
  // .ics can't answer this differently.
  const classRows = (await publicSchedule(user)).filter((c) => c.isPublic);
  // "Where I coach" is the union of studios the coach picked in setup and any
  // studio they've published a class at.
  const pickedRows = await db
    .select({ studioId: schema.coachStudios.studioId })
    .from(schema.coachStudios)
    .where(eq(schema.coachStudios.userId, user.id));
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
  const start = new Date(`${todayIso()}T00:00:00Z`);
  const days: { iso: string; label: string; week: number; items: typeof classRows }[] = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    const items = classRows
      .filter((c) => runsOn(c, iso, dow))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    if (items.length)
      days.push({ iso, label: fmtDayHeader(iso), week: Math.floor(days.length / 7), items });
  }

  // The face moved up into the header, above the name, so About starts with
  // what they actually wrote. Tapping it blows it up with the person's
  // follow/share/link/QR actions under it.
  const avatar = (
    <AvatarZoom
      className="profav"
      handle={handle}
      name={user.name}
      photo={user.photo}
      color={avatarColor(user)}
      follow={!isOwner && account ? account : null}
      isOwner={isOwner}
      availability={user.availability}
      canMessage={!isOwner && user.messagesOpen}
    />
  );

  const about = (
    <>
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

  // Contact is its own page: the private-session request plus the ways to
  // reach the coach, stacked as full-width rows. No "Contact" heading on it,
  // because the tab you tapped to get here already says that.
  const hasContactDetails = !!(
    user.contactEmail ||
    user.phone ||
    user.whatsapp ||
    user.instagram ||
    user.website ||
    user.profileLinks.length
  );
  // The header's Message pill is the main door. This one stays for the person
  // who scrolled to Contact looking for exactly this, and only while the coach
  // is taking private clients.
  const canRequest = !isOwner && !!user.availability && user.messagesOpen;
  const hasContact = hasContactDetails || canRequest;
  const contact = hasContact ? (
    <>
      {canRequest && <RequestSessionButton handle={handle} coachName={user.name} />}
      <div className="contactlist">
        {user.contactEmail && (
          <a className="proflink" href={`mailto:${user.contactEmail}`}>
            <Icon name="mail" size={18} /> Email
          </a>
        )}
        {user.phone && (
          <a className="proflink" href={`tel:${user.phone.replace(/[^\d+]/g, "")}`}>
            <Icon name="call" size={18} /> Call
          </a>
        )}
        {user.whatsapp && (
          <a
            className="proflink"
            href={`https://wa.me/${user.whatsapp.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener nofollow"
          >
            <Icon name="chat" size={18} /> WhatsApp
          </a>
        )}
        {user.instagram && (
          <a
            className="proflink"
            href={`https://instagram.com/${user.instagram}`}
            target="_blank"
            rel="noopener nofollow"
          >
            <InstagramGlyph /> Instagram
          </a>
        )}
        {user.website && (
          <a className="proflink" href={user.website} target="_blank" rel="noopener nofollow">
            <Icon name="public" size={18} /> Website
          </a>
        )}
        {user.profileLinks.map((l, i) => (
          <a key={i} className="proflink" href={l.url} target="_blank" rel="noopener nofollow">
            <Icon name="link" size={18} /> {l.label}
          </a>
        ))}
      </div>
    </>
  ) : null;

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
        <div className="ps-week ps-agenda">
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
                    return (
                      <Link
                        key={`${d.iso}-${c.id}`}
                        className="ps-event"
                        data-cid={c.id}
                        data-d={d.iso}
                        data-base={at?.key}
                        href={`/${at?.base ?? handle}/${c.id}?d=${d.iso}`}
                      >
                        <span
                          className="ps-accent"
                          style={{ background: avatarColor(user) }}
                          aria-hidden="true"
                        />
                        <span className="ps-ebody">
                          <span className="ps-enm">{c.name}</span>
                          {where && (
                            <span className="ps-estudio">
                              <Icon name="place" size={13} className="ps-estudio-ic" />
                              {where}
                            </span>
                          )}
                        </span>
                        <span className="ps-etimecol">
                          <span className="ps-etime">
                            {start.hm}
                            <span className="ps-ap">{start.ap}</span>
                          </span>
                          <span className="ps-edur">{c.durationMin} min</span>
                        </span>
                      </Link>
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
      className={`pub profile${viewerId ? " hasnav" : ""}`}
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
          <AppChrome userId={viewerId} bar active={isOwner ? "you" : undefined} />
        ) : (
          <PublicTopBar handle={handle} />
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
          handle={handle}
          tab={tab}
          name={user.name}
          title={user.title ?? ""}
          location={user.location ?? ""}
          hasContact={hasContact}
          hasStudios={!!studios}
          trackSchedule={!isOwner}
          avatar={avatar}
          actions={
            // The owner previewing their own page has nobody to follow and
            // nobody to write to.
            !isOwner ? (
              <div className="profacts">
                {user.messagesOpen && (
                  <RequestSessionButton handle={handle} coachName={user.name} variant="pill" />
                )}
                <NotifyCta
                  trainerName={user.name}
                  handle={handle}
                  account={account}
                  canSignUp={fansEnabled()}
                />
              </div>
            ) : null
          }
          // The owner's controls, top right: the three-dot in the corner,
          // the labeled Add class pill across from the photo. Nobody else
          // sees either.
          ownerTop={
            isOwner ? (
              <>
              {days.length > 0 && <ShareWeekPill handle={handle} />}
              <ProfileOwnerBar
                name={user.name}
                title={user.title ?? ""}
                about={user.about ?? ""}
                location={user.location ?? ""}
                certifications={user.certifications}
                highlights={user.highlights}
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
              </>
            ) : null
          }
          avail={
            <>
              {/* Says which side of the app this person is on. Members have
                  the same shape of page now, so the page itself no longer
                  answers it. Availability left this row for the photo: the
                  dot wears the colour, and the overlay says the words. */}
              <span className="kindtag">Coach</span>
            </>
          }
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
          {/* One section, the one they asked for. Contact and Studios can
              vanish (nothing to show means no tab), so each falls back to the
              schedule rather than rendering an empty page under a tab that
              isn't there. */}
          {tab === "about"
            ? about
            : tab === "studios" && studios
              ? studios
              : tab === "contact" && contact
                ? contact
                : schedule}
        </ProfileTabs>
        </FollowSync>
        {/* The primary action holds the thumb spot in solid brand orange;
            sharing sits up top as the tinted pill. Schedule section only:
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
