"use client";

import { useEffect, useState } from "react";
import { getStoryPrefs, setStoryPrefs } from "@/app/actions/profile";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { putImage, type PutMode } from "@/lib/shareimage";
import { StoryPreview } from "@/components/StoryPreview";

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
  const [busy, setBusy] = useState<PutMode | null>(null);
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

  if (!open) return null;

  const storyUrl = `/api/story/${handle}?span=${span}&theme=${themeId}&v=${bust}`;
  const storyFileName = `fittlist-${handle}-${span}-${themeId}.png`;

  // Share and Save both go through the system sheet on a phone: the camera
  // roll has no other door. See src/lib/shareimage.ts.
  const put = (mode: PutMode) => async () => {
    if (busy) return;
    setBusy(mode);
    const ok = await putImage(storyUrl, storyFileName, mode);
    if (!ok) onToast(mode === "share" ? "Couldn't share the image" : "Couldn't save the image");
    setBusy(null);
  };

  return (
    <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet sheet-full">
        <div className="adderhead">
          <h2>Share your schedule</h2>
          <button className="iconbtn sheetclose adderclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
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
            Style <span>· colours for your image</span>
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
              <Icon name="expand_more" size={18} />
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
                      {id === themeId && <Icon name="check" size={16} />}
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
          {hasPhoto && (
            <button className="storyphoto" onClick={togglePhoto} aria-pressed={showPhoto}>
              <span>Show my photo</span>
              <span className={`switch${showPhoto ? " on" : ""}`} aria-hidden="true">
                <span className="switch-knob" />
              </span>
            </button>
          )}
        </div>
        <StoryPreview
          src={storyUrl}
          alt={`Story image of ${span === "week" ? "this week's" : "today's"} classes`}
          bg={STORY_THEMES[themeId].bg}
        />
        {/* Share leads, save is the quiet one. See ShareComposer: the filled
            button used to say Save and open the share sheet. */}
        <div className="publishwrap row">
          <button className="btn" disabled={!!busy} onClick={put("share")}>
            {busy === "share" ? "Opening…" : "Share image"}
          </button>
          <button className="btn ghost" disabled={!!busy} onClick={put("save")}>
            {busy === "save" ? "Opening…" : "Save image"}
          </button>
        </div>
      </div>
    </div>
  );
}
