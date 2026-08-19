"use client";

import { useEffect, useState } from "react";
import { getStoryPrefs, setStoryPrefs } from "@/app/actions/profile";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { putImage } from "@/lib/shareimage";
import { StoryPreview } from "@/components/StoryPreview";
import { recordShareImageExport } from "@/app/actions/product-activity";

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
  const [styleOpen, setStyleOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // A fresh cache-buster per open: CDNs and phones hold story PNGs cached
  // under the old year-long header, so the bare URL can serve a stale image.
  // A new query param gives every open a clean cache key.
  const [bust, setBust] = useState(0);

  // Customisation: the coach's headline, persisted on their account so
  // every week's image carries their voice.
  const [headline, setHeadline] = useState("");

  useEffect(() => {
    if (!open) return;
    setBust(Date.now());
    getStoryPrefs().then((p) => {
      setHeadline(p.headline);
    });
  }, [open]);

  const applyHeadline = async () => {
    await setStoryPrefs({ headline });
    setBust(Date.now()); // re-render the preview with the new text
  };
  if (!open) return null;

  const storyUrl = `/api/story/${handle}?span=${span}&theme=${themeId}&photo=0&v=${bust}`;
  const storyFileName = `fittlist-${handle}-${span}-${themeId}.png`;

  // The system sheet, which is where Save Image lives too: one button,
  // because a second one opening the same sheet was the same act twice.
  const share = async () => {
    if (busy) return;
    setBusy(true);
    if (!(await putImage(storyUrl, storyFileName))) onToast("Couldn't share the image");
    else void recordShareImageExport();
    setBusy(false);
  };

  return (
    <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet sheet-full">
        <div className="adderhead">
          <h2>Share your schedule</h2>
          <button className="iconbtn sheetclose adderclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="share-toggles">
          <div className="seg">
            <button className={span === "week" ? "sel" : ""} onClick={() => setSpan("week")}>My week</button>
            <button className={span === "day" ? "sel" : ""} onClick={() => setSpan("day")}>Today</button>
          </div>
        </div>
        <div className="storycustom">
          <label className="flabel" htmlFor="stTheme">
            Style <span>· colors for your image</span>
          </label>
          <div className="stylepick">
            <button
              id="stTheme"
              className="stylepick-btn"
              aria-haspopup="listbox"
              aria-expanded={styleOpen}
              onClick={() => setStyleOpen((v) => !v)}
            >
              <span
                className="swd"
                style={{ background: STORY_THEMES[themeId].bg, borderColor: STORY_THEMES[themeId].accent }}
              />
              <span className="stylepick-lbl">{STORY_THEMES[themeId].label}</span>
              <Icon name="expand_more" size={20} />
            </button>
            {styleOpen && (
              <div className="stylepick-menu" role="listbox" aria-label="Style">
                {(Object.entries(STORY_THEMES) as [StoryThemeId, (typeof STORY_THEMES)["paper"]][]).map(
                  ([id, t]) => (
                    <button
                      key={id}
                      role="option"
                      aria-selected={id === themeId}
                      className={`stylepick-row${id === themeId ? " sel" : ""}`}
                      onClick={() => {
                        setThemeId(id);
                        setStyleOpen(false);
                      }}
                    >
                      <span className="swd" style={{ background: t.bg, borderColor: t.accent }} />
                      <span className="stylepick-lbl">{t.label}</span>
                      {id === themeId && <Icon name="check" size={18} />}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
          <label className="flabel" htmlFor="stHeadline">
            Headline <span>· the big text at the top</span>
          </label>
          <input
            id="stHeadline"
            className="editinput"
            type="text"
            maxLength={28}
            placeholder="Train with me."
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            onBlur={applyHeadline}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </div>
        <StoryPreview
          src={storyUrl}
          alt={`Story image of ${span === "week" ? "this week's" : "today's"} classes`}
          bg={STORY_THEMES[themeId].bg}
        />
        <div className="publishwrap">
          <button className="btn" disabled={busy} onClick={share}>
            {busy ? "Opening…" : "Share image"}
          </button>
        </div>
      </div>
    </div>
  );
}
