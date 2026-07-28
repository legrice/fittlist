"use client";

import { useState } from "react";
import { logout } from "@/app/actions/auth";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { Icon } from "@/components/Icon";
import { InviteFriends } from "@/components/InviteFriends";
import { MemberProfileEditor } from "@/components/MemberProfileEditor";
import { ShareMyWeekSheet } from "@/components/ShareMyWeekSheet";
import { StartCoaching } from "@/components/StartCoaching";

// A member's account. Smaller than a coach's by design: they have no public
// page, no QR code, no stats — just who they are, the classes they marked
// Going, and the switches.
export function MemberAccount({
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
  openEditor = false,
}: {
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
  openEditor?: boolean;
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
      </div>

      <div className="settingslist">
        {/* The other half of "I'm going": once you've marked classes, this is
            where you post them. */}
        <button className="setrow" onClick={() => setShare(true)}>
          <span className="setrow-ic"><Icon name="event_available" size={22} /></span>
          <span className="setrow-txt">
            <span className="t">Share classes you&rsquo;re attending</span>
            <span className="s">
              {goingCount > 0
                ? `A story image of the ${goingCount} class${goingCount === 1 ? "" : "es"} you marked Going`
                : "Mark a class Going and it lands here"}
            </span>
          </span>
          <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
        </button>
      </div>

      {/* The member side is the front door; coaching is a door off it. */}
      <div className="settingslist">
        <StartCoaching name={name} />
        <InviteFriends />
      </div>

      <div className="settingslist">
        <DarkModeToggle initialOn={look === "dark"} />
      </div>

      <form action={logout}>
        <button type="submit" className="logoutbtn">
          Log out
        </button>
      </form>

      {share && <ShareMyWeekSheet onClose={() => setShare(false)} />}
    </>
  );
}
