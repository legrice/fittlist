import Link from "next/link";
import { schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { AvatarZoom } from "@/components/AvatarZoom";
import { backToFor } from "@/lib/nav";
import { viewerLook } from "@/lib/look";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { fansVisible } from "@/lib/flags";
import { canSeeWeek, sharedWeek } from "@/lib/week";
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
  tab = "schedule",
  from,
}: {
  user: typeof schema.users.$inferSelect;
  isOwner: boolean;
  /** Signed in, a member profile is an app screen like any other, so it gets
   *  the header and the tabs. This was the one page that didn't. */
  viewerId?: string | null;
  /** Schedule leads (what they're going to, for the people allowed to see
   *  it), Info is the about. Same two-tab shape as everyone else's page. */
  tab?: "schedule" | "about";
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

  // Their week. Open unless they have approve-first on, and then it is
  // followers only: the same switch that turns Follow into an ask decides
  // what a stranger can see, which is the Instagram rule and the whole rule.
  // Knowing who is going where and when is what this app is for, so the
  // default is that you can see it.
  const canSee = (await fansVisible()) && (await canSeeWeek(viewerId, user));
  const week = canSee ? await sharedWeek(user.id) : [];
  const firstName = name.split(/\s+/)[0];

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
      className={`pub memberpub${viewerId ? " hasnav" : ""}${isOwner ? " ownbar" : ""}`}
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
          ]}
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
          // The one door to settings, for the same reason a coach's page
          // carries it: Profile is the tab and this page is what it opens.
          ownerTop={
            isOwner ? (
              <Link className="profgear" href="/settings" aria-label="Settings">
                <Icon name="settings" size={26} />
              </Link>
            ) : null
          }
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
        {/* Info: who they are, and honestly nothing more. Most members
            haven't written it yet, and the empty state says so without
            making the page feel unfinished. */}
        {tab === "about" &&
          (user.about?.trim() ? (
            <p className="mempro-about">{user.about}</p>
          ) : (
            <div className="empty-block">
              <h2>Nothing here yet</h2>
              <p>{firstName} hasn&rsquo;t written about themselves.</p>
            </div>
          ))}

        {/* Approve-first and not following yet: say so plainly and name the
            way in. It says the same words whatever the week holds, so it
            cannot be read for whether there is anything behind it. */}
        {tab === "schedule" && !canSee && (
          <div className="empty-block">
            <h2>Follow to see {firstName}&rsquo;s schedule</h2>
            <p>{firstName} approves followers, so their week is for the people they let in.</p>
          </div>
        )}
        {tab === "schedule" && canSee && week.length === 0 && (
          <div className="empty-block">
            <h2>Nothing coming up</h2>
            <p>
              {isOwner
                ? "Add a class and it shows up here."
                : `${firstName} hasn't added anything this week.`}
            </p>
          </div>
        )}

        {tab === "schedule" && canSee && week.length > 0 && (
          <div className="memweek">
            <h2 className="prof-sec-h">{isOwner ? "Your week" : `${firstName}'s week`}</h2>
            {isOwner && (
              <p className="memweek-note">
                {user.approveFollowers
                  ? "The people you have approved see this. Nobody else does."
                  : "Anyone who opens your page can see this."}
              </p>
            )}
            {week.map((day) => (
              <div key={day.iso} className="memweek-day">
                <div className="memweek-dayh">{day.label}</div>
                {day.items.map((i) => {
                  const sub = [
                    `${i.hm}${i.ap}`,
                    i.coachName,
                    i.where,
                  ].filter(Boolean).join(" · ");
                  const body = (
                    <span className="memweek-txt">
                      <span className="nm">{i.name}</span>
                      <span className="sub">{sub}</span>
                    </span>
                  );
                  // One of their own has no page to open, so it is a plain
                  // row rather than a link with nowhere to go.
                  return i.handle ? (
                    <Link
                      key={`${i.classId}-${i.iso}`}
                      className="memweek-row"
                      href={`/${i.handle}/${i.classId}?d=${i.iso}`}
                    >
                      {body}
                      <span className="memweek-chev">
                        <Icon name="chevron_right" size={20} />
                      </span>
                    </Link>
                  ) : (
                    <div key={`${i.classId}-${i.iso}`} className="memweek-row">
                      {body}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        </ProfileTabs>
      </div>
    </div>
  );
}
