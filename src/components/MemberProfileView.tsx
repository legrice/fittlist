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
import { ProfileShare } from "@/components/ProfileShare";
import { ProfileStudioRail } from "@/components/ProfileStudioRail";

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
  let follow: { following: boolean; requested: boolean } | null = null;
  if (viewerId && !isOwner && user.handle && (await fansVisible())) {
    const [viewer] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, viewerId));
    if (viewer) {
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
      // A pending ask renders as "Requested", so a tap can withdraw it.
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
      follow = { following, requested };
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

  // No arrow on your own page. It is what the Profile tab opens now, so
  // there is nothing behind it to go back to: the bar underneath is the way
  // on, and an arrow pointing at Following on a screen you reached from a tab
  // is a control offering to undo a tap you did not make.
  const backTo = isOwner ? undefined : backToFor(from, !!viewerId);

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
            active={isOwner ? "you" : undefined}
          />
        ) : (
          <PublicTopBar handle={user.handle ?? ""} next={`/${user.handle ?? ""}`} />
        )}
        {/* The same header a coach and a studio wear. A member's page was the
            odd one out: a small circle, a centred name, and none of the shape
            that makes the other two read as the same app. */}
        <ProfileTabs
          base={`/${user.handle ?? ""}`}
          tab={tab}
          tabs={[
            { key: "schedule", label: "Schedule" },
            { key: "about", label: "Info" },
            ...(visitedStudios.length ? [{ key: "studios", label: "Studios" }] : []),
          ]}
          /* The coach page's full-bleed hero, by Matt's call: the photo when
             there is one, the person's own colour when there isn't, so a
             member's page is the same page rather than a lesser layout. */
          heroPhoto={user.photo}
          heroColor={avatarColor(user)}
          heroCta={
            isOwner && !user.photo ? (
              <Link className="herocta" href="/settings?edit=1" aria-label="Add a photo">
                <Icon name="image" size={24} />
              </Link>
            ) : undefined
          }
          name={name}
          summary={user.about}
          sharePrompt={isOwner ? "Let people know where to find you." : `Know someone who should know ${firstName}?`}
          shareLabel={isOwner ? "Share your profile" : "Share their profile"}
          title={user.title ?? ""}
          location={user.location ?? ""}
          avatar={
            <AvatarZoom
              className="profav"
              handle={user.handle ?? ""}
              name={name}
              photo={user.photo}
              color={avatarColor(user)}
              isOwner={isOwner}
            />
          }
          backTo={backTo}
          // Nothing above the name; see PublicProfileView.
          badges={null}
          // Settings lives in the shared app header; floating it here as well
          // made the owner's page carry two doors to the same place.
          ownerTop={null}
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
                <ProfileShare path={`/${user.handle!}`} name={name} pill />
              </div>
            )
          }
        >
        {/* The bio already lives beneath the action pills. Info is reserved
            for structured profile details when members gain them. */}
        <section id="profile-schedule" className="profile-anchor-section">
        {week.length > 0 ? (
          <div className="memwk">
            {week.map((day) => (
              <div key={day.iso} className="memwk-day">
                <div className="memwk-band">{day.label}</div>
                {day.items.map((it) => <MemberWeekRow key={`${it.classId}.${it.iso}`} it={it} />)}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-block profile-empty-small"><h2>No upcoming schedule</h2><p>{isOwner ? "Add plans from Share when you have something coming up." : `${firstName} hasn’t shared upcoming plans.`}</p></div>
        )}
        </section>
        <section id="profile-about" className="profile-anchor-section">
          <h2 className="profile-section-title">Info</h2>
          <div className="empty-block profile-info-empty">
            <h2>Nothing here yet</h2>
            <p>{firstName} hasn&rsquo;t added anything to their info yet.</p>
          </div>
        </section>
        {visitedStudios.length > 0 && (
          <section id="profile-studios" className="profile-anchor-section">
            <h2 className="profile-section-title">Studios</h2>
            <div className="profile-studio-group">
              <h3 className="profile-studio-group-title">Places I&rsquo;ve been</h3>
              <ProfileStudioRail studios={visitedStudios} />
            </div>
          </section>
        )}
        </ProfileTabs>
      </div>
    </div>
  );
}

/** One row of the member's week. A mark at a real class links to its page;
 *  one of their own is plain text, because there is no page behind it. */
function MemberWeekRow({ it }: { it: SharedWeekItem }) {
  const sub = [it.coachName ? `with ${it.coachName}` : "", it.where ?? ""]
    .filter(Boolean)
    .join(" · ");
  const body = (
    <>
      <span className="memwk-time">
        {it.hm}
        <em>{it.ap}</em>
      </span>
      <span className="memwk-txt">
        <span className="memwk-nm">{it.name}</span>
        {sub && <span className="memwk-sub">{sub}</span>}
      </span>
    </>
  );
  return it.handle ? (
    <Link className="memwk-row" href={`/${it.handle}/${it.classId}?d=${it.iso}`}>
      {body}
    </Link>
  ) : (
    <div className="memwk-row">{body}</div>
  );
}
