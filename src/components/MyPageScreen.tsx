"use client";

import { useEffect, useState } from "react";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { Wordmark } from "@/components/Wordmark";

export function MyPageScreen({
  handle,
  visits,
  subsCount,
  classCount,
}: {
  handle: string;
  visits: number;
  subsCount: number;
  classCount: number;
}) {
  const [toastMsg, toastOn, toast] = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSpan, setShareSpan] = useState<"week" | "day">("week");
  const [storyThemeId, setStoryThemeId] = useState<StoryThemeId>("iron");
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [sharing, setSharing] = useState(false);
  const url = `fittlist.co/${handle}`;
  const storyUrl = `/api/story/${handle}?span=${shareSpan}&theme=${storyThemeId}`;
  const storyFileName = `fittlist-${handle}-${shareSpan}-${storyThemeId}.png`;

  // File-sharing support (the native share sheet is the only route into
  // the iOS photo library from the web) is detectable only client-side.
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

  // Opens the native share sheet with the PNG attached. On iPhone,
  // "Save Image" there writes it to Photos; it's also the path to an
  // Instagram story. Fallback: plain download.
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

  const copy = async () => {
    // Copy the real deployed origin — before the fittlist.co domain is
    // attached, a hardcoded https://fittlist.co link would be dead.
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${handle}`);
      toast("Link copied");
    } catch {
      toast(url);
    }
  };

  return (
    <section className="screen">
      <div className="appbar">
        <Wordmark />
        <div className="sub">My page</div>
      </div>
      <div className="pad" style={{ paddingTop: 24, paddingBottom: 110 }}>
        <h1 className="ps-h2">My page</h1>
        <div className="statgrid">
          <div className="stat">
            <div className="n">{visits}</div>
            <div className="l">visits</div>
            <div className="d">{visits ? "this week" : ""}</div>
          </div>
          <div className="stat">
            <div className="n">{subsCount}</div>
            <div className="l">on your list</div>
            <div className="d">{subsCount ? "get emails" : ""}</div>
          </div>
          <div className="stat">
            <div className="n">{classCount}</div>
            <div className="l">classes</div>
            <div className="d"></div>
          </div>
        </div>
        <div className="linkcard">
          <div className="eyebrow">Your link</div>
          <div className="url">{url}</div>
          <button className="btn si" onClick={copy}>
            Copy link
          </button>
          <div className="hint">
            {classCount
              ? `${subsCount || "No"} ${subsCount === 1 ? "person" : "people"} on your list so far. Every schedule change emails them automatically.`
              : "Your link shows an empty week until you add a class. Drop it in your bio anyway — it never goes stale."}
          </div>
        </div>
        <a className="rowcta" href={`/${handle}`} target="_blank" rel="noopener">
          <span className="ig"><Icon name="visibility" size={22} /></span>
          <span>
            <span className="t">Preview your page</span>
            <br />
            <span className="s">Exactly what someone sees when they tap your bio</span>
          </span>
        </a>
        <button className="rowcta" onClick={() => setShareOpen(true)}>
          <span className="ig"><Icon name="share" size={22} /></span>
          <span>
            <span className="t">Share your week</span>
            <br />
            <span className="s">A story image with your link on it</span>
          </span>
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
                    <span
                      className="swd"
                      style={{ background: t.bg, borderColor: t.accent }}
                    />
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
    </section>
  );
}
