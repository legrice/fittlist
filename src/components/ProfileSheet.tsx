"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { ShareWeekSheet } from "@/components/ShareWeekSheet";
import {
  beginPasskeyRegistration,
  changeEmail as changeEmailAction,
  finishPasskeyRegistration,
  logout,
  removePasskeys,
  setPassword as setPasswordAction,
} from "@/app/actions/auth";
import { updateProfile } from "@/app/actions/profile";
import { disconnectGoogleAction } from "@/app/actions/google";
import { Icon } from "@/components/Icon";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { DiscoverableToggle } from "@/components/DiscoverableToggle";
import { ApproveFollowersToggle } from "@/components/ApproveFollowersToggle";
import { NotificationPrefs } from "@/components/NotificationPrefs";
import { MessagesToggle } from "@/components/MessagesToggle";
import { MyCalendar } from "@/components/MyCalendar";
import { InviteFriends, InviteSheet } from "@/components/InviteFriends";
import { ChangeHandle } from "@/components/ChangeHandle";
import { QrSheet } from "@/components/QrSheet";
import { ShareCardSheet } from "@/components/ShareCardSheet";
import { Toast, useToast } from "@/components/Toast";

type View = "home" | "security" | "contact" | "gcal" | "availability";

// The trainer's account page. Home shows the profile tile, the two feature
// cards, and a settings list. Each settings row opens a sub-view that slides in
// from the right; its back arrow slides it out to reveal the home view again.
export function ProfileSheet({
  handle,
  anim = "up",
  name,
  title,
  photo,
  subsCount,
  profileViews,
  requestCount,
  email,
  instagram,
  website,
  contactEmail,
  phone,
  whatsapp,
  about,
  availability,
  googleConfigured,
  googleConnected,
  googleEmail,
  hasPassword,
  passkeyCount,
  isAdmin = false,
  canSendFeedback = false,
  hasShifts = false,
  avatarColor,
  showFanView = false,
  discoverable = true,
  approveFollowers = false,
  messagesOpen = true,
  look,
  onClose,
}: {
  handle: string;
  anim?: "up" | "left" | "none";
  name: string;
  title: string;
  photo: string | null;
  subsCount: number;
  profileViews: number;
  requestCount: number;
  email: string;
  instagram: string;
  website: string;
  contactEmail: string;
  phone: string;
  whatsapp: string;
  about: string;
  availability: string | null;
  googleConfigured: boolean;
  googleConnected: boolean;
  googleEmail: string | null;
  hasPassword: boolean;
  passkeyCount: number;
  isAdmin?: boolean;
  /** False when there's nobody behind the door: no admin account exists, or
   *  you are the one it would go to. */
  canSendFeedback?: boolean;
  /** They're on a gym's rota, so the calendar row says so. */
  hasShifts?: boolean;
  /** The coach's own palette colour, so a photo-less avatar reads as theirs. */
  avatarColor: string;
  showFanView?: boolean;
  discoverable?: boolean;
  approveFollowers?: boolean;
  messagesOpen?: boolean;
  look: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [toastMsg, toastOn, toast] = useToast();
  const [view, setView] = useState<View>("home");

  const [shareOpen, setShareOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [webcalUrl, setWebcalUrl] = useState("");
  const [connected, setConnected] = useState(googleConnected);
  const [disconnecting, startDisconnect] = useTransition();

  const [pkCount, setPkCount] = useState(passkeyCount);
  const [pwSet, setPwSet] = useState(hasPassword);
  const [emailShown, setEmailShown] = useState(email);
  const [passkeyable, setPasskeyable] = useState(false);
  const [busy, setBusy] = useState(false);

  // Change-email / change-password sheets (re-auth with current password).
  const [emailSheet, setEmailSheet] = useState(false);
  const [pwSheet, setPwSheet] = useState(false);
  const [newEmail, setNewEmail] = useState(email);
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

  useEffect(() => {
    setPasskeyable(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);
  useEffect(() => {
    setWebcalUrl(`webcal://${window.location.host}/api/cal/${handle}`);
  }, [handle]);

  const openView = (v: View) => setView(v);
  const goBack = () => setView("home");

  const goProfile = () => router.push(`/${handle}`);

  const disconnectGcal = () =>
    startDisconnect(async () => {
      await disconnectGoogleAction();
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
        toast("Passkey removed");
      } else toast(res.error ?? "Couldn't remove");
    } finally {
      setBusy(false);
    }
  };

  const saveEmail = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await changeEmailAction(newEmail, curPw);
      if (res.ok) {
        setEmailShown(newEmail.trim().toLowerCase());
        setEmailSheet(false);
        setCurPw("");
        toast("Email updated");
      } else toast(res.error ?? "Couldn't update email");
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

  const copyCal = async () => {
    try {
      await navigator.clipboard.writeText(webcalUrl);
      toast("Calendar link copied");
    } catch {
      toast(webcalUrl);
    }
  };

  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  const firstName = name.trim().split(/\s+/)[0] || name;
  const AVAIL_LABEL: Record<string, string> = {
    accepting: "Accepting new clients",
    waitlist: "Waitlist only",
  };
  const availLabel = (avail && AVAIL_LABEL[avail]) || "Not shown on your page";

  const viewTitle =
    view === "security"
      ? "Login & security"
      : view === "contact"
        ? "Contact info"
        : view === "availability"
          ? "Availability"
          : "Google Calendar";

  return (
    <>
      <div
        className={`acctwrap${anim === "left" ? " acct-from-left" : ""}${anim === "none" ? " acct-noanim" : ""}`}
        role="dialog"
        aria-label="Your account"
      >
        <div className="accttop">
          <h1 className="acct-h">Settings</h1>
          <button className="iconbtn acctclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Who this is, on the paper rather than in a card. It isn't a setting,
            it's the label on the drawer, so boxing it made it read as the first
            row of a list it doesn't belong to. */}
        <div className="acctwho">
          <button className="acctwho-id" onClick={goProfile} aria-label="Open your profile">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="acctwho-av" src={photo} alt="" />
            ) : (
              <span
                className="acctwho-av acctwho-av-empty"
                style={{ background: avatarColor }}
                aria-hidden="true"
              >
                {initial}
              </span>
            )}
            <span className="acctwho-txt">
              <span className="acctwho-nm">{firstName}</span>
              {title ? <span className="acctwho-sub">{title}</span> : null}
            </span>
          </button>
          {/* Editing shouldn't need a detour through the preview: this opens
              the public page with the editor already up. */}
          <button className="tertiary acctedit" onClick={() => router.push(`/${handle}?edit=1`)}>
            Edit
          </button>
        </div>

        <div className="acctstats acctstats-grid">
          <div className="acctstat">
            <span className="n">{profileViews}</span>
            <span className="l">Profile views</span>
          </div>
          {/* The only stat with somewhere to go: a number of people is a list. */}
          <button className="acctstat" onClick={() => router.push("/followers")}>
            <span className="n">{subsCount}</span>
            <span className="l">Followers</span>
          </button>
          {/* Same as Followers: a number of people is a list, so it opens one.
              It was a dead number sitting next to a live one. */}
          <button className="acctstat" onClick={() => router.push("/requests")}>
            <span className="n">{requestCount}</span>
            <span className="l">Requests</span>
          </button>
        </div>

        <div className="acctcards">
          <button className="acctcard" onClick={goProfile}>
            <span className="acctcard-ic"><Icon name="account_circle" size={26} /></span>
            <span className="acctcard-t">Preview profile</span>
            <span className="acctcard-s">See and edit your public page</span>
          </button>
          <button className="acctcard" onClick={() => setShareOpen(true)}>
            <span className="acctcard-ic"><Icon name="campaign" size={26} /></span>
            <span className="acctcard-t">Share your schedule</span>
            <span className="acctcard-s">A story image with your link</span>
          </button>
          <button className="acctcard acctcard-wide" onClick={() => setQrOpen(true)}>
            <span className="acctcard-ic"><Icon name="qr_code_2" size={26} /></span>
            <span className="acctcard-txt">
              <span className="acctcard-t">Share your page</span>
              <span className="acctcard-s">Your link, QR code, and card, in one place</span>
            </span>
          </button>
          {/* The Requests row that lived below moved into the stat tile above
              (a number of people is a list, and the tile opens it); the spot
              goes to growth. Same tile grid, so every gap up here matches. */}
          <button className="acctcard acctcard-wide" onClick={() => setInviteOpen(true)}>
            <span className="acctcard-ic"><Icon name="groups" size={26} /></span>
            <span className="acctcard-txt">
              <span className="acctcard-t">Share your beta link</span>
              <span className="acctcard-s">Anyone who opens it can join fittlist</span>
            </span>
          </button>
        </div>

        <h3 className="setgroup-h">Your page</h3>
        <div className="settingslist">
          {/* Availability leads: the state of your books changes far more often
              than your bio, and the row says where it stands without opening. */}
          <button className="setrow" onClick={() => openView("availability")}>
            <span className="setrow-ic"><Icon name="event_available" size={22} /></span>
            <span className="setrow-txt">
              <span className="t">Availability</span>
              <span className="s">{availLabel}</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
          </button>
          <button className="setrow" onClick={() => openView("contact")}>
            <span className="setrow-ic"><Icon name="alternate_email" size={22} /></span>
            <span className="setrow-txt">
              <span className="t">Contact info</span>
              <span className="s">How people reach you</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
          </button>
          <ChangeHandle />
          {googleConfigured && (
            <button className="setrow" onClick={() => openView("gcal")}>
              <span className="setrow-ic"><Icon name="event" size={22} /></span>
              <span className="setrow-txt">
                <span className="t">Google Calendar</span>
                <span className="s">{connected ? "Connected" : "Sync your classes"}</span>
              </span>
              <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
            </button>
          )}
        </div>

        {/* Reach: the switches and the block list belong together, because
            they're all one question — who gets to you, and how. */}
        <h3 className="setgroup-h">Who can reach you</h3>
        <div className="settingslist">
          <MessagesToggle initialOn={messagesOpen} />
          {showFanView && <DiscoverableToggle initialOn={discoverable} />}
          <ApproveFollowersToggle initialOn={approveFollowers} />
          {/* Quiet, and quietly reachable: the only place a block is visible. */}
          <a className="setrow" href="/blocked">
            <span className="setrow-ic"><Icon name="public_off" size={22} /></span>
            <span className="setrow-txt">
              <span className="t">Removed people</span>
              <span className="s">Who can&rsquo;t see your page</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
          </a>
        </div>

        <h3 className="setgroup-h">Account &amp; app</h3>
        <div className="settingslist">
          <button className="setrow" onClick={() => openView("security")}>
            <span className="setrow-ic"><Icon name="lock" size={22} /></span>
            <span className="setrow-txt">
              <span className="t">Login &amp; security</span>
              <span className="s">Email, password, and passkeys</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
          </button>
          {/* Back, because a gym's rota puts shifts in here and a coach has to
              be able to see what they're teaching without opening the app.
              Not knowing you were on is what cost somebody a class. */}
          <MyCalendar hasShifts={hasShifts} />
          <NotificationPrefs />
          <DarkModeToggle initialOn={look === "dark"} />
        </div>

        {/* "Your week" and "Share classes you're attending" used to live here.
            The Following tab already is your week, so the row was a second
            door to the same room. Add to Home Screen left too: the installed
            shell lags the site while features ship this fast. */}
        <h3 className="setgroup-h">The beta</h3>
        <div className="settingslist">
          {/* Beta users bring the next beta users in. */}
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

        {isAdmin && (
          <>
            <h3 className="setgroup-h">Admin</h3>
            <div className="settingslist">
              <a className="setrow" href="/admin">
                <span className="setrow-ic"><Icon name="admin_panel_settings" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Admin</span>
                  <span className="s">Coaches, studios, sign-in links</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </a>
              <a className="setrow" href="/brand">
                <span className="setrow-ic"><Icon name="palette" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Brand</span>
                  <span className="s">The mark, colour, type and voice</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </a>
              <a className="setrow" href="/ethos">
                <span className="setrow-ic"><Icon name="favorite" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Ethos</span>
                  <span className="s">The laws, and the lines we don&rsquo;t cross</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </a>
            </div>
          </>
        )}

        <button className="calcopy" onClick={copyCal}>
          Apple or Outlook? Copy your calendar feed link
        </button>
        <form action={logout}>
          <button type="submit" className="logoutbtn">
            Log out
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
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={goBack}>
              <Icon name="close" size={16} />
            </button>
            <h2>{viewTitle}</h2>

          {view === "security" && (
            <div className="secblock">
              <div className="secrow">
                <span className="secrow-ic"><Icon name="mail" size={22} /></span>
                <span className="secrow-txt">
                  <span className="t">Email</span>
                  <span className="s">{emailShown}</span>
                </span>
                <button
                  className="secbtn"
                  onClick={() => { setNewEmail(emailShown); setCurPw(""); setEmailSheet(true); }}
                >
                  Change
                </button>
              </div>
              <div className="secrow">
                <span className="secrow-ic"><Icon name="lock" size={22} /></span>
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
                  <span className="secrow-ic"><Icon name="fingerprint" size={22} /></span>
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
                      {on && <Icon name="check" size={18} />}
                    </button>
                  );
                })}
              </div>
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
                  <span className="ig"><Icon name="event_available" size={22} /></span>
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

      {emailSheet && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setEmailSheet(false); }}>
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setEmailSheet(false)}>
              <Icon name="close" size={16} />
            </button>
            <h2>Change email</h2>
            <p className="lead">This is the email you sign in with.</p>
            <input className="editinput" type="email" autoCapitalize="none" placeholder="New email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            {pwSet && (
              <input className="editinput" style={{ marginTop: 10 }} type="password" autoComplete="current-password" placeholder="Current password" value={curPw} onChange={(e) => setCurPw(e.target.value)} />
            )}
            <div className="publishwrap">
              <button className="btn si" onClick={saveEmail} disabled={busy}>
                {busy ? "Saving…" : "Save email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pwSheet && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setPwSheet(false); }}>
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setPwSheet(false)}>
              <Icon name="close" size={16} />
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

      <ShareWeekSheet
        handle={handle}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onToast={toast}
      />

      <QrSheet
        handle={handle}
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        onToast={toast}
        onCard={() => {
          setQrOpen(false);
          setCardOpen(true);
        }}
      />
      {cardOpen && (
        <ShareCardSheet handle={handle} onClose={() => setCardOpen(false)} onToast={toast} />
      )}
      {inviteOpen && (
        <InviteSheet
          onClose={() => setInviteOpen(false)}
          onCopied={() => toast("Link copied, ready to paste")}
        />
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
