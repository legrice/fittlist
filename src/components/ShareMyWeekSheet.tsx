"use client";

import { useEffect, useState } from "react";
import { getStoryPrefs, setStoryPrefs } from "@/app/actions/profile";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { putImage, type PutMode } from "@/lib/shareimage";
import { StoryPreview } from "@/components/StoryPreview";

// The member's "come train with me" image: the week they're actually going to,
// their own entries included. Same pipeline and themes as the coach's share
// sheet, different subject.
//
// It takes a range because a week is not always the week in front of you. The
// poster used to be the seven days from today, so somebody whose only class
// was nine days out shared a blank one and had no way to tell why. From is a
// date, and the length is one to seven days: a day, because "I'm at this
// tonight" is a real thing to post, and seven, because the canvas can't hold
// more and nobody plans further than that out loud.
export function ShareMyWeekSheet({
  onClose,
  firstIso,
}: {
  onClose: () => void;
  /** The first day their plans actually hold something. The range starts
   *  there, so the first thing they see is a poster with their week on it
   *  rather than an empty one they have to debug. */
  firstIso?: string;
}) {
  const [themeId, setThemeId] = useState<StoryThemeId>("paper");
  const [styleOpen, setStyleOpen] = useState(false);
  const [busy, setBusy] = useState<PutMode | null>(null);
  const [err, setErr] = useState("");
  const [bust, setBust] = useState(0);

  // Local, not UTC: `new Date().toISOString()` is tomorrow from 8pm Eastern,
  // which is the app's oldest bug and not one to reintroduce in a date field.
  const today = new Date().toLocaleDateString("en-CA");
  const [from, setFrom] = useState(firstIso && firstIso > today ? firstIso : today);
  const [span, setSpan] = useState(7);

  const [headline, setHeadline] = useState("");
  const [showPhoto, setShowPhoto] = useState(true);
  const [hasPhoto, setHasPhoto] = useState(false);

  useEffect(() => {
    setBust(Date.now());
    getStoryPrefs().then((p) => {
      setHeadline(p.headline);
      setShowPhoto(p.showPhoto);
      setHasPhoto(p.hasPhoto);
    });
  }, []);

  const applyHeadline = async () => {
    await setStoryPrefs({ headline });
    setBust(Date.now());
  };
  const togglePhoto = async () => {
    const v = !showPhoto;
    setShowPhoto(v);
    await setStoryPrefs({ showPhoto: v });
    setBust(Date.now());
  };

  const storyUrl = `/api/story/me?theme=${themeId}&from=${from}&days=${span}&v=${bust}`;
  const storyFileName = `fittlist-my-week-${themeId}.png`;

  // Share and Save both go through the system sheet on a phone: the camera
  // roll has no other door. See src/lib/shareimage.ts.
  const put = (mode: PutMode) => async () => {
    if (busy) return;
    setBusy(mode);
    const ok = await putImage(storyUrl, storyFileName, mode);
    if (!ok) setErr(mode === "share" ? "Couldn't share the image" : "Couldn't save the image");
    setBusy(null);
  };

  return (
    <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet sheet-full">
        <div className="adderhead">
          <h2>Share your plans</h2>
          <button className="iconbtn sheetclose adderclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="storycustom">
          <label className="flabel" htmlFor="myTheme">
            Style <span>· colours for your image</span>
          </label>
          <div className="stylepick">
            <button
              id="myTheme"
              className="stylepick-btn"
              aria-haspopup="listbox"
              aria-expanded={styleOpen}
              onClick={() => setStyleOpen((v) => !v)}
            >
              <span
                className="swd"
                style={{
                  background: STORY_THEMES[themeId].bg,
                  borderColor: STORY_THEMES[themeId].accent,
                }}
              />
              <span className="stylepick-lbl">{STORY_THEMES[themeId].label}</span>
              <Icon name="expand_more" size={18} />
            </button>
            {styleOpen && (
              <div className="stylepick-menu" role="listbox" aria-label="Style">
                {(
                  Object.entries(STORY_THEMES) as [StoryThemeId, (typeof STORY_THEMES)["paper"]][]
                ).map(([id, t]) => (
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
                ))}
              </div>
            )}
          </div>
          {/* One question about when, so one row: stacked, the two of them
              pushed the poster they describe off the bottom of the screen.
              Same two-column grid the class editor uses for start and end. */}
          <div className="timegrid two">
            <div>
              <label className="flabel" htmlFor="myFrom">
                From
              </label>
              <input
                id="myFrom"
                className="editinput"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value || today)}
              />
            </div>
            <div>
              <label className="flabel" htmlFor="mySpan">
                How long
              </label>
              <select
                id="mySpan"
                className="editinput"
                value={span}
                onChange={(e) => setSpan(Number(e.target.value))}
              >
                <option value={1}>1 day</option>
                <option value={2}>2 days</option>
                <option value={3}>3 days</option>
                <option value={4}>4 days</option>
                <option value={5}>5 days</option>
                <option value={6}>6 days</option>
                <option value={7}>7 days</option>
              </select>
            </div>
          </div>
          <label className="flabel" htmlFor="myHeadline" style={{ marginTop: 16 }}>
            Headline <span>· the big text at the top</span>
          </label>
          <input
            id="myHeadline"
            className="editinput"
            type="text"
            maxLength={28}
            placeholder="Come train with me."
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
          alt="Story image of the classes in my week"
          bg={STORY_THEMES[themeId].bg}
        />
        {err && <p className="err">{err}</p>}
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
