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
import { MessagesToggle } from "@/components/MessagesToggle";
import { InstallApp } from "@/components/InstallApp";
import { InviteFriends } from "@/components/InviteFriends";
import { ChangeHandle } from "@/components/ChangeHandle";
import { QrSheet } from "@/components/QrSheet";
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
  avatarColor,
  showFanView = false,
  discoverable = true,
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
  /** The coach's own palette colour, so a photo-less avatar reads as theirs. */
  avatarColor: string;
  showFanView?: boolean;
  discoverable?: boolean;
  messagesOpen?: boolean;
  look: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [toastMsg, toastOn, toast] = useToast();
  const [view, setView] = useState<View>("home");
  const [leaving, setLeaving] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
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

  const openView = (v: View) => {
    setLeaving(false);
    setView(v);
  };
  const goBack = () => {
    setLeaving(true);
    setTimeout(() => {
      setView("home");
      setLeaving(false);
    }, 230);
  };

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
            <span className="acctcard-ic"><Icon name="share" size={26} /></span>
            <span className="acctcard-t">Share your week</span>
            <span className="acctcard-s">A story image with your link</span>
          </button>
          <button className="acctcard acctcard-wide" onClick={() => setQrOpen(true)}>
            <span className="acctcard-ic"><Icon name="qr_code_2" size={26} /></span>
            <span className="acctcard-txt">
              <span className="acctcard-t">Your QR code</span>
              <span className="acctcard-s">A scannable code that opens your page</span>
            </span>
          </button>
        </div>

        <div className="settingslist">
          {/* The door people will look for. A request is inbound work, so it
              sits at the top of the list rather than under the account plumbing. */}
          <a className="setrow" href="/requests">
            <span className="setrow-ic"><Icon name="send" size={22} /></span>
            <span className="setrow-txt">
              <span className="t">Requests</span>
              <span className="s">
                {requestCount === 0
                  ? "Nobody has asked about private sessions yet"
                  : `${requestCount} ${requestCount === 1 ? "person" : "people"}, with how to reach them`}
              </span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
          </a>
          <button className="setrow" onClick={() => openView("security")}>
            <span className="setrow-ic"><Icon name="lock" size={22} /></span>
            <span className="setrow-txt">
              <span className="t">Login &amp; security</span>
              <span className="s">Email, password, and passkeys</span>
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
          {/* Out of Edit profile and up here: the state of your books changes
              far more often than your bio, and it decides whether anyone can
              ask you at all. The row says where it stands without opening. */}
          <ChangeHandle />
          {/* Quiet, and quietly reachable: the only place a block is visible. */}
          <a className="setrow" href="/blocked">
            <span className="setrow-ic"><Icon name="public_off" size={22} /></span>
            <span className="setrow-txt">
              <span className="t">Removed people</span>
              <span className="s">Who can&rsquo;t see your page</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
          </a>
          <button className="setrow" onClick={() => openView("availability")}>
            <span className="setrow-ic"><Icon name="event_available" size={22} /></span>
            <span className="setrow-txt">
              <span className="t">Availability</span>
              <span className="s">{availLabel}</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
          </button>
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
          {/* "Your week" and "Share classes you're attending" used to live here.
              The Following tab already is your week, so the row was a second
              door to the same room, and sharing what you're going to is a
              member's move — a coach's share is their own schedule. */}
          {/* A coach follows people too: their own week plus everyone else's. */}
          {/* MyCalendar (the followed-classes feed) is hidden for now: the
              subscribe flow isn't good enough yet. The /api/cal/me endpoint
              stays live so anyone already subscribed keeps updating. */}
          {/* Beta users bring the next beta users in. */}
          <InviteFriends />
          <InstallApp />
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
          {isAdmin && (
            <a className="setrow" href="/admin">
              <span className="setrow-ic"><Icon name="admin_panel_settings" size={22} /></span>
              <span className="setrow-txt">
                <span className="t">Admin</span>
                <span className="s">Coaches, studios, sign-in links</span>
              </span>
              <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
            </a>
          )}
          {isAdmin && (
            <a className="setrow" href="/brand">
              <span className="setrow-ic"><Icon name="palette" size={22} /></span>
              <span className="setrow-txt">
                <span className="t">Brand</span>
                <span className="s">The mark, colour, type and voice</span>
              </span>
              <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
            </a>
          )}
        </div>

        {/* Page look: themes the app and the coach's public page. */}
        <div className="settingslist">
          <MessagesToggle initialOn={messagesOpen} />
          {showFanView && <DiscoverableToggle initialOn={discoverable} />}
          <DarkModeToggle initialOn={look === "dark"} />
        </div>

        <button className="calcopy" onClick={copyCal}>
          Apple or Outlook? Copy your calendar feed link
        </button>
        <form action={logout}>
          <button type="submit" className="logoutbtn">
            Log out
          </button>
        </form>
      </div>

      {view !== "home" && (
        <div
          className={`acctwrap settingspane${leaving ? " exit-right" : " from-right"}`}
          role="dialog"
          aria-label={viewTitle}
        >
          <div className="accttop settingstop">
            <button className="iconbtn acctclose" aria-label="Back" onClick={goBack}>
              <Icon name="arrow_back" size={18} />
            </button>
            <h1 className="acct-h settings-h">{viewTitle}</h1>
          </div>

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
              <p className="settings-lead">
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
              <p className="settings-lead">
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
              <p className="settings-lead">
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

      <QrSheet handle={handle} open={qrOpen} onClose={() => setQrOpen(false)} onToast={toast} />


      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
