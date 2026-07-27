"use client";

import { useEffect, useState } from "react";
import { getStoryPrefs, setStoryPrefs } from "@/app/actions/profile";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import { Icon } from "@/components/Icon";

// The member's "come train with me" image: the classes they marked Going,
// across every coach and studio. Same pipeline and themes as the coach's share
// sheet, different subject.
export function ShareMyWeekSheet({ onClose }: { onClose: () => void }) {
  const [themeId, setThemeId] = useState<StoryThemeId>("paper");
  const [styleOpen, setStyleOpen] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [err, setErr] = useState("");
  const [bust, setBust] = useState(0);

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

  useEffect(() => {
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function",
    );
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

  const storyUrl = `/api/story/me?theme=${themeId}&v=${bust}`;
  const storyFileName = `fittlist-my-week-${themeId}.png`;

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
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setErr("Couldn't share the image");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet sheet-full">
        <div className="adderhead">
          <h2>Share my week</h2>
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
          <label className="flabel" htmlFor="myHeadline">
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="storyimg" src={storyUrl} alt="Story image of the classes I'm going to this week" />
        {err && <p className="err">{err}</p>}
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
          <button className="btn ghost" style={{ marginTop: 8 }} disabled={sharing} onClick={shareStory}>
            Share image
          </button>
        </div>
      </div>
    </div>
  );
}
