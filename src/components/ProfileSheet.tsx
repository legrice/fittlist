"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
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
import { Toast, useToast } from "@/components/Toast";

type View = "home" | "security" | "contact" | "gcal";

// The trainer's account page. Home shows the profile tile, the two feature
// cards, and a settings list. Each settings row opens a sub-view that slides in
// from the right; its back arrow slides it out to reveal the home view again.
export function ProfileSheet({
  handle,
  anim = "up",
  name,
  title,
  photo,
  visits,
  subsCount,
  classCount,
  email,
  instagram,
  website,
  contactEmail,
  phone,
  whatsapp,
  about,
  googleConfigured,
  googleConnected,
  googleEmail,
  hasPassword,
  passkeyCount,
  onClose,
}: {
  handle: string;
  anim?: "up" | "left" | "none";
  name: string;
  title: string;
  photo: string | null;
  visits: number;
  subsCount: number;
  classCount: number;
  email: string;
  instagram: string;
  website: string;
  contactEmail: string;
  phone: string;
  whatsapp: string;
  about: string;
  googleConfigured: boolean;
  googleConnected: boolean;
  googleEmail: string | null;
  hasPassword: boolean;
  passkeyCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [toastMsg, toastOn, toast] = useToast();
  const [view, setView] = useState<View>("home");
  const [leaving, setLeaving] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareSpan, setShareSpan] = useState<"week" | "day">("week");
  const [storyThemeId, setStoryThemeId] = useState<StoryThemeId>("iron");
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [sharing, setSharing] = useState(false);
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

  useEffect(() => {
    setPasskeyable(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);
  useEffect(() => {
    setWebcalUrl(`webcal://${window.location.host}/api/cal/${handle}`);
  }, [handle]);
  useEffect(() => {
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function",
    );
  }, []);

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

  const storyUrl = `/api/story/${handle}?span=${shareSpan}&theme=${storyThemeId}`;
  const storyFileName = `fittlist-${handle}-${shareSpan}-${storyThemeId}.png`;

  const shareStory = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (canShareFiles) {
        const res = await fetch(storyUrl);
        if (res.ok) {
          const file = new File([await res.blob()], storyFileName, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
            return;
          }
        }
      }
      const a = document.createElement("a");
      a.href = storyUrl;
      a.download = storyFileName;
      a.click();
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") toast("Couldn't share the image");
    } finally {
      setSharing(false);
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

  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  const firstName = name.trim().split(/\s+/)[0] || name;
  const viewTitle =
    view === "security" ? "Login & security" : view === "contact" ? "Contact info" : "Google Calendar";

  return (
    <>
      <div
        className={`acctwrap${anim === "left" ? " acct-from-left" : ""}${anim === "none" ? " acct-noanim" : ""}`}
        role="dialog"
        aria-label="Your account"
      >
        <div className="accttop">
          <h1 className="acct-h">Profile</h1>
          <button className="iconbtn acctclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="accttile">
          <button className="acctid" onClick={goProfile} aria-label="Open your profile">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="acctavatar" src={photo} alt="" />
            ) : (
              <span className="acctavatar acctavatar-empty" aria-hidden="true">
                {initial}
              </span>
            )}
            <span className="acctname">{firstName}</span>
            {title ? <span className="accttitle-sub">{title}</span> : null}
          </button>
          <div className="acctstats">
            <div className="acctstat">
              <span className="n">{visits}</span>
              <span className="l">Visits</span>
            </div>
            <div className="acctstat">
              <span className="n">{subsCount}</span>
              <span className="l">On your list</span>
            </div>
            <div className="acctstat">
              <span className="n">{classCount}</span>
              <span className="l">Classes</span>
            </div>
          </div>
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
        </div>

        <div className="settingslist">
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

      {shareOpen && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setShareOpen(false); }}>
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setShareOpen(false)}>
              <Icon name="close" size={16} />
            </button>
            <h2>Your story image</h2>
            <div className="share-toggles">
              <div className="seg">
                <button className={shareSpan === "week" ? "sel" : ""} onClick={() => setShareSpan("week")}>My week</button>
                <button className={shareSpan === "day" ? "sel" : ""} onClick={() => setShareSpan("day")}>Today</button>
              </div>
            </div>
            <div className="chips" style={{ justifyContent: "center" }}>
              {(Object.entries(STORY_THEMES) as [StoryThemeId, (typeof STORY_THEMES)["iron"]][]).map(([id, t]) => (
                <button key={id} className={`chip themechip${storyThemeId === id ? " sel" : ""}`} onClick={() => setStoryThemeId(id)}>
                  <span className="swd" style={{ background: t.bg, borderColor: t.accent }} />
                  {t.label}
                </button>
              ))}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="storyimg" src={storyUrl} alt={`Story image of ${shareSpan === "week" ? "this week's" : "today's"} classes`} />
            <div className="publishwrap">
              {canShareFiles ? (
                <button className="btn" disabled={sharing} onClick={shareStory}>{sharing ? "Opening…" : "Save image"}</button>
              ) : (
                <a className="btn" href={storyUrl} download={storyFileName}>Save image</a>
              )}
              <button className="btn ghost" style={{ marginTop: 8 }} disabled={sharing} onClick={shareStory}>Share image</button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
