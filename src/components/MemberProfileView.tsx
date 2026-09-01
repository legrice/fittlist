import Link from "next/link";
import { schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { AvatarZoom } from "@/components/AvatarZoom";
import { backToFor } from "@/lib/nav";
import { viewerLook } from "@/lib/look";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { canSeeWeek, memberWeek, type SharedWeekItem } from "@/lib/week";
import { fansVisible } from "@/lib/flags";
import { AppChrome } from "@/components/AppChrome";
import { ContactSheet, type ContactWays } from "@/components/ContactSheet";
import { Icon } from "@/components/Icon";
import { FollowMemberButton } from "@/components/FollowMemberButton";
import { MemberProfileActions } from "@/components/MemberProfileActions";
import { ProfileTabs } from "@/components/ProfileTabs";
import { PublicTopBar } from "@/components/PublicTopBar";
import { ProfileStudioRail } from "@/components/ProfileStudioRail";
import { ProfileShoutouts } from "@/components/ProfileShoutouts";
import { ProfileInfoEmpty } from "@/components/ProfileInfoEmpty";
import { ProfileAbout } from "@/components/ProfileAbout";
import { CalendarList, type WeekDayRows } from "@/components/WeekView";
import { ClassOpener } from "@/components/ClassOpener";
import { ScheduleNudge } from "@/components/ScheduleNudge";
import { hiddenFrom } from "@/lib/blocks";
import { CalendarPinButton } from "@/components/CalendarPinButton";
import { ProfileOverflow } from "@/components/ProfileOverflow";

// A member's public profile. Deliberately not the coach page: there's no
// schedule behind it, nothing to book, and nobody to email. It's who they are,
// which is what a coach seeing a new follower actually wants to know.
//
// It lists the coaches they follow, by Matt's call, and that is a doctrine
// reversal said out loud: "a follow is private" held for a long time, on the
// scoreboard argument. On this build following is the app's public spine
// (the tab, the merged week, the whole member side), so who you train with
// is the one thing a member's page has to say.
export async function MemberProfileView({
  user,
  isOwner,
  viewerId = null,
  tab = "schedule",
  from,
}: {
  user: typeof schema.users.$inferSelect;
  isOwner: boolean;
  /** Signed in, a member profile is an app screen like any other, so it gets
   *  the header and the tabs. This was the one page that didn't. */
  viewerId?: string | null;
  /** Following leads (the coaches they follow), About is the bio. The
   *  key stays "schedule" because the bare handle is that tab's route and
   *  the word in the URL is not worth breaking links over. */
  tab?: "schedule" | "about" | "studios";
  from?: string;
}) {
  const name = user.name.trim() || user.email.split("@")[0];
  const db = await getDb();

  // Members can follow members. Same table as following a coach, and it buys
  // less on purpose: nothing lands in your week, nothing public changes. Its
  // one payoff is mutual: you both follow each other and both add a class,
  // and Your week says they're going too.
  let follow: { following: boolean; requested: boolean; followsYou: boolean } | null = null;
  if (viewerId && !isOwner && user.handle && (await fansVisible())) {
    const [viewer] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, viewerId));
    if (viewer) {
      const [[row], [reverse], [req]] = await Promise.all([
        db
          .select({ optedOutAt: schema.subscribers.optedOutAt })
          .from(schema.subscribers)
          .where(
            and(
              eq(schema.subscribers.trainerUserId, user.id),
              eq(schema.subscribers.email, viewer.email),
            ),
          ),
        db
          .select({ optedOutAt: schema.subscribers.optedOutAt })
          .from(schema.subscribers)
          .where(
            and(
              eq(schema.subscribers.trainerUserId, viewerId),
              eq(schema.subscribers.email, user.email),
            ),
          ),
        db
          .select({ id: schema.followRequests.id })
          .from(schema.followRequests)
          .where(
            and(
              eq(schema.followRequests.trainerUserId, user.id),
              eq(schema.followRequests.requesterUserId, viewerId),
            ),
          ),
      ]);
      const following = !!row && !row.optedOutAt;
      // A pending ask renders as "Requested", so a tap can withdraw it.
      const requested = !following && !!req;
      follow = { following, requested, followsYou: !!reverse && !reverse.optedOutAt };
    }
  }

  // The coaches they follow: the page's first tab now, in place of the
  // shared week.
  const firstName = name.split(/\s+/)[0];
  const visitedStudios = (
    await db
      .select({ studio: schema.studios })
      .from(schema.studioEndorsements)
      .innerJoin(schema.studios, eq(schema.studioEndorsements.targetStudioId, schema.studios.id))
      .where(
        and(
          eq(schema.studioEndorsements.endorserUserId, user.id),
          eq(schema.studioEndorsements.trait, "been_here"),
          eq(schema.studios.placeKind, "studio"),
        ),
      )
  )
    .map((row) => row.studio)
    .sort((a, b) => a.name.localeCompare(b.name));

  // The week they built on the Share tab, by Matt's call: the classes they
  // marked and the dated entries they typed land here and nowhere else
  // public, and each falls off once it has run. Gated the way every week
  // is: open unless they turned approve-first on.
  const week =
    user.handle && (await canSeeWeek(viewerId, user)) ? await memberWeek(user.id) : [];

  const backTo = isOwner
    ? from === "profile" ? { href: "/you", label: "Back to your profile" } : undefined
    : backToFor(from, !!viewerId);
  const shoutoutRows = await db
    .select({ id: schema.shoutouts.id, body: schema.shoutouts.body, featuredAt: schema.shoutouts.featuredAt, authorName: schema.users.name, authorUserId: schema.shoutouts.authorUserId })
    .from(schema.shoutouts)
    .innerJoin(schema.users, eq(schema.shoutouts.authorUserId, schema.users.id))
    .where(eq(schema.shoutouts.targetUserId, user.id));
  const hiddenShoutoutAuthors = await hiddenFrom(viewerId);

  // The same ways in a coach's page offers, minus the one that needs a
  // published week. A member with nothing filled in gets no pill at all.
  const ways: ContactWays = {
    email: user.contactEmail ?? "",
    phone: user.phone ?? "",
    whatsapp: user.whatsapp ?? "",
    instagram: user.instagram ?? "",
    website: user.website ?? "",
    links: user.profileLinks,
  };
  const canMessage = !isOwner && user.messagesOpen;
  const showContact =
    !isOwner &&
    !!user.handle &&
    (canMessage ||
      !!(
        ways.email ||
        ways.phone ||
        ways.whatsapp ||
        ways.instagram ||
        ways.website ||
        ways.links.length
      ));

  return (
    <div
      className={`pub memberpub${viewerId ? " hasnav" : ""}${isOwner ? " ownbar" : ""} pub-hero`}
      data-mode={await viewerLook()}
    >
      <div className="profwrap">
        {/* Your own page keeps the tab bar, exactly as a coach's does: it is
            what the Profile tab opens now, so without the bar the tab is a
            one-way door. Somebody else's still has none, and its arrow is the
            way off. */}
        {viewerId ? (
          <AppChrome
            userId={viewerId}
            bar={isOwner}
            headerNav={false}
            social
            mobileHeader={isOwner}
          />
        ) : (
          <PublicTopBar handle={user.handle ?? ""} next={`/${user.handle ?? ""}`} />
        )}
        {/* The same header a coach and a studio wear. A member's page was the
            odd one out: a small circle, a centred name, and none of the shape
            that makes the other two read as the same app. */}
        <ProfileTabs
          base={`/${user.handle ?? ""}`}
          tab="schedule"
          tabs={[]}
          infoSheet
          /* The coach page's full-bleed hero, by Matt's call: the photo when
             there is one, the person's own colour when there isn't, so a
             member's page is the same page rather than a lesser layout. */
          name={name}
          summary={null}
          title={user.title ?? ""}
          location={user.location ?? ""}
          avatar={
            <div className="profile-avatar-favorite">
              <AvatarZoom
                className="profav"
                handle={user.handle ?? ""}
                name={name}
                photo={user.photo}
                color={avatarColor(user)}
                isOwner={isOwner}
              />
              {!isOwner&&viewerId?<CalendarPinButton entityType="person" entityId={user.id} entityName={name} className="calendar-pin-button profile-photo-favorite"/>:null}
            </div>
          }
          backTo={backTo}
          // Nothing above the name; see PublicProfileView.
          badges={null}
          // Settings lives in the shared app header; floating it here as well
          // made the owner's page carry two doors to the same place.
          ownerTop={!isOwner&&viewerId?<ProfileOverflow profileId={user.id} path={`/${user.handle!}`} name={name}/>:null}
          actions={
            isOwner && user.handle ? (
              <MemberProfileActions handle={user.handle} />
            ) : (
              <div className="profacts">
                {follow && (
                  <FollowMemberButton
                    handle={user.handle!}
                    name={name}
                    initialFollowing={follow.following}
                    initialRequested={follow.requested}
                    followsYou={follow.followsYou}
                  />
                )}
                {showContact && (
                  <ContactSheet
                    handle={user.handle!}
                    coachName={name}
                    signedIn={!!viewerId}
                    canMessage={canMessage}
                    ways={ways}
                  />
                )}
              </div>
            )
          }
          closingContent={null}
        >
        <section id="profile-schedule" className="profile-anchor-section">
        {week.length > 0 ? (
          <ClassOpener handle="">
            <CalendarList days={memberCalendarDays(week, name)} className="profile-calendar-list" />
          </ClassOpener>
        ) : (
          <div className="empty-block profile-empty-small"><h2>No upcoming schedule</h2><p>{isOwner ? "Add plans from Share when you have something coming up." : `${firstName} hasn’t shared upcoming plans.`}</p>{canMessage && user.handle && <ScheduleNudge handle={user.handle} name={name} signedIn={!!viewerId} />}</div>
        )}
        </section>
        <section id="profile-about" className="profile-anchor-section">
          <h2 className="profile-section-title">Info</h2>
          {!user.about?.trim() && visitedStudios.length === 0 && (
            <ProfileInfoEmpty
              handle={user.handle ?? ""}
              firstName={firstName}
              owner={isOwner}
            />
          )}
          {visitedStudios.length > 0 && (
            <div className="profile-info-section">
            <h2 className="profile-section-title">Studios</h2>
            <div className="profile-studio-group">
              <h3 className="profile-studio-group-title">Places I&rsquo;ve been</h3>
              <ProfileStudioRail studios={visitedStudios} />
            </div>
            </div>
          )}
          {user.about?.trim() && (
            <div className="profile-info-section">
              <h2 className="profile-section-title">About</h2>
              <ProfileAbout text={user.about} />
            </div>
          )}
          <ProfileShoutouts
            handle={user.handle ?? undefined}
            name={name}
            signedIn={!!viewerId}
            viewerId={viewerId}
            owner={isOwner}
            initial={shoutoutRows.filter((row) => !hiddenShoutoutAuthors.has(row.authorUserId)).map((row) => ({ id: row.id, body: row.body, featured: !!row.featuredAt, authorName: row.authorName || "Someone", authorUserId: row.authorUserId }))}
          />
        </section>
        </ProfileTabs>
      </div>
    </div>
  );
}

/** One row of the member's week. A mark at a real class links to its page;
 *  one of their own is plain text, because there is no page behind it. */
function memberCalendarDays(
  week: { iso: string; label: string; items: SharedWeekItem[] }[],
  profileName: string,
): WeekDayRows[] {
  const ownerName = profileName.trim().toLocaleLowerCase();
  return week.map((day) => ({
    iso: day.iso,
    label: day.label,
    rows: day.items.map((it) => ({
      key: `${it.classId}.${it.iso}`,
      name: it.name,
      where: it.where,
      hm: it.hm,
      ap: it.ap,
      dur: `${it.durationMin} min`,
      coach: it.coachName && it.coachName.trim().toLocaleLowerCase() !== ownerName
        ? { id: it.handle ?? it.coachName, name: it.coachName, color: "var(--color-coaching)", photo: null }
        : null,
      href: it.handle ? `/${it.handle}/${it.classId}?d=${it.iso}` : null,
      classId: it.classId,
      iso: it.iso,
      base: it.handle ?? undefined,
    })),
  }));
}
