"use client";

import { useEffect, useState } from "react";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import { Icon } from "@/components/Icon";

// The card sheet: a square Instagram image, pick a style, save or share.
//
// One sheet, two subjects. It was the profile card's alone; a class card is
// the same sheet pointed at a different route, so it takes the path and the
// words rather than a handle. Two copies of a theme picker, a share-file
// dance and a download fallback would have drifted the first time one of them
// gained a style.
export function ShareCardSheet({
  path,
  fileName,
  title,
  lead,
  alt,
  onClose,
  onToast,
}: {
  /** The image route, without its query: "/api/card/matt". */
  path: string;
  fileName: string;
  title: string;
  lead: string;
  alt: string;
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

  const cardUrl = `${path}?theme=${themeId}&v=${bust}-${themeId}`;
  const cardFileName = fileName;

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
          <h2>{title}</h2>
          <button className="iconbtn sheetclose adderclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <p className="lead" style={{ marginTop: 0 }}>
          {lead}
        </p>
        <div className="storycustom">
          <label className="flabel" htmlFor="cardTheme">
            Style <span>· colors for the card</span>
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
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="cardimg" src={cardUrl} alt={alt} />
        {/* Share leads, save is the quiet one. See ShareComposer: the filled
            button used to say Save and open the share sheet. */}
        <div className="publishwrap">
          <button className="btn" disabled={sharing} onClick={shareCard}>
            {sharing ? "Opening…" : "Share image"}
          </button>
          <a className="btn ghost" style={{ marginTop: 8 }} href={cardUrl} download={cardFileName}>
            Save image
          </a>
        </div>
      </div>
    </div>
  );
}
