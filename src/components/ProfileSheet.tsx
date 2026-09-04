"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { startRegistration } from "@simplewebauthn/browser";
import {
  beginPasskeyRegistration,
  finishPasskeyRegistration,
  logout,
  removePasskeys,
  setPassword as setPasswordAction,
} from "@/app/actions/auth";
import { updateAwayStatus, updateProfile } from "@/app/actions/profile";
import { disconnectGoogleAction } from "@/app/actions/google";
import { Icon } from "@/components/Icon";
import { DeleteAccount } from "@/components/DeleteAccount";
import { DiscoverableToggle } from "@/components/DiscoverableToggle";
import { ShiftsPublicToggle } from "@/components/ShiftsPublicToggle";
import { ApproveFollowersToggle } from "@/components/ApproveFollowersToggle";
import { NotificationPrefs } from "@/components/NotificationPrefs";
import { MessagesToggle } from "@/components/MessagesToggle";
import { MyCalendar } from "@/components/MyCalendar";
import { InviteSheet } from "@/components/InviteFriends";
import { ChangeHandle } from "@/components/ChangeHandle";
import { EmbedScheduleButton } from "@/components/EmbedScheduleButton";
import { QrSheet } from "@/components/QrSheet";
import { ShareCardSheet } from "@/components/ShareCardSheet";
import { clearClientMemory } from "@/lib/client-memory";
import { myWeekText } from "@/app/actions/weektext";
import { Toast, useToast } from "@/components/Toast";
import { forgetLocalPasskey, rememberLocalPasskey } from "@/lib/passkey-device";
import { TimeZoneSetting } from "@/components/TimeZoneSetting";
import { TeachingToggle } from "@/components/TeachingToggle";

// The four the spec's settings list opens, plus the leaves each of those
// holds. A leaf is still reachable on its own, because the sub-screen is a
// list of rows and each row opens one.
type View =
  | "home"
  | "page"
  | "calendar"
  | "reach"
  | "account"
  | "security"
  | "contact"
  | "gcal"
  | "embed"
  | "availability"
  | "away";

// The trainer's account. Home shows the profile tile, the share cards, and
// the settings lists; each settings row opens a bottom sheet. As `page` it is
// the You tab itself, rendered in the flow of the tabs layout; without it, it
// is the same thing as an overlay, for the coaches-only mode where there is
// no tab bar to hold it.
export function ProfileSheet({
  handle,
  anim = "up",
  page = false,
  name,
  title,
  photo,
  subsCount,
  followingCount,
  requestCount,
  email,
  instagram,
  website,
  contactEmail,
  phone,
  whatsapp,
  about,
  availability,
  away = false,
  awayBanner = "",
  awayMessage = "",
  awayStartsOn = "",
  awayEndsOn = "",
  awayHideClasses = false,
  googleConfigured,
  googleConnected,
  googleEmail,
  hasPassword,
  passkeyCount,
  isAdmin = false,
  canSendFeedback = false,
  shiftCount = 0,
  runs = [],
  shiftsPublic = false,
  avatarColor,
  showFanView = false,
  discoverable = true,
  approveFollowers = false,
  messagesOpen = true,
  timeZone,
  onClose,
  initialView = "home",
  detailOnly = false,
  showHeading = true,
}: {
  handle: string;
  anim?: "up" | "left" | "none";
  /** Render in the page flow (the You tab): no fixed layer, no close button. */
  page?: boolean;
  name: string;
  title: string;
  photo: string | null;
  subsCount: number;
  /** Who you follow. Every stat here opens a list now. */
  followingCount: number;
  requestCount: number;
  email: string;
  instagram: string;
  website: string;
  contactEmail: string;
  phone: string;
  whatsapp: string;
  about: string;
  availability: string | null;
  away?: boolean;
  awayBanner?: string;
  awayMessage?: string;
  awayStartsOn?: string;
  awayEndsOn?: string;
  awayHideClasses?: boolean;
  googleConfigured: boolean;
  googleConnected: boolean;
  googleEmail: string | null;
  hasPassword: boolean;
  passkeyCount: number;
  isAdmin?: boolean;
  /** False when there's nobody behind the door: no admin account exists, or
   *  you are the one it would go to. */
  canSendFeedback?: boolean;
  /** How many gym slots they are on, so the calendar row and the shifts
   *  switch can both say what they are about. */
  shiftCount?: number;
  /** Their answer to whether those shifts show on their public page. */
  shiftsPublic?: boolean;
  /** The studios they run, if any. Managing one was reachable only from the
   *  studio's own page, which is no help to somebody who runs a gym without
   *  teaching there: Where I coach is built from coach_studios and a manager
   *  need not be in it. */
  runs?: { name: string; slug: string; admin: boolean }[];
  /** The coach's own palette colour, so a photo-less avatar reads as theirs. */
  avatarColor: string;
  showFanView?: boolean;
  discoverable?: boolean;
  approveFollowers?: boolean;
  messagesOpen?: boolean;
  look: string | null;
  timeZone: string;
  /** Unused as a page: a tab is not a thing you close. */
  onClose?: () => void;
  initialView?: View;
  detailOnly?: boolean;
  /** A standalone route can supply its own navigation-aware page header. */
  showHeading?: boolean;
}) {
  const router = useRouter();
  const [toastMsg, toastOn, toast] = useToast();
  const [view, setView] = useState<View>(initialView);

  // Share is one door with the focused image studio behind it, rather than a
  // second schedule generator maintained inside Profile.
  const [shareMenu, setShareMenu] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [webcalUrl, setWebcalUrl] = useState("");
  const [connected, setConnected] = useState(googleConnected);
  const [disconnecting, startDisconnect] = useTransition();

  const [pkCount, setPkCount] = useState(passkeyCount);
  const [pwSet, setPwSet] = useState(hasPassword);
  const emailShown = email;
  const [passkeyable, setPasskeyable] = useState(false);
  const [busy, setBusy] = useState(false);

  // Password changes re-authenticate with the current password.
  const [pwSheet, setPwSheet] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [curPw, setCurPw] = useState("");

  // Contact-info sub-view fields.
  const [cEmail, setCEmail] = useState(contactEmail);
  const [cPhone, setCPhone] = useState(phone);
  const [cWhatsapp, setCWhatsapp] = useState(whatsapp);
  const [cInstagram, setCInstagram] = useState(instagram);
  const [cWebsite, setCWebsite] = useState(website);
  const [contactSaving, setContactSaving] = useState(false);

  // Availability: whether the coach is taking private clients. A status, shown
  // as a pill on their page; whether anyone can write to them is the Messages
  // switch, a separate question. Saves on the tap.
  const [avail, setAvail] = useState<string | null>(availability);
  const [availSaving, setAvailSaving] = useState(false);
  const [isAway, setIsAway] = useState(away);
  const [awayPublic, setAwayPublic] = useState(awayBanner);
  const [awayReply, setAwayReply] = useState(awayMessage);
  const [awayStart, setAwayStart] = useState(awayStartsOn);
  const [awayEnd, setAwayEnd] = useState(awayEndsOn);
  const [hideClassesWhileAway, setHideClassesWhileAway] = useState(awayHideClasses);
  const [awaySaving, setAwaySaving] = useState(false);

  useEffect(() => {
    setPasskeyable(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);
  useEffect(() => {
    setWebcalUrl(`webcal://${window.location.host}/api/cal/${handle}`);
  }, [handle]);

  // Returning from the Google OAuth flow: say how it went. The callback lands
  // on this screen because this is where the Google Calendar row lives.
  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get("gcal");
    if (!g) return;
    const msg: Record<string, string> = {
      connected: "Google Calendar connected. Your classes are syncing",
      denied: "Google connection cancelled",
      noretoken: "Couldn't connect. Try again and allow calendar access",
      unconfigured: "Google Calendar isn't set up yet",
      error: "Something went wrong connecting Google",
    };
    toast(msg[g] ?? "");
    if (g === "connected") setConnected(true);
    window.history.replaceState(null, "", window.location.pathname);
  }, [toast]);

  const openView = (v: View) => setView(v);
  const goBack = () => {
    if (detailOnly) onClose?.();
    else setView("home");
  };

  const goProfile = () => router.push(`/${handle}`);

  const disconnectGcal = () =>
    startDisconnect(async () => {
      const result = await disconnectGoogleAction();
      if (!result.ok) {
        toast("Couldn't disconnect Google Calendar. Try again");
        return;
      }
      setConnected(false);
      toast("Google Calendar disconnected");
    });

  const addPasskey = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await beginPasskeyRegistration();
      if (!res.ok) {
        toast(res.error);
        return;
      }
      const reg = await startRegistration({ optionsJSON: res.options });
      const fin = await finishPasskeyRegistration(reg, "Passkey");
      if (fin.ok) {
        setPkCount(1);
        rememberLocalPasskey();
        toast("Passkey added");
      } else toast(fin.error ?? "Couldn't add that passkey");
    } catch (err) {
      const nm = (err as Error)?.name;
      if (nm !== "AbortError" && nm !== "NotAllowedError") toast("Couldn't add that passkey");
    } finally {
      setBusy(false);
    }
  };

  const removePk = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await removePasskeys();
      if (res.ok) {
        setPkCount(0);
        forgetLocalPasskey();
        toast("Passkey removed");
      } else toast(res.error ?? "Couldn't remove");
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (busy || newPw.length < 8) return;
    setBusy(true);
    try {
      const res = await setPasswordAction(newPw, curPw);
      if (res.ok) {
        setPwSet(true);
        setPwSheet(false);
        setNewPw("");
        setCurPw("");
        toast("Password saved");
      } else toast(res.error ?? "Couldn't save that password");
    } finally {
      setBusy(false);
    }
  };

  const saveContact = () => {
    if (contactSaving) return;
    setContactSaving(true);
    (async () => {
      const res = await updateProfile({
        name,
        title,
        about,
        instagram: cInstagram,
        website: cWebsite,
        contactEmail: cEmail,
        phone: cPhone,
        whatsapp: cWhatsapp,
      });
      if (res.ok) {
        toast("Contact info saved");
        router.refresh();
        goBack();
      } else toast(res.error ?? "Couldn't save");
      setContactSaving(false);
    })();
  };

  const pickAvail = (next: string | null) => {
    if (availSaving || next === avail) return;
    const was = avail;
    setAvail(next);
    setAvailSaving(true);
    (async () => {
      // name/title/about are what updateProfile always requires; availability is
      // the only field this screen is allowed to touch.
      const res = await updateProfile({
        name,
        title,
        about,
        instagram,
        website,
        availability: next,
      });
      if (!res.ok) {
        setAvail(was);
        toast(res.error ?? "Couldn't save");
      } else router.refresh();
      setAvailSaving(false);
    })();
  };

  const saveAway = () => {
    if (awaySaving) return;
    setAwaySaving(true);
    (async () => {
      const res = await updateAwayStatus({ away: isAway, banner: awayPublic, message: awayReply, startsOn: awayStart, endsOn: awayEnd, hideClasses: hideClassesWhileAway });
      if (res.ok) {
        toast(isAway ? "Away status saved" : "Away status turned off");
        router.refresh();
        goBack();
      } else toast(res.error ?? "Couldn't save");
      setAwaySaving(false);
    })();
  };

  // The plainest of the five ways to hand the page on, and the one people
  // reach for most: the URL itself.
  const copyLink = async () => {
    const url = `${typeof window === "undefined" ? "" : window.location.origin}/${handle}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied, ready to paste");
    } catch {
      toast(url);
    }
  };

  const copyCal = async () => {
    try {
      await navigator.clipboard.writeText(webcalUrl);
      toast("Calendar link copied");
    } catch {
      toast(webcalUrl);
    }
  };

  // The next seven days as pasteable text, built on the server: this screen
  // holds no class rows, and threading the week through it for one button is
  // exactly what the action exists to avoid.
  const copyWeekText = async () => {
    const res = await myWeekText();
    if (!res.ok || !res.text) {
      toast(res.error ?? "Couldn't copy that");
      return;
    }
    try {
      await navigator.clipboard.writeText(res.text);
      toast("Week copied, ready to paste");
    } catch {
      toast("Couldn't copy that");
    }
  };

  const AVAIL_LABEL: Record<string, string> = {
    accepting: "Accepting new clients",
    waitlist: "Waitlist only",
  };
  const availLabel = (avail && AVAIL_LABEL[avail]) || "Not shown on your page";

  const VIEW_TITLE: Record<Exclude<View, "home">, string> = {
    page: "Profile & public page",
    calendar: "Calendar & sync",
    reach: "Privacy & communication",
    account: "Account & preferences",
    security: "Login & security",
    contact: "Contact info",
    availability: "Availability",
    away: "Set yourself as away",
    gcal: "Google Calendar",
    embed: "Embed your schedule",
  };
  const viewTitle = view === "home" ? "" : VIEW_TITLE[view];

  return (
    <>
      <div
        className={`acctwrap${page ? " acct-page" : ""}${anim === "left" ? " acct-from-left" : ""}${anim === "none" ? " acct-noanim" : ""}`}
        hidden={detailOnly}
        role={page ? undefined : "dialog"}
        aria-modal={page ? undefined : true}
        aria-label={page ? undefined : "Your account"}
      >
        {/* As the You tab the face row leads and no heading repeats the tab's
            own name; the overlay skin keeps its close row. */}
        {!page && (
          <div className="accttop">
            <h1 className="acct-h">Settings</h1>
            <button className="iconbtn acctclose" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={20} />
            </button>
          </div>
        )}

        {page && showHeading && <h3 className="setgroup-h">Settings</h3>}
        <div className="settingslist">
          <button className="setrow" onClick={() => openView("away")}>
            <span className="setrow-ic"><Icon name="schedule" size={24} /></span>
            <span className="setrow-txt">
              <span className="t">Set yourself as away</span>
              <span className="s">{isAway ? "Your away dates are set" : "Add a profile note and message for people who contact you"}</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
          </button>
          <button className="setrow" onClick={() => openView("calendar")}>
            <span className="setrow-ic"><Icon name="event" size={24} /></span>
            <span className="setrow-txt">
              <span className="t">Calendar &amp; sync</span>
              <span className="s">
                {googleConfigured && connected ? "Google connected" : "Google"}, Apple and Outlook,
                your week as text
              </span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
          </button>
          <button className="setrow" onClick={() => openView("reach")}>
            <span className="setrow-ic"><Icon name="public_off" size={24} /></span>
            <span className="setrow-txt">
              <span className="t">Privacy &amp; communication</span>
              <span className="s">
                {`Messages ${messagesOpen ? "on" : "off"}`}
                {showFanView ? ` · ${discoverable ? "Listed" : "Not listed"}` : ""}
                {` · Approvals ${approveFollowers ? "on" : "off"}`}
              </span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
          </button>
          <button className="setrow" onClick={() => openView("account")}>
            <span className="setrow-ic"><Icon name="lock" size={24} /></span>
            <span className="setrow-txt">
              <span className="t">Account &amp; preferences</span>
              <span className="s">Coach · login, notifications, appearance</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
          </button>
        </div>

        <h3 className="setgroup-h">FittList</h3>
        <div className="settingslist">
          <button className="setrow" onClick={() => setInviteOpen(true)}>
            <span className="setrow-ic"><Icon name="reply" size={24} /></span>
            <span className="setrow-txt">
              <span className="t">Share FittList</span>
              <span className="s">Send the app to the people you train with</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
          </button>
          {isAdmin && (
            <Link className="setrow" href="/admin" prefetch={false}>
              <span className="setrow-ic"><Icon name="admin_panel_settings" size={24} /></span>
              <span className="setrow-txt">
                <span className="t">Admin</span>
                <span className="s">Activity, people, studios, and maintenance</span>
              </span>
              <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
            </Link>
          )}
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
          <Link className="setrow" href="/support">
            <span className="setrow-ic"><Icon name="info" size={24} /></span>
            <span className="setrow-txt">
              <span className="t">Support &amp; safety</span>
              <span className="s">Get help or report a concern</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
          </Link>
          {isAdmin && (
            <>
              <Link className="setrow" href="/admin/marketing" prefetch={false}>
                <span className="setrow-ic"><Icon name="campaign" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Marketing site preview</span>
                  <span className="s">Review the private landing-page draft</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </Link>
              <Link className="setrow" href="/brand">
                <span className="setrow-ic"><Icon name="palette" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Brand</span>
                  <span className="s">Logos, colors, and visual direction</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </Link>
              <Link className="setrow" href="/ethos">
                <span className="setrow-ic"><Icon name="favorite" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Ethos</span>
                  <span className="s">What FittList believes</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </Link>
            </>
          )}
        </div>

        <h3 className="setgroup-h">Session</h3>
        <form action={logout} className="settingslist" onSubmit={clearClientMemory}>
          <button type="submit" className="setrow">
            <span className="setrow-ic"><Icon name="logout" size={24} /></span>
            <span className="setrow-txt">
              <span className="t">Log out</span>
              <span className="s">Sign out of this device</span>
            </span>
          </button>
        </form>

      </div>

      {/* Every settings section opens the same way: a bottom sheet over the
          list. These four used to slide in a whole pane from the right, which
          was a third behavior next to the sheets and the page links. */}
      {view !== "home" && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) goBack();
          }}
        >
          <div className="sheet settings-detail-sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={goBack}>
              <Icon name="close" size={18} />
            </button>
            <h2>{viewTitle}</h2>

          {/* The four sub-screens. Each is the rows that used to sit under a
              heading on the main scroll, and the leaves they open are the
              same sheets as before, so nothing learned a new behaviour. */}
          {view === "page" && (
            <div className="settingslist">
              <button className="setrow" onClick={() => openView("availability")}>
                <span className="setrow-ic"><Icon name="event_available" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Availability</span>
                  <span className="s">{availLabel}</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              <button className="setrow" onClick={() => openView("away")}>
                <span className="setrow-ic"><Icon name="schedule" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Set yourself as away</span>
                  <span className="s">{isAway ? "Your away status is on" : "Add a profile note and message for people who contact you"}</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              <button className="setrow" onClick={() => openView("contact")}>
                <span className="setrow-ic"><Icon name="alternate_email" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Contact info</span>
                  <span className="s">How people reach you</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              <ChangeHandle />
              {/* Only once a gym has actually put them on something. A switch
                  for a thing you don't have is a question nobody asked. */}
              {shiftCount > 0 && (
                <ShiftsPublicToggle initialOn={shiftsPublic} count={shiftCount} />
              )}
            </div>
          )}

          {/* All four calendar doors on one screen, which is the whole reason
              this screen exists: Google was under Your page, the week feed was
              under Account, and the two copies were loose links in the
              footer. Somebody looking for calendar settings had to find four
              places. */}
          {view === "calendar" && (
            <div className="settingslist">
              {googleConfigured && (
                <button className="setrow" onClick={() => openView("gcal")}>
                  <span className="setrow-ic"><Icon name="event" size={24} /></span>
                  <span className="setrow-txt">
                    <span className="t">Google Calendar</span>
                    <span className="s">{connected ? "Connected" : "Sync your classes"}</span>
                  </span>
                  <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
                </button>
              )}
              <MyCalendar hasShifts={shiftCount > 0} />
              <TimeZoneSetting initialTimeZone={timeZone} />
              <button className="setrow" onClick={copyCal}>
                <span className="setrow-ic"><Icon name="link" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Apple or Outlook</span>
                  <span className="s">Copy your calendar feed link</span>
                </span>
              </button>
              <button className="setrow" onClick={copyWeekText}>
                <span className="setrow-ic"><Icon name="content_copy" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Your week as text</span>
                  <span className="s">Ready to paste anywhere</span>
                </span>
              </button>
              <button className="setrow" onClick={() => openView("embed")}>
                <span className="setrow-ic"><Icon name="link" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Website embed</span>
                  <span className="s">Choose which teaching studios to include</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
            </div>
          )}

          {view === "embed" && <EmbedScheduleButton handle={handle} inline />}

          {/* Who gets to you, and how. The switches live behind a tap rather
              than on the landing screen, because a toggle you can catch with
              a thumb on the way past is how somebody silently leaves
              Discover. */}
          {view === "reach" && (
            <div className="settingslist">
              <MessagesToggle initialOn={messagesOpen} />
              {showFanView && <DiscoverableToggle initialOn={discoverable} />}
              <ApproveFollowersToggle initialOn={approveFollowers} />
              <Link className="setrow" href="/blocked">
                <span className="setrow-ic"><Icon name="public_off" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Removed people</span>
                  <span className="s">Who can&rsquo;t see your page</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </Link>
            </div>
          )}

          {view === "account" && (
            <div className="settingslist">
              <TeachingToggle initialOn />
              <button className="setrow" onClick={() => openView("security")}>
                <span className="setrow-ic"><Icon name="lock" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Login &amp; security</span>
                  <span className="s">Email, password, and passkeys</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              <NotificationPrefs />
            </div>
          )}
          {view === "account" && (
            <>
              <form action={logout} className="settingslist" onSubmit={clearClientMemory}>
                <button type="submit" className="setrow">
                  <span className="setrow-ic"><Icon name="logout" size={24} /></span>
                  <span className="setrow-txt">
                    <span className="t">Log out</span>
                    <span className="s">Sign out of this device</span>
                  </span>
                </button>
              </form>
              <DeleteAccount isCoach />
            </>
          )}

          {view === "security" && (
            <div className="secblock">
              <div className="secrow">
                <span className="secrow-ic"><Icon name="mail" size={24} /></span>
                <span className="secrow-txt">
                  <span className="t">Email</span>
                  <span className="s">{emailShown}</span>
                </span>
                <Link className="secbtn" href="/support">Get help</Link>
              </div>
              <div className="secrow">
                <span className="secrow-ic"><Icon name="lock" size={24} /></span>
                <span className="secrow-txt">
                  <span className="t">Password</span>
                  <span className="s">{pwSet ? "A password is set" : "No password yet"}</span>
                </span>
                <button
                  className="secbtn"
                  onClick={() => { setNewPw(""); setCurPw(""); setPwSheet(true); }}
                >
                  {pwSet ? "Change" : "Set"}
                </button>
              </div>
              {passkeyable && (
                <div className="secrow">
                  <span className="secrow-ic"><Icon name="fingerprint" size={24} /></span>
                  <span className="secrow-txt">
                    <span className="t">Face ID / passkey</span>
                    <span className="s">
                      {pkCount > 0 ? "A passkey is set" : "Sign in with your face or fingerprint"}
                    </span>
                  </span>
                  <button className="secbtn" onClick={pkCount > 0 ? removePk : addPasskey} disabled={busy}>
                    {pkCount > 0 ? "Remove" : "Add"}
                  </button>
                </div>
              )}
            </div>
          )}

          {view === "contact" && (
            <>
              <p className="lead">
                These show as buttons on your public profile. All optional.
              </p>
              <label className="flabel" htmlFor="cEmail">Contact email</label>
              <input id="cEmail" className="editinput" type="email" autoCapitalize="none" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="you@example.com" />
              <label className="flabel" htmlFor="cPhone">Phone</label>
              <input id="cPhone" className="editinput" type="tel" value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="+1 555 123 4567" />
              <label className="flabel" htmlFor="cWhatsapp">WhatsApp</label>
              <input id="cWhatsapp" className="editinput" type="tel" value={cWhatsapp} onChange={(e) => setCWhatsapp(e.target.value)} placeholder="+1 555 123 4567" />
              <label className="flabel" htmlFor="cInstagram">Instagram</label>
              <input id="cInstagram" className="editinput" type="text" autoCapitalize="none" value={cInstagram} onChange={(e) => setCInstagram(e.target.value)} placeholder="yourhandle" />
              <label className="flabel" htmlFor="cWebsite">Website</label>
              <input id="cWebsite" className="editinput" type="url" autoCapitalize="none" value={cWebsite} onChange={(e) => setCWebsite(e.target.value)} placeholder="yoursite.com" />
              <div className="publishwrap">
                <button className="btn si" onClick={saveContact} disabled={contactSaving}>
                  {contactSaving ? "Saving…" : "Save contact info"}
                </button>
              </div>
            </>
          )}

          {view === "availability" && (
            <>
              <p className="lead">
                Whether you are taking private clients, shown as a line on your page. Hidden
                says nothing either way. Whether people can write to you is the Messages switch,
                further down.
              </p>
              <div className="availpick">
                {[
                  { id: "accepting", t: "Accepting", s: "Taking new private clients" },
                  { id: "waitlist", t: "Waitlist", s: "Full, with a list" },
                  { id: null, t: "Hidden", s: "Your page says nothing about it" },
                ].map((o) => {
                  const on = avail === o.id;
                  return (
                    <button
                      key={o.t}
                      className={`availopt${on ? " sel" : ""}`}
                      aria-pressed={on}
                      disabled={availSaving}
                      onClick={() => pickAvail(o.id)}
                    >
                      <span className="availopt-txt">
                        <span className="t">{o.t}</span>
                        <span className="s">{o.s}</span>
                      </span>
                      {on && <Icon name="check" size={20} />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {view === "away" && (
            <>
              <p className="lead away-lead">Let people know you&rsquo;re away without closing messages or changing your availability.</p>
              <div className="settingslist away-toggle-list">
                <button className="setrow" type="button" onClick={() => setIsAway((value) => !value)} aria-pressed={isAway}>
                  <span className="setrow-ic"><Icon name="schedule" size={24}/></span>
                  <span className="setrow-txt"><span className="t">Away</span><span className="s">{isAway ? "On during the dates below" : "Off, your profile behaves normally"}</span></span>
                  <span className={`switch${isAway ? " on" : ""}`} aria-hidden="true"><span className="switch-knob"/></span>
                </button>
                <button className="setrow" type="button" onClick={() => setHideClassesWhileAway((value) => !value)} aria-pressed={hideClassesWhileAway}>
                  <span className="setrow-ic"><Icon name="calendar_month" size={24}/></span>
                  <span className="setrow-txt"><span className="t">Hide classes during these dates</span><span className="s">They stay saved and reappear afterward</span></span>
                  <span className={`switch${hideClassesWhileAway ? " on" : ""}`} aria-hidden="true"><span className="switch-knob"/></span>
                </button>
              </div>
              <div className="away-fields">
                <div className="away-date-fields">
                  <div><label className="flabel" htmlFor="awayStart">Away from</label><input id="awayStart" className="editinput" type="date" value={awayStart} onChange={(event)=>setAwayStart(event.target.value)} /></div>
                  <div><label className="flabel" htmlFor="awayEnd">Away through</label><input id="awayEnd" className="editinput" type="date" min={awayStart || undefined} value={awayEnd} onChange={(event)=>setAwayEnd(event.target.value)} /></div>
                </div>
                <p className="hint">Your away details only appear during these dates.</p>
                <label className="flabel" htmlFor="awayReply">Away message</label>
                <textarea id="awayReply" className="editinput reqmsg" rows={3} maxLength={300} value={awayReply} onChange={(event)=>setAwayReply(event.target.value)} placeholder="I’m away until Monday and will reply when I’m back." />
                <p className="hint">People see this before they send you a message.</p>
                <label className="flabel" htmlFor="awayBanner">Profile note <span>&middot; optional</span></label>
                <input id="awayBanner" className="editinput" maxLength={140} value={awayPublic} onChange={(event)=>setAwayPublic(event.target.value)} placeholder="Away through September 8" />
                <p className="hint">Shown on your public profile while you&rsquo;re away.</p>
              </div>
              <div className="publishwrap"><button className="btn si" type="button" onClick={saveAway} disabled={awaySaving || (isAway && (!awayReply.trim() || !awayStart || !awayEnd))}>{awaySaving ? "Saving…" : "Save away settings"}</button></div>
            </>
          )}

          {view === "gcal" && (
            <>
              <p className="lead">
                Mirror your classes into Google Calendar. We only add the classes you post and never
                touch your personal events.
              </p>
              {connected ? (
                <div className="rowcta gcal-on">
                  <span className="ig"><Icon name="event_available" size={24} /></span>
                  <span>
                    <span className="t">Connected</span>
                    <br />
                    <span className="s">
                      {googleEmail ? `Syncing to ${googleEmail}` : "Your classes auto-sync on every change"}
                    </span>
                  </span>
                  <button className="gcal-off" disabled={disconnecting} onClick={disconnectGcal}>
                    {disconnecting ? "…" : "Disconnect"}
                  </button>
                </div>
              ) : (
                <a className="btn si" href="/api/google/connect">
                  Connect Google Calendar
                </a>
              )}
              <button className="calcopy" onClick={copyCal} style={{ marginTop: 18 }}>
                Apple or Outlook? Copy your calendar feed link
              </button>
            </>
          )}
          </div>
        </div>
      )}

      {pwSheet && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setPwSheet(false); }}>
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setPwSheet(false)}>
              <Icon name="close" size={18} />
            </button>
            <h2>{pwSet ? "Change password" : "Set a password"}</h2>
            <p className="lead">At least 8 characters. You can still use a magic link or passkey.</p>
            {pwSet && (
              <input className="editinput" type="password" autoComplete="current-password" placeholder="Current password" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
            )}
            <input className="editinput" style={pwSet ? { marginTop: 10 } : undefined} type="password" autoComplete="new-password" placeholder="New password" value={newPw} onChange={(e) => setNewPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePassword()} />
            <div className="publishwrap">
              <button className="btn si" onClick={savePassword} disabled={busy || newPw.length < 8}>
                {busy ? "Saving…" : "Save password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* One sheet, five ways, the public URL at the top so the sheet says
          what it is about before it says what you can do with it. */}
      {shareMenu && (
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
              <button
                className="setrow"
                onClick={(event) => {
                  setShareMenu(false);
                  window.dispatchEvent(new CustomEvent("fittlist:open-share", {
                    detail: { opener:event.currentTarget },
                  }));
                }}
              >
                <span className="setrow-ic"><Icon name="auto_awesome" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Schedule story</span>
                  <span className="s">A tall image of your week</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
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
              <button
                className="setrow"
                onClick={() => {
                  setShareMenu(false);
                  setInviteOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="groups" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Share FittList</span>
                  <span className="s">Send the app to the people you train with</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
            </div>
          </div>
        </div>
      )}

      <QrSheet handle={handle} open={qrOpen} onClose={() => setQrOpen(false)} onToast={toast} />
      {cardOpen && (
        <ShareCardSheet
          path={`/api/card/${handle}`}
          fileName={`fittlist-${handle}-card.png`}
          title="Share your profile"
          lead="A square card for a post or a story. The link on it goes to your page."
          alt="Your profile card"
          onClose={() => setCardOpen(false)}
          onToast={toast}
        />
      )}
      {inviteOpen && (
        <InviteSheet
          onClose={() => setInviteOpen(false)}
          onCopied={() => toast("FittList link copied")}
        />
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
