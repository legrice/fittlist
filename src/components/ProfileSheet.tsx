"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import {
  beginPasskeyRegistration,
  finishPasskeyRegistration,
  logout,
  setPassword as setPasswordAction,
} from "@/app/actions/auth";
import { disconnectGoogleAction } from "@/app/actions/google";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The trainer's account page - a full-screen view reached from the header
// avatar. Top tile: avatar + name + title with the three stats beside it;
// below, cards to preview the public profile and share the week image.
export function ProfileSheet({
  handle,
  anim = "up",
  name,
  title,
  photo,
  visits,
  subsCount,
  classCount,
  googleConfigured,
  googleConnected,
  googleEmail,
  hasPassword,
  passkeyCount,
  onClose,
}: {
  handle: string;
  anim?: "up" | "left";
  name: string;
  title: string;
  photo: string | null;
  visits: number;
  subsCount: number;
  classCount: number;
  googleConfigured: boolean;
  googleConnected: boolean;
  googleEmail: string | null;
  hasPassword: boolean;
  passkeyCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [toastMsg, toastOn, toast] = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSpan, setShareSpan] = useState<"week" | "day">("week");
  const [storyThemeId, setStoryThemeId] = useState<StoryThemeId>("iron");
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [webcalUrl, setWebcalUrl] = useState("");
  const [connected, setConnected] = useState(googleConnected);
  const [disconnecting, startDisconnect] = useTransition();
  // Security section: passkeys + password, both mutable in place.
  const [pkCount, setPkCount] = useState(passkeyCount);
  const [pwSet, setPwSet] = useState(hasPassword);
  const [secBusy, setSecBusy] = useState(false);
  const [passkeyable, setPasskeyable] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwValue, setPwValue] = useState("");

  useEffect(() => {
    setPasskeyable(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);

  const addPasskey = async () => {
    if (secBusy) return;
    setSecBusy(true);
    try {
      const res = await beginPasskeyRegistration();
      if (!res.ok) {
        toast(res.error);
        return;
      }
      const reg = await startRegistration({ optionsJSON: res.options });
      const fin = await finishPasskeyRegistration(reg, "Passkey");
      if (fin.ok) {
        setPkCount((n) => n + 1);
        toast("Passkey added");
      } else {
        toast(fin.error ?? "Couldn't add that passkey");
      }
    } catch (err) {
      const nm = (err as Error)?.name;
      if (nm !== "AbortError" && nm !== "NotAllowedError") toast("Couldn't add that passkey");
    } finally {
      setSecBusy(false);
    }
  };

  const savePassword = async () => {
    if (secBusy || !pwValue) return;
    setSecBusy(true);
    try {
      const res = await setPasswordAction(pwValue);
      if (res.ok) {
        setPwSet(true);
        setPwOpen(false);
        setPwValue("");
        toast("Password saved");
      } else {
        toast(res.error ?? "Couldn't save that password");
      }
    } finally {
      setSecBusy(false);
    }
  };

  // Tapping the avatar (or the preview card) opens the public profile page,
  // where the owner gets a back arrow and an Edit button.
  const goProfile = () => router.push(`/${handle}`);

  // The subscribe feed lives at /api/cal/{handle}; build the URL once mounted.
  useEffect(() => {
    setWebcalUrl(`webcal://${window.location.host}/api/cal/${handle}`);
  }, [handle]);

  const disconnectGcal = () =>
    startDisconnect(async () => {
      await disconnectGoogleAction();
      setConnected(false);
      toast("Google Calendar disconnected");
    });

  const storyUrl = `/api/story/${handle}?span=${shareSpan}&theme=${storyThemeId}`;
  const storyFileName = `fittlist-${handle}-${shareSpan}-${storyThemeId}.png`;

  useEffect(() => {
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function",
    );
  }, []);

  const fetchStoryFile = async () => {
    const res = await fetch(storyUrl);
    if (!res.ok) throw new Error("story fetch failed");
    const blob = await res.blob();
    return new File([blob], storyFileName, { type: "image/png" });
  };

  const shareStory = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (canShareFiles) {
        const file = await fetchStoryFile();
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
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

  return (
    <>
      <div
        className={`acctwrap${anim === "left" ? " acct-from-left" : ""}`}
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

        <div className="secblock">
          <h2 className="sec-h">Sign-in</h2>
          {passkeyable && (
            <div className="secrow">
              <span className="secrow-ic"><Icon name="fingerprint" size={22} /></span>
              <span className="secrow-txt">
                <span className="t">Face ID / passkey</span>
                <span className="s">
                  {pkCount > 0
                    ? `${pkCount} passkey${pkCount > 1 ? "s" : ""} on this account`
                    : "Sign in with your face or fingerprint"}
                </span>
              </span>
              <button className="secbtn" onClick={addPasskey} disabled={secBusy}>
                {pkCount > 0 ? "Add another" : "Add"}
              </button>
            </div>
          )}
          <div className="secrow">
            <span className="secrow-ic"><Icon name="lock" size={22} /></span>
            <span className="secrow-txt">
              <span className="t">Password</span>
              <span className="s">{pwSet ? "A password is set" : "No password yet"}</span>
            </span>
            <button className="secbtn" onClick={() => setPwOpen(true)} disabled={secBusy}>
              {pwSet ? "Change" : "Set"}
            </button>
          </div>
        </div>

        {googleConfigured &&
          (connected ? (
            <div className="rowcta gcal-on">
              <span className="ig"><Icon name="event_available" size={22} /></span>
              <span>
                <span className="t">Google Calendar connected</span>
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
            <a className="rowcta" href="/api/google/connect">
              <span className="ig"><Icon name="event" size={22} /></span>
              <span>
                <span className="t">Connect Google Calendar</span>
                <br />
                <span className="s">Auto-sync your classes into your calendar</span>
              </span>
            </a>
          ))}
        <button className="calcopy" onClick={copyCal}>
          Apple or Outlook? Copy your calendar feed link
        </button>
        <form action={logout}>
          <button type="submit" className="logoutbtn">
            Log out
          </button>
        </form>
      </div>

      {shareOpen && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShareOpen(false);
          }}
        >
          <div className="sheet">
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setShareOpen(false)}
            >
              <Icon name="close" size={16} />
            </button>
            <h2>Your story image</h2>
            <div className="share-toggles">
              <div className="seg">
                <button
                  className={shareSpan === "week" ? "sel" : ""}
                  onClick={() => setShareSpan("week")}
                >
                  My week
                </button>
                <button
                  className={shareSpan === "day" ? "sel" : ""}
                  onClick={() => setShareSpan("day")}
                >
                  Today
                </button>
              </div>
            </div>
            <div className="chips" style={{ justifyContent: "center" }}>
              {(Object.entries(STORY_THEMES) as [StoryThemeId, (typeof STORY_THEMES)["iron"]][]).map(
                ([id, t]) => (
                  <button
                    key={id}
                    className={`chip themechip${storyThemeId === id ? " sel" : ""}`}
                    onClick={() => setStoryThemeId(id)}
                  >
                    <span className="swd" style={{ background: t.bg, borderColor: t.accent }} />
                    {t.label}
                  </button>
                ),
              )}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="storyimg"
              src={storyUrl}
              alt={`Story image of ${shareSpan === "week" ? "this week's" : "today's"} classes`}
            />
            <div className="publishwrap">
              {canShareFiles ? (
                <button className="btn" disabled={sharing} onClick={shareStory}>
                  {sharing ? "Opening…" : "Save image"}
                </button>
              ) : (
                <a className="btn" href={storyUrl} download={storyFileName}>
                  Save image
                </a>
              )}
              <button
                className="btn ghost"
                style={{ marginTop: 8 }}
                disabled={sharing}
                onClick={shareStory}
              >
                Share image
              </button>
            </div>
          </div>
        </div>
      )}

      {pwOpen && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPwOpen(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setPwOpen(false)}>
              <Icon name="close" size={16} />
            </button>
            <h2>{pwSet ? "Change password" : "Set a password"}</h2>
            <p className="lead">At least 8 characters. You can still use a magic link or passkey.</p>
            <input
              className="editinput"
              type="password"
              autoComplete="new-password"
              placeholder="New password"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && savePassword()}
            />
            <div className="publishwrap">
              <button className="btn si" onClick={savePassword} disabled={secBusy || pwValue.length < 8}>
                {secBusy ? "Saving…" : "Save password"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
