"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function",
    );
  }, []);

  if (!open) return null;

  const storyUrl = `/api/story/${handle}?span=${span}&theme=${themeId}`;
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
