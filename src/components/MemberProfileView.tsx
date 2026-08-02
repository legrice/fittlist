import Link from "next/link";
import { schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { AvatarZoom } from "@/components/AvatarZoom";
import { backToFor } from "@/lib/nav";
import { viewerLook } from "@/lib/look";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { fansVisible } from "@/lib/flags";
import { mutualFollow, sharedWeek } from "@/lib/week";
import { AppChrome } from "@/components/AppChrome";
import { ContactSheet, type ContactWays } from "@/components/ContactSheet";
import { FollowMemberButton } from "@/components/FollowMemberButton";
import { Icon } from "@/components/Icon";
import { MemberProfileActions } from "@/components/MemberProfileActions";
import { ProfileTabs } from "@/components/ProfileTabs";
import { PublicTopBar } from "@/components/PublicTopBar";

// A member's public profile. Deliberately not the coach page: there's no
// schedule behind it, nothing to book, and nobody to email. It's who they are,
// which is what a coach seeing a new follower actually wants to know.
//
// It used to list the coaches they follow. That turned a profile into a
// scoreboard: two people side by side, one with six coaches and one with none,
// and the comparison is doing something nobody asked for. Who you train with
// is yours. You can see your own on Following; a coach sees their own
// followers; and that's the whole audience for it.
export async function MemberProfileView({
  user,
  isOwner,
  viewerId = null,
  from,
}: {
  user: typeof schema.users.$inferSelect;
  isOwner: boolean;
  /** Signed in, a member profile is an app screen like any other, so it gets
   *  the header and the tabs. This was the one page that didn't. */
  viewerId?: string | null;
  from?: string;
}) {
  const name = user.name.trim() || user.email.split("@")[0];

  // Members can follow members. Same table as following a coach, and it buys
  // less on purpose: nothing lands in your week, nothing public changes. Its
  // one payoff is mutual: you both follow each other and both add a class,
  // and Your week says they're going too.
  let follow: { following: boolean; requested: boolean } | null = null;
  if (viewerId && !isOwner && user.handle && (await fansVisible())) {
    const db = await getDb();
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

  // Their week, for the people they follow back. This is the calendar members
  // keep asking to share, gated on the one consent the app trusts: you both
  // tapped Follow on each other. One-way followers and strangers see nothing;
  // the owner sees it too, with a line saying exactly who else can. Real,
  // public classes only; personal entries have no way to appear here.
  const mutual =
    !!viewerId && !isOwner && (await fansVisible()) && (await mutualFollow(viewerId, user.id));
  const week = mutual || (isOwner && (await fansVisible())) ? await sharedWeek(user.id) : [];
  const firstName = name.split(/\s+/)[0];

  const backTo = backToFor(from, !!viewerId);

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
    <div className={`pub memberpub${viewerId ? " hasnav" : ""}`} data-mode={await viewerLook()}>
      <div className="profwrap">
        {viewerId ? <AppChrome userId={viewerId} /> : <PublicTopBar handle={user.handle ?? ""} next={`/${user.handle ?? ""}`} />}
        {/* The same header a coach and a studio wear. A member's page was the
            odd one out: a small circle, a centred name, and none of the shape
            that makes the other two read as the same app. */}
        <ProfileTabs
          base={`/${user.handle ?? ""}`}
          tab="about"
          tabs={[]}
          name={name}
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
          actions={
            isOwner && user.handle ? (
              <MemberProfileActions handle={user.handle} />
            ) : (
              <div className="profacts">
                {showContact && (
                  <ContactSheet
                    handle={user.handle!}
                    coachName={name}
                    signedIn={!!viewerId}
                    canMessage={canMessage}
                    ways={ways}
                  />
                )}
                {follow && (
                  <FollowMemberButton
                    handle={user.handle!}
                    name={name}
                    initialFollowing={follow.following}
                    initialRequested={follow.requested}
                  />
                )}
              </div>
            )
          }
        >
        {user.about?.trim() && <p className="mempro-about">{user.about}</p>}

        {(mutual || isOwner) && week.length > 0 && (
          <div className="memweek">
            <h2 className="prof-sec-h">{isOwner ? "Your week" : `${firstName}'s week`}</h2>
            <p className="memweek-note">
              {isOwner
                ? "People you follow back see this. Nobody else does."
                : "You can see this because you follow each other."}
            </p>
            {week.map((day) => (
              <div key={day.iso} className="memweek-day">
                <div className="memweek-dayh">{day.label}</div>
                {day.items.map((i) => (
                  <Link
                    key={`${i.classId}-${i.iso}`}
                    className="memweek-row"
                    href={`/${i.handle}/${i.classId}?d=${i.iso}`}
                  >
                    <span className="memweek-txt">
                      <span className="nm">{i.name}</span>
                      <span className="sub">
                        {i.hm}
                        {i.ap} · {i.coachName}
                        {i.where ? ` · ${i.where}` : ""}
                      </span>
                    </span>
                    <span className="memweek-chev">
                      <Icon name="chevron_right" size={18} />
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
        </ProfileTabs>
      </div>
    </div>
  );
}
