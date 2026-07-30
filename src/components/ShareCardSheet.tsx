"use client";

import { useEffect, useState } from "react";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import { Icon } from "@/components/Icon";

// The profile card sheet: a square Instagram image about the person, not
// their week. Pick a style, save or share. The story image has the schedule;
// this one is the introduction.
export function ShareCardSheet({
  handle,
  onClose,
  onToast,
}: {
  handle: string;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  // Ink by default: the card leads with a photo, and photos sit best on dark.
  const [themeId, setThemeId] = useState<StoryThemeId>("iron");
  const [styleOpen, setStyleOpen] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [sharing, setSharing] = useState(false);
  // A fresh cache-buster per open; see ShareWeekSheet.
  const [bust] = useState(() => Date.now());

  useEffect(() => {
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function",
    );
  }, []);

  const cardUrl = `/api/card/${handle}?theme=${themeId}&v=${bust}-${themeId}`;
  const cardFileName = `fittlist-${handle}-card.png`;

  const shareCard = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (canShareFiles) {
        const res = await fetch(cardUrl);
        if (res.ok) {
          const file = new File([await res.blob()], cardFileName, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
            return;
          }
        }
      }
      const a = document.createElement("a");
      a.href = cardUrl;
      a.download = cardFileName;
      a.click();
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") onToast("Couldn't share the image");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet sheet-full">
        <div className="adderhead">
          <h2>Share your card</h2>
          <button className="iconbtn sheetclose adderclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <p className="lead" style={{ marginTop: 0 }}>
          A square image of your profile, made for a post or a story. Your page is one tap from
          the link on it.
        </p>
        <div className="storycustom">
          <label className="flabel" htmlFor="cardTheme">
            Style <span>· colours for your card</span>
          </label>
          <div className="stylepick">
            <button
              id="cardTheme"
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
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="cardimg" src={cardUrl} alt="Your profile card" />
        <div className="publishwrap">
          {canShareFiles ? (
            <button className="btn" disabled={sharing} onClick={shareCard}>
              {sharing ? "Opening…" : "Save image"}
            </button>
          ) : (
            <a className="btn" href={cardUrl} download={cardFileName}>
              Save image
            </a>
          )}
          <button className="btn ghost" style={{ marginTop: 8 }} disabled={sharing} onClick={shareCard}>
            Share image
          </button>
        </div>
      </div>
    </div>
  );
}
