"use client";

import { useState } from "react";
import { logout } from "@/app/actions/auth";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { DiscoverableToggle } from "@/components/DiscoverableToggle";
import { ApproveFollowersToggle } from "@/components/ApproveFollowersToggle";
import { ChangeHandle } from "@/components/ChangeHandle";
import { Icon } from "@/components/Icon";
import { InviteFriends } from "@/components/InviteFriends";
import { NotificationPrefs } from "@/components/NotificationPrefs";
import { MemberProfileEditor } from "@/components/MemberProfileEditor";
import { MessagesToggle } from "@/components/MessagesToggle";
import { ShareMyWeekSheet } from "@/components/ShareMyWeekSheet";
import { StartCoaching } from "@/components/StartCoaching";

// A member's account. Smaller than a coach's by design: they have no public
// page, no QR code, no stats — just who they are, the classes they marked
// Going, and the switches.
export function MemberAccount({
  runs = [],
  name,
  email,
  handle,
  title,
  about,
  location,
  photo,
  color,
  look,
  goingCount,
  firstIso,
  openEditor = false,
  canSendFeedback = false,
  discoverable = true,
  approveFollowers = false,
  messagesOpen = true,
}: {
  /** The studios they run. A member can be a manager: addStudioManager only
   *  refuses a gym's own account. */
  runs?: { name: string; slug: string; admin: boolean }[];
  name: string;
  email: string;
  handle: string | null;
  title: string;
  about: string;
  location: string;
  photo: string | null;
  color: string;
  look: string | null;
  goingCount: number;
  /** The first day their week holds something, so the share poster starts
   *  where the plans do rather than on an empty today. */
  firstIso?: string;
  openEditor?: boolean;
  /** False when nobody's behind the door: no admin account to write to, or
   *  you are the admin. */
  canSendFeedback?: boolean;
  discoverable?: boolean;
  approveFollowers?: boolean;
  messagesOpen?: boolean;
}) {
  const [share, setShare] = useState(false);
  // Members sign up with an email and nothing else — there's no name step for
  // them — so fall back to the part before the @ rather than showing a blank.
  const shownName = name.trim() || email.split("@")[0];
  const initial = (shownName.charAt(0) || "?").toUpperCase();

  return (
    <>
      <div className="memberid">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="memberid-av" src={photo} alt="" />
        ) : (
          <span
            className="memberid-av memberid-av-empty"
            style={{ background: color }}
            aria-hidden="true"
          >
            {initial}
          </span>
        )}
        <span className="memberid-txt">
          <span className="t">{shownName}</span>
          <span className="s">{handle ? `fittlist.co/${handle}` : email}</span>
        </span>
      </div>

      {/* Grouped like the coach side: your profile first, then the things you
          do, then account plumbing, then the beta. */}
      {runs.length > 0 && (
        <>
          <h3 className="setgroup-h">Your studios</h3>
          <div className="settingslist">
            {runs.map((st) => (
              <a key={st.slug} className="setrow" href={`/s/${st.slug}/shifts`}>
                <span className="setrow-ic"><Icon name="storefront" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">{st.name}</span>
                  <span className="s">Its page, its rota, and its staff</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </a>
            ))}
          </div>
        </>
      )}

      <h3 className="setgroup-h">Profile</h3>
      <div className="settingslist">
        <MemberProfileEditor
          name={name}
          handle={handle}
          title={title}
          about={about}
          location={location}
          photo={photo}
          color={color}
          openOnMount={openEditor}
        />
        {handle && (
          <a className="setrow" href={`/${handle}`}>
            <span className="setrow-ic"><Icon name="north_east" size={22} /></span>
            <span className="setrow-txt">
              <span className="t">View your profile</span>
              <span className="s">How it looks to everyone else</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
          </a>
        )}
        <ChangeHandle />
        <DiscoverableToggle initialOn={discoverable} />
        <ApproveFollowersToggle initialOn={approveFollowers} />
        <MessagesToggle initialOn={messagesOpen} />
      </div>

      <div className="settingslist">
        {/* The other half of adding: once your week has classes in it, this is
            where you post them. */}
        <button className="setrow" onClick={() => setShare(true)}>
          <span className="setrow-ic"><Icon name="event_available" size={22} /></span>
          <span className="setrow-txt">
            <span className="t">Share classes you&rsquo;re attending</span>
            <span className="s">
              {goingCount > 0
                ? `A story image of the ${goingCount} class${goingCount === 1 ? "" : "es"} in your week`
                : "Add a class to your week and it lands here"}
            </span>
          </span>
          <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
        </button>
      </div>

      {/* The member side is the front door; coaching is a door off it. */}
      <div className="settingslist">
        <StartCoaching handle={handle} />
      </div>

      <h3 className="setgroup-h">Account &amp; app</h3>
      <div className="settingslist">
        <NotificationPrefs />
        <DarkModeToggle initialOn={look === "dark"} />
      </div>

      <h3 className="setgroup-h">The beta</h3>
      <div className="settingslist">
        <InviteFriends />
        {canSendFeedback && (
          <a className="setrow setrow-hi" href="/feedback">
            <span className="setrow-ic"><Icon name="chat_bubble" size={22} /></span>
            <span className="setrow-txt">
              <span className="t">Send feedback</span>
              <span className="s">Tell us what&rsquo;s broken or missing</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
          </a>
        )}
      </div>

      <form action={logout}>
        <button type="submit" className="logoutbtn">
          Log out
        </button>
      </form>

      {share && <ShareMyWeekSheet onClose={() => setShare(false)} firstIso={firstIso} />}
    </>
  );
}
