"use client";

import { useState } from "react";
import { logout } from "@/app/actions/auth";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { DiscoverableToggle } from "@/components/DiscoverableToggle";
import { ApproveFollowersToggle } from "@/components/ApproveFollowersToggle";
import { ChangeHandle } from "@/components/ChangeHandle";
import { Icon } from "@/components/Icon";
import { InviteSheet } from "@/components/InviteFriends";
import { NotificationPrefs } from "@/components/NotificationPrefs";
import { MemberProfileEditor } from "@/components/MemberProfileEditor";
import { MessagesToggle } from "@/components/MessagesToggle";
import { QrSheet } from "@/components/QrSheet";
import { ShareCardSheet } from "@/components/ShareCardSheet";
import { ShareMyWeekSheet } from "@/components/ShareMyWeekSheet";
import { StartCoaching } from "@/components/StartCoaching";
import { Toast, useToast } from "@/components/Toast";

// A member's account. Smaller than a coach's by design: no stats, no studio
// page, no rota. It is not smaller in the ways that matter to a person,
// though: a member claims a handle and has a page at it, so the link, the
// card and the QR code are theirs too. Withholding them was the
// handle-as-coach-badge mistake wearing a different coat.
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
  const [shareMenu, setShareMenu] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();

  const copyLink = async () => {
    const url = `${typeof window === "undefined" ? "" : window.location.origin}/${handle}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied, ready to paste");
    } catch {
      // Clipboard refused (an insecure origin, or a browser that asks). The
      // address itself is the fallback: it can at least be read off and typed.
      toast(url);
    }
  };
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
                  <span className="s">Its shifts, its schedule, and who works there</span>
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
        {handle && (
          <button className="setrow" onClick={() => setShareMenu(true)}>
            <span className="setrow-ic"><Icon name="ios_share" size={22} /></span>
            <span className="setrow-txt">
              <span className="t">Share profile</span>
              <span className="s">Your link, a card, or a QR code</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
          </button>
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

      {/* The invite row moved out to the card below, so this group is one
          conditional row. Drawn unconditionally it was a heading over an
          empty white box for anybody with no feedback door. */}
      {canSendFeedback && (
        <>
          <h3 className="setgroup-h">The beta</h3>
          <div className="settingslist">
            <a className="setrow setrow-hi" href="/feedback">
              <span className="setrow-ic"><Icon name="chat_bubble" size={22} /></span>
              <span className="setrow-txt">
                <span className="t">Send feedback</span>
                <span className="s">Tell us what&rsquo;s broken or missing</span>
              </span>
              <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
            </a>
          </div>
        </>
      )}

      {/* The same card a coach gets, in the same place and for the same
          reason: the people you train with being here is what makes the app
          work, and it is the last thing on the way out rather than the first
          thing on a screen somebody opened to do something else. It replaces
          the plain invite row above rather than joining it, because two doors
          onto one sheet is one door too many. */}
      <div className="acctinvite">
        <div className="acctinvite-txt">
          <h3>Share the love</h3>
          <p>Fittlist works better when the people you train with are on it.</p>
        </div>
        <button className="acctinvite-btn" onClick={() => setInviteOpen(true)}>
          Invite
        </button>
      </div>

      <form action={logout}>
        <button type="submit" className="logoutbtn">
          Log out
        </button>
      </form>

      {/* Handing your page on, in the three ways there are. Same rows and same
          words as a coach's, because it is the same act. */}
      {shareMenu && handle && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShareMenu(false);
          }}
        >
          <div className="sheet">
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setShareMenu(false)}
            >
              <Icon name="close" size={16} />
            </button>
            <h2>Share</h2>
            <p className="lead">fittlist.co/{handle}</p>
            <div className="settingslist ownermenu">
              <button
                className="setrow"
                onClick={() => {
                  setShareMenu(false);
                  copyLink();
                }}
              >
                <span className="setrow-ic"><Icon name="link" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Copy link</span>
                  <span className="s">Paste it anywhere</span>
                </span>
              </button>
              <button
                className="setrow"
                onClick={() => {
                  setShareMenu(false);
                  setCardOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="account_circle" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Profile card</span>
                  <span className="s">A square image for a post</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
              <button
                className="setrow"
                onClick={() => {
                  setShareMenu(false);
                  setQrOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="qr_code_2" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">QR code</span>
                  <span className="s">Scans straight to your page</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
            </div>
          </div>
        </div>
      )}

      {handle && (
        <QrSheet handle={handle} open={qrOpen} onClose={() => setQrOpen(false)} onToast={toast} />
      )}
      {cardOpen && handle && (
        <ShareCardSheet
          path={`/api/card/${handle}`}
          fileName={`fittlist-${handle}.png`}
          title="Profile card"
          lead="A square image of your page, for a post."
          alt="Card image of your profile"
          onClose={() => setCardOpen(false)}
          onToast={toast}
        />
      )}
      {inviteOpen && (
        <InviteSheet
          onClose={() => setInviteOpen(false)}
          // The confirmation belongs to whoever opened the sheet: one
          // rendered inside it unmounts with it and is never seen.
          onCopied={() => toast("Link copied, ready to paste")}
        />
      )}
      {share && <ShareMyWeekSheet onClose={() => setShare(false)} firstIso={firstIso} />}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
