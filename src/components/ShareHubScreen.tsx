"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The Share tab's screen, on Matt's concept: one surface, three subjects.
// Week, Profile and QR code are segments rather than tiles, the title says
// which one you are on, the colours redraw the picture live, and the big
// button saves the thing on screen. Copy-week-as-text is gone by the same
// call, and the page link lives with the QR code, where somebody reaching
// for one way to hand the page over finds the other.
//
// Deliberately absent: the style row (Poster, Ticket, Grid, Minimal) from
// the concept. Ten layout styles shipped once and came out because the
// differences were not worth a decision; colour is what makes two posters
// read as two posters. The renderer still honours a StoryStyle, so a real
// style axis can return, but a row of thumbnails over one layout would be
// a picker of lies.
type Seg = "week" | "profile" | "qr";

const WORDS: Record<Seg, { title: string; sub: string }> = {
  week: { title: "Share the week", sub: "Straight to your story." },
  profile: { title: "Share your profile", sub: "Your card, wherever people ask for it." },
  qr: { title: "Your QR code", sub: "Hold it up after class. They land on your page." },
};

export function ShareHubScreen({
  coach,
  handle,
  name,
}: {
  /** A coach gets the Week segment; a member's page has no schedule to draw. */
  coach: boolean;
  handle: string;
  /** On the QR card, above the code: the code is a thing you hold up, and a
   *  bare code is anybody's. */
  name: string;
}) {
  const [seg, setSeg] = useState<Seg>(coach ? "week" : "profile");
  const [themeId, setThemeId] = useState<StoryThemeId>("paper");
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pageHost, setPageHost] = useState("fittlist.co");
  // One buster per visit: the week can change behind the picture, and a
  // cached preview of last Tuesday is a lie waiting to be posted.
  const [bust] = useState(() => Date.now());
  const [toastMsg, toastOn, toast] = useToast();

  useEffect(() => {
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function",
    );
    setPageHost(window.location.host);
  }, []);

  const imgUrl =
    seg === "week"
      ? `/api/story/compose?theme=${themeId}&v=${bust}-${themeId}`
      : `/api/card/${handle}?theme=${themeId}&v=${bust}-${themeId}`;
  const fileName =
    seg === "week" ? `fittlist-${handle}-week.png` : `fittlist-${handle}-card.png`;
  const qrUrl = `/api/qr/${handle}`;
  const qrFileName = `fittlist-${handle}-qr.png`;

  const shareImage = async (url: string, file: string, failWord: string) => {
    if (sharing) return;
    setSharing(true);
    try {
      if (canShareFiles) {
        const res = await fetch(url);
        if (res.ok) {
          const f = new File([await res.blob()], file, { type: "image/png" });
          if (navigator.canShare({ files: [f] })) {
            await navigator.share({ files: [f] });
            return;
          }
        }
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = file;
      a.click();
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") onFail(failWord);
    } finally {
      setSharing(false);
    }
  };
  const onFail = (what: string) => toast(`Couldn't share the ${what}`);

  const copyLink = async () => {
    const url = `${window.location.origin}/${handle}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied, ready to paste");
    } catch {
      toast(url);
    }
  };

  const segs: { id: Seg; label: string }[] = [
    ...(coach ? [{ id: "week" as const, label: "Week" }] : []),
    { id: "profile" as const, label: "Profile" },
    { id: "qr" as const, label: "QR code" },
  ];
  const words = WORDS[seg];

  return (
    <>
      <div className="cardwrap">
        <h1 className="calbar-t shtitle">{words.title}</h1>
        <p className="shsub">{words.sub}</p>

        <div className="shseg" role="tablist" aria-label="What to share">
          {segs.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={seg === s.id}
              className={`shseg-pill${seg === s.id ? " on" : ""}`}
              onClick={() => setSeg(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {seg !== "qr" && (
          <>
            {/* The colours, as the swatches they are: tapping one redraws the
                picture below it, and the picture is the label. */}
            <div className="shcolors">
              <span className="shcolors-lbl">Colors</span>
              <div className="shcolors-row" role="listbox" aria-label="Colors">
                {(Object.entries(STORY_THEMES) as [StoryThemeId, (typeof STORY_THEMES)["paper"]][]).map(
                  ([id, t]) => (
                    <button
                      key={id}
                      role="option"
                      aria-selected={id === themeId}
                      aria-label={t.label}
                      className={`shswatch${id === themeId ? " sel" : ""}`}
                      style={
                        t.bg.includes("gradient")
                          ? { background: t.bg }
                          : { background: `linear-gradient(105deg, ${t.bg} 50%, ${t.accent} 50%)` }
                      }
                      onClick={() => setThemeId(id)}
                    />
                  ),
                )}
              </div>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={`shprev${seg === "profile" ? " shprev-sq" : ""}`}
              src={imgUrl}
              alt={seg === "week" ? "Your week as a story image" : "Your profile card"}
            />

            <div className="shcta">
              {canShareFiles ? (
                <button
                  className="btn si"
                  disabled={sharing}
                  onClick={() =>
                    shareImage(imgUrl, fileName, seg === "week" ? "picture" : "card")
                  }
                >
                  {sharing ? "Opening…" : seg === "week" ? "Share the week" : "Share the card"}
                </button>
              ) : (
                <a className="btn si" href={imgUrl} download={fileName}>
                  Save image
                </a>
              )}
              {seg === "week" && (
                <Link className="shedit" href="/share">
                  Choose the dates and classes
                  <Icon name="chevron_right" size={18} />
                </Link>
              )}
            </div>
          </>
        )}

        {seg === "qr" && (
          <>
            {/* The card the mock drew: name, the ask, the code on white, the
                address. A bare code is anybody's; this one says whose. */}
            <div className="qrcard">
              <div className="qrcard-nm">{name}</div>
              <div className="qrcard-k">{coach ? "Scan for my week" : "Scan for my page"}</div>
              <div className="qrframe">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="qrimg" src={qrUrl} alt="QR code that opens your fittlist page" />
              </div>
              <div className="qrurl">
                {pageHost}/{handle}
              </div>
            </div>
            <div className="shcta">
              {canShareFiles ? (
                <button
                  className="btn si"
                  disabled={sharing}
                  onClick={() => shareImage(qrUrl, qrFileName, "QR code")}
                >
                  {sharing ? "Opening…" : "Share QR code"}
                </button>
              ) : (
                <a className="btn si" href={qrUrl} download={qrFileName}>
                  Save QR code
                </a>
              )}
              <button className="btn ghost" onClick={copyLink}>
                Copy link
              </button>
            </div>
          </>
        )}
      </div>

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
