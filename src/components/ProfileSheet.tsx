"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import { disconnectGoogleAction } from "@/app/actions/google";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The trainer's account page — a full-screen view reached from the header
// avatar. Top tile: avatar + name + title with the three stats beside it;
// below, cards to preview the public profile and share the week image.
export function ProfileSheet({
  handle,
  name,
  title,
  photo,
  visits,
  subsCount,
  classCount,
  googleConfigured,
  googleConnected,
  googleEmail,
  onClose,
}: {
  handle: string;
  name: string;
  title: string;
  photo: string | null;
  visits: number;
  subsCount: number;
  classCount: number;
  googleConfigured: boolean;
  googleConnected: boolean;
  googleEmail: string | null;
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

  return (
    <>
      <div className="acctwrap" role="dialog" aria-label="Your account">
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
            <span className="acctname">{name}</span>
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

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
