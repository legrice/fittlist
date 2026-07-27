"use client";

import { useEffect, useState } from "react";
import { getStoryPrefs, setStoryPrefs } from "@/app/actions/profile";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import { Icon } from "@/components/Icon";

// The "Share your week" bottom sheet: a story image of the coach's schedule
// (week or today) in a pickable on-brand theme, saved or shared via the native
// sheet. Controlled by `open`; renders nothing when closed.
export function ShareWeekSheet({
  handle,
  open,
  onClose,
  onToast,
}: {
  handle: string;
  open: boolean;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const [span, setSpan] = useState<"week" | "day">("week");
  const [themeId, setThemeId] = useState<StoryThemeId>("paper");
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [sharing, setSharing] = useState(false);
  // A fresh cache-buster per open: CDNs and phones hold story PNGs cached
  // under the old year-long header, so the bare URL can serve a stale image.
  // A new query param gives every open a clean cache key.
  const [bust, setBust] = useState(0);

  // Customisation: the coach's headline + photo chip, persisted on their
  // account so every week's image carries their look.
  const [headline, setHeadline] = useState("");
  const [showPhoto, setShowPhoto] = useState(true);
  const [hasPhoto, setHasPhoto] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBust(Date.now());
    getStoryPrefs().then((p) => {
      setHeadline(p.headline);
      setShowPhoto(p.showPhoto);
      setHasPhoto(p.hasPhoto);
    });
  }, [open]);

  const applyHeadline = async () => {
    await setStoryPrefs({ headline });
    setBust(Date.now()); // re-render the preview with the new text
  };
  const togglePhoto = async () => {
    const v = !showPhoto;
    setShowPhoto(v);
    await setStoryPrefs({ showPhoto: v });
    setBust(Date.now());
  };

  useEffect(() => {
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function",
    );
  }, []);

  if (!open) return null;

  const storyUrl = `/api/story/${handle}?span=${span}&theme=${themeId}&v=${bust}`;
  const storyFileName = `fittlist-${handle}-${span}-${themeId}.png`;

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
      if ((err as Error)?.name !== "AbortError") onToast("Couldn't share the image");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
        <h2>Share your week</h2>
        <div className="share-toggles">
          <div className="seg">
            <button className={span === "week" ? "sel" : ""} onClick={() => setSpan("week")}>My week</button>
            <button className={span === "day" ? "sel" : ""} onClick={() => setSpan("day")}>Today</button>
          </div>
        </div>
        <div className="chips" style={{ justifyContent: "center" }}>
          {(Object.entries(STORY_THEMES) as [StoryThemeId, (typeof STORY_THEMES)["paper"]][]).map(([id, t]) => (
            <button key={id} className={`chip themechip${themeId === id ? " sel" : ""}`} onClick={() => setThemeId(id)}>
              <span className="swd" style={{ background: t.bg, borderColor: t.accent }} />
              {t.label}
            </button>
          ))}
        </div>
        <div className="storycustom">
          <input
            className="editinput"
            type="text"
            maxLength={28}
            placeholder="Train with me."
            aria-label="Headline"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            onBlur={applyHeadline}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
          {hasPhoto && (
            <button className="storyphoto" onClick={togglePhoto} aria-pressed={showPhoto}>
              <span>Show my photo</span>
              <span className={`switch${showPhoto ? " on" : ""}`} aria-hidden="true">
                <span className="switch-knob" />
              </span>
            </button>
          )}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="storyimg" src={storyUrl} alt={`Story image of ${span === "week" ? "this week's" : "today's"} classes`} />
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
  );
}
