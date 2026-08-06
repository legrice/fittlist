"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The Share tab's screen, on Matt's concept: one surface, three subjects.
// Week, Profile and QR code are segments rather than tiles, the title says
// which one you are on, the colours redraw the picture live, and the big
// button saves the thing on screen. The Week segment carries the Dates and
// Classes pickers side by side above the colours, so the whole picture is
// decided here; the full editor stays one quiet tap away for adding a class
// from the picker. Copy-week-as-text is gone by the same call, and the page
// link lives with the QR code.
//
// Deliberately absent: the style row (Poster, Ticket, Grid, Minimal) from
// the concept. Ten layout styles shipped once and came out because the
// differences were not worth a decision; colour is what makes two posters
// read as two posters. The renderer still honours a StoryStyle, so a real
// style axis can return, but a row of thumbnails over one layout would be
// a picker of lies.
type Seg = "week" | "profile" | "qr";

/** One occurrence the picture could hold, from the same loader the image
 *  route reads: key is `{classId}.{iso}`, which is what hiding is keyed on. */
export type HubItem = { key: string; iso: string; time: string; name: string };

const WORDS: Record<Seg, { title: string; sub: string }> = {
  week: { title: "Share the week", sub: "Straight to your story." },
  profile: { title: "Share your profile", sub: "Your card, wherever people ask for it." },
  qr: { title: "Your QR code", sub: "Hold it up after class. They land on your page." },
};

const short = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const wday = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const plusDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export function ShareHubScreen({
  coach,
  handle,
  name,
  items,
  defaultFrom,
  today,
}: {
  /** A coach gets the Week segment; a member's page has no schedule to draw. */
  coach: boolean;
  handle: string;
  /** On the QR card, above the code: the code is a thing you hold up, and a
   *  bare code is anybody's. */
  name: string;
  /** A fortnight of occurrences for the pickers, oldest first. */
  items: HubItem[];
  /** The first day with something on it: the empty poster should never be
   *  the first one anybody sees. */
  defaultFrom: string;
  /** The app's today, decided on the server clock: the start-day list runs
   *  a fortnight from it. */
  today: string;
}) {
  const [seg, setSeg] = useState<Seg>(coach ? "week" : "profile");
  const [themeId, setThemeId] = useState<StoryThemeId>("paper");
  const [from, setFrom] = useState(defaultFrom);
  const [days, setDays] = useState(7);
  const [hide, setHide] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState<null | "dates" | "classes">(null);
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

  // What the picked range holds, and what of it is showing: the control says
  // "4 of 5" and the picture has to be those four, which is why both read
  // the same items and the same hide set.
  const inRange = useMemo(() => {
    const last = plusDays(from, days - 1);
    return items.filter((it) => it.iso >= from && it.iso <= last);
  }, [items, from, days]);
  const shown = inRange.filter((it) => !hide.has(it.key)).length;

  const hideParam = [...hide].join(",");
  const imgUrl =
    seg === "week"
      ? `/api/story/compose?theme=${themeId}&from=${from}&days=${days}` +
        `${hideParam ? `&hide=${encodeURIComponent(hideParam)}` : ""}&v=${bust}-${themeId}`
      : `/api/card/${handle}?theme=${themeId}&v=${bust}-${themeId}`;
  const fileName =
    seg === "week" ? `fittlist-${handle}-week.png` : `fittlist-${handle}-card.png`;
  const qrUrl = `/api/qr/${handle}`;
  const qrFileName = `fittlist-${handle}-qr.png`;

  const rangeLabel =
    days === 1 ? `${wday(from)}, ${short(from)}` : `${short(from)} to ${short(plusDays(from, days - 1))}`;

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
      if ((err as Error)?.name !== "AbortError") toast(`Couldn't share the ${failWord}`);
    } finally {
      setSharing(false);
    }
  };

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
  // The next fortnight of start days on offer, whether or not each holds
  // anything: "from Saturday" is a real ask on a week that starts quiet.
  const startDays = useMemo(() => Array.from({ length: 14 }, (_, i) => plusDays(today, i)), [today]);

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

        {seg === "week" && (
          <div className="shctrls">
            {/* The range and the roster, side by side above the colours: what
                the picture covers, then what it wears. */}
            <button className="shctrl" onClick={() => setPick("dates")}>
              <span className="shctrl-k">Dates</span>
              <span className="shctrl-v">{rangeLabel}</span>
            </button>
            <button className="shctrl" onClick={() => setPick("classes")}>
              <span className="shctrl-k">Classes</span>
              <span className="shctrl-v">
                {inRange.length === 0 ? "None in range" : `${shown} of ${inRange.length} showing`}
              </span>
            </button>
          </div>
        )}

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
                  Open the full editor
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

      {pick === "dates" && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPick(null);
          }}
        >
          <div className="sheet shpick">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setPick(null)}>
              <Icon name="close" size={18} />
            </button>
            <h2>Dates</h2>
            <label className="flabel">How many days</label>
            <div className="shdays">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  className={`shday${days === n ? " on" : ""}`}
                  onClick={() => setDays(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <label className="flabel">Starting</label>
            <div className="settingslist shpick-list">
              {startDays.map((iso) => (
                <button key={iso} className="setrow" onClick={() => setFrom(iso)}>
                  <span className="setrow-txt">
                    <span className="t">
                      {wday(iso)}, {short(iso)}
                    </span>
                  </span>
                  {from === iso && (
                    <span className="setrow-chev">
                      <Icon name="check" size={20} />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="publishwrap nostick">
              <button className="btn si" onClick={() => setPick(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {pick === "classes" && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPick(null);
          }}
        >
          <div className="sheet shpick">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setPick(null)}>
              <Icon name="close" size={18} />
            </button>
            <h2>Classes</h2>
            {/* Without this line people read a checkbox as a delete and stop
                touching the control: hiding is the picture's business only. */}
            <p className="lead">
              Untick one to leave it off the picture. Your calendar keeps it.
            </p>
            <div className="settingslist shpick-list">
              {inRange.length === 0 && <p className="empty">Nothing in this range yet.</p>}
              {inRange.map((it) => {
                const off = hide.has(it.key);
                return (
                  <button
                    key={it.key}
                    className="setrow"
                    aria-pressed={!off}
                    onClick={() =>
                      setHide((cur) => {
                        const next = new Set(cur);
                        if (next.has(it.key)) next.delete(it.key);
                        else next.add(it.key);
                        return next;
                      })
                    }
                  >
                    <span className={`shtick${off ? "" : " on"}`} aria-hidden="true">
                      {!off && <Icon name="check" size={15} />}
                    </span>
                    <span className="setrow-txt">
                      <span className="t">{it.name}</span>
                      <span className="s">
                        {wday(it.iso)}, {short(it.iso)} · {it.time}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="publishwrap nostick">
              <button className="btn si" onClick={() => setPick(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
