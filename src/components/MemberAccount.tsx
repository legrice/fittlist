"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { MyCalendar } from "@/components/MyCalendar";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { DeleteAccount } from "@/components/DeleteAccount";
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
import { Toast, useToast } from "@/components/Toast";

type MView = "profile" | "calendar" | "reach" | "account";

const VIEW_TITLE: Record<MView, string> = {
  profile: "Profile & public page",
  calendar: "Calendar & sync",
  reach: "Privacy & communication",
  account: "Account & preferences",
};

// A member's account. Smaller than a coach's by design: no studio page, no
// rota, and no schedule story, because a member has no week of their own to
// draw. It is not smaller in the ways that matter to a person, though: a
// member claims a handle and has a page at it, so the link, the card and the
// QR code are theirs too. Withholding them was the handle-as-coach-badge
// mistake wearing a different coat.
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
  followingCount,
  followerCount,
  openEditor = false,
  canSendFeedback = false,
  discoverable = true,
  approveFollowers = false,
  messagesOpen = true,
  initialView = null,
  detailOnly = false,
  onClose,
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
  /** The two relationships, each opening the list it counts. */
  followingCount: number;
  followerCount: number;
  openEditor?: boolean;
  /** False when nobody's behind the door: no admin account to write to, or
   *  you are the admin. */
  canSendFeedback?: boolean;
  discoverable?: boolean;
  approveFollowers?: boolean;
  messagesOpen?: boolean;
  initialView?: MView | null;
  detailOnly?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  // The same four sub-screens the coach's account opens, one level deep.
  // Each is a bottom sheet over this page, and the rows inside them are the
  // very same components: two layouts for one idea is how they drift, and
  // the leaves were already shared.
  const [view, setView] = useState<MView | null>(initialView);
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
      <div hidden={detailOnly}>
      {/* Who this is, then the two things you do with it. The same tile,
          the same pair and the same weights the coach's account wears: a
          member's settings were a different screen doing the same job, and
          two layouts for one idea is how they drift. */}
      <div className="acctwho">
        <button
          className="acctwho-id"
          onClick={() => handle && router.push(`/${handle}`)}
          aria-label="Open your profile"
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="acctwho-av" src={photo} alt="" />
          ) : (
            <span
              className="acctwho-av acctwho-av-empty"
              style={{ background: color }}
              aria-hidden="true"
            >
              {initial}
            </span>
          )}
          <span className="acctwho-txt">
            <span className="acctwho-nm">{shownName}</span>
            {title ? <span className="acctwho-sub">{title}</span> : null}
            <span className="acctwho-url">{handle ? `fittlist.co/${handle}` : email}</span>
          </span>
        </button>
        <button className="tertiary acctedit" onClick={() => setView("profile")}>
          Edit
        </button>
      </div>

      {handle && (
        <div className="acctacts">
          <button className="btn ghost" onClick={() => router.push(`/${handle}`)}>
            Preview profile
          </button>
          <button className="btn si" onClick={() => setShareMenu(true)}>
            Share
          </button>
        </div>
      )}

      {/* Grouped like the coach side: your profile first, then the things you
          do, then account plumbing, then the beta. */}
      {runs.length > 0 && (
        <>
          <h3 className="setgroup-h">Your studios</h3>
          <div className="settingslist">
            {runs.map((st) => (
              <Link
                key={st.slug}
                className="setrow"
                href={`/s/${st.slug}/${st.admin ? "manage" : "shifts"}`}
                prefetch={false}
              >
                <span className="setrow-ic"><Icon name="storefront" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">{st.name}</span>
                  <span className="s">
                    {st.admin ? "Calendar and staff" : "Your shifts and what's open"}
                  </span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* One list of four rows, each opening a sub-screen, each subtitle
          saying where the setting stands so the top level answers most of it
          without a tap. It was two headed groups and nine rows on one
          scroll, with sharing and privacy in the same block as your name. */}
      <h3 className="setgroup-h">Settings</h3>
      <div className="settingslist">
        <button className="setrow" onClick={() => setView("profile")}>
          <span className="setrow-ic"><Icon name="account_circle" size={24} /></span>
          <span className="setrow-txt">
            <span className="t">Profile &amp; public page</span>
            <span className="s">Your name, photo, handle and where you are</span>
          </span>
          <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
        </button>
        <button className="setrow" onClick={() => setView("calendar")}>
          <span className="setrow-ic"><Icon name="event" size={24} /></span>
          <span className="setrow-txt">
            <span className="t">Calendar &amp; sync</span>
            <span className="s">Your week in Apple, Google or Outlook</span>
          </span>
          <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
        </button>
        <button className="setrow" onClick={() => setView("reach")}>
          <span className="setrow-ic"><Icon name="public_off" size={24} /></span>
          <span className="setrow-txt">
            <span className="t">Privacy &amp; communication</span>
            <span className="s">
              {`Messages ${messagesOpen ? "on" : "off"}`}
              {` · ${discoverable ? "Listed" : "Not listed"}`}
              {` · Approvals ${approveFollowers ? "on" : "off"}`}
            </span>
          </span>
          <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
        </button>
        <button className="setrow" onClick={() => setView("account")}>
          <span className="setrow-ic"><Icon name="lock" size={24} /></span>
          <span className="setrow-txt">
            <span className="t">Account &amp; preferences</span>
            <span className="s">Notifications, appearance</span>
          </span>
          <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
        </button>
      </div>

      {/* "Start coaching" used to sit here: an ask, filed for an admin to
          answer, because a self-served switch was how ghost inventory got
          into the directory. It is the toggle in the group above now. The
          gate that ask existed to hold is still there, one step later: a
          class is only public once a handle exists and the account says it
          teaches, and turning the switch off takes the listing away again
          without touching a week. Two doors onto one idea is one too many,
          and the one behind an approval queue was the slower one. */}

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

      <h3 className="setgroup-h">FittList</h3>
      <div className="settingslist">
        {canSendFeedback && (
          <Link className="setrow" href="/feedback">
            <span className="setrow-ic"><Icon name="chat_bubble" size={24} /></span>
            <span className="setrow-txt">
              <span className="t">Send feedback</span>
              <span className="s">Tell us what is working or what needs attention</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
          </Link>
        )}
        <Link className="setrow" href="/privacy">
          <span className="setrow-ic"><Icon name="shield" size={24} /></span>
          <span className="setrow-txt">
            <span className="t">Privacy policy</span>
            <span className="s">How FittList handles your information</span>
          </span>
          <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
        </Link>
      </div>

      <h3 className="setgroup-h">Session</h3>
      <form action={logout} className="settingslist">
        <button type="submit" className="setrow">
          <span className="setrow-ic"><Icon name="logout" size={24} /></span>
          <span className="setrow-txt">
            <span className="t">Log out</span>
            <span className="s">Sign out of this device</span>
          </span>
        </button>
      </form>
      </div>

      {/* The four sub-screens. Each holds the rows that used to sit under a
          heading on the main scroll, and every one of them is a component the
          coach's account renders too, so a switch means the same thing and
          looks the same on both. */}
      {view && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) detailOnly ? onClose?.() : setView(null);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => detailOnly ? onClose?.() : setView(null)}>
              <Icon name="close" size={18} />
            </button>
            <h2>{VIEW_TITLE[view]}</h2>

            {view === "profile" && (
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
                <ChangeHandle />
                {handle && (
                  <a className="setrow" href={`/${handle}`}>
                    <span className="setrow-ic"><Icon name="north_east" size={24} /></span>
                    <span className="setrow-txt">
                      <span className="t">View your profile</span>
                      <span className="s">How it looks to everyone else</span>
                    </span>
                    <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
                  </a>
                )}
              </div>
            )}

            {view === "calendar" && (
              <div className="settingslist">
                <MyCalendar />
              </div>
            )}

            {view === "reach" && (
              <div className="settingslist">
                <MessagesToggle initialOn={messagesOpen} />
                <DiscoverableToggle initialOn={discoverable} />
                <ApproveFollowersToggle initialOn={approveFollowers} />
                <a className="setrow" href="/blocked">
                  <span className="setrow-ic"><Icon name="public_off" size={24} /></span>
                  <span className="setrow-txt">
                    <span className="t">Removed people</span>
                    <span className="s">Who can&rsquo;t see your page</span>
                  </span>
                  <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
                </a>
              </div>
            )}

            {view === "account" && (
              <>
                <div className="settingslist">
                  <NotificationPrefs />
                  <DarkModeToggle initialOn={look === "dark"} />
                </div>
                <DeleteAccount />
              </>
            )}
          </div>
        </div>
      )}

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
              <Icon name="close" size={18} />
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
                <span className="setrow-ic"><Icon name="link" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Copy link</span>
                  <span className="s">Paste it anywhere</span>
                </span>
              </button>
              {/* No schedule story here. A member has no week of their own
                  to draw: the classes on this app belong to the people who
                  teach them, and a poster of somebody else's is theirs to
                  make. The card and the QR code stay, because those are a
                  picture of this page, which is a thing a member has. */}
              <button
                className="setrow"
                onClick={() => {
                  setShareMenu(false);
                  setCardOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="account_circle" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Profile card</span>
                  <span className="s">A square image for a post</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              <button
                className="setrow"
                onClick={() => {
                  setShareMenu(false);
                  setQrOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="qr_code_2" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">QR code</span>
                  <span className="s">Scans straight to your page</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
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
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
