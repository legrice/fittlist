"use client";

import { useEffect, useMemo, useState } from "react";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The Share tab's screen, on Matt's concept: one surface, three subjects.
// Week, Profile and QR code are segments rather than tiles, the title says
// which one you are on, the colours redraw the picture live, and the big
// button saves the thing on screen. The Week segment carries the Dates and
// Classes pickers side by side above the colours, so the whole picture is
// decided here. The old composer at /share still exists but nothing links
// to it any more, by Matt's call; copy-week-as-text is gone the same way,
// and the page link lives with the QR code.
//
// Deliberately absent: the style row (Poster, Ticket, Grid, Minimal) from
// the concept. Ten layout styles shipped once and came out because the
// differences were not worth a decision; colour is what makes two posters
// read as two posters. The renderer still honours a StoryStyle, so a real
// style axis can return, but a row of thumbnails over one layout would be
// a picker of lies.
type Seg = "week" | "profile" | "qr";

/** One occurrence the picture could hold, from the same loader the image
 *  route reads: key is `{classId}.{iso}`, which is what hiding is keyed on.
 *  `where` rides along for the text version, which says the studio the way
 *  the poster does. */
export type HubItem = { key: string; iso: string; time: string; name: string; where: string };

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
  savedHeadline,
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
  /** The words the poster opens with: the saved headline when there is
   *  one, so the Message chip never claims the default while the picture
   *  draws something else. */
  savedHeadline: string;
}) {
  const [seg, setSeg] = useState<Seg>(coach ? "week" : "profile");
  // The preview redraws server-side on every knob (theme, dates, classes),
  // and a story takes a second or two to paint: the spinner is what says
  // the wait is the picture coming rather than a dead control.
  const [imgLoading, setImgLoading] = useState(true);
  const [themeId, setThemeId] = useState<StoryThemeId>("paper");
  const [from, setFrom] = useState(defaultFrom);
  const [days, setDays] = useState(7);
  const [hide, setHide] = useState<Set<string>>(new Set());
  // The words at the top of the poster. Sent explicitly on every request
  // (the composer's old doctrine): letting the route fall back to saved
  // prefs would let the chip and the picture disagree.
  const [headline, setHeadline] = useState(savedHeadline);
  const [pick, setPick] = useState<null | "dates" | "classes" | "message" | "text">(null);
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
      ? `/api/story/compose?theme=${themeId}&from=${from}&days=${days}&photo=1` +
        `&headline=${encodeURIComponent(headline)}` +
        `${hideParam ? `&hide=${encodeURIComponent(hideParam)}` : ""}&v=${bust}-${themeId}`
      : `/api/card/${handle}?theme=${themeId}&v=${bust}-${themeId}`;
  const fileName =
    seg === "week" ? `fittlist-${handle}-week.png` : `fittlist-${handle}-card.png`;

  // Every knob that changes the url restarts the wait; a cached picture
  // fires onLoad immediately and the spinner never registers.
  useEffect(() => {
    setImgLoading(true);
  }, [imgUrl]);
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

  // The week as words, matching the picture exactly: same range, same hide
  // set, same studio names. Ends on the page link, because the text is a
  // door as well as an answer.
  const weekText = useMemo(() => {
    const kept = inRange.filter((it) => !hide.has(it.key));
    const byDay = new Map<string, HubItem[]>();
    for (const it of kept) byDay.set(it.iso, [...(byDay.get(it.iso) ?? []), it]);
    const blocks = [...byDay.entries()].map(
      ([iso, list]) =>
        `${wday(iso)}, ${short(iso)}\n` +
        list.map((it) => `${it.time} ${it.name}${it.where ? ` · ${it.where}` : ""}`).join("\n"),
    );
    return [`My week, ${rangeLabel}`, ...blocks, `Full schedule: ${pageHost}/${handle}`].join("\n\n");
  }, [inRange, hide, rangeLabel, pageHost, handle]);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(weekText);
      toast("Copied, ready to paste");
      setPick(null);
    } catch {
      toast("Couldn't copy");
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

        {seg !== "qr" && (
          <>
            {/* The picture leads, the way Spotify's share sheet leads with
                the card, by Matt's call: the poster is the point of the
                screen, so it comes before every knob that changes it. */}
            <div className="shprev-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={`shprev${seg === "profile" ? " shprev-sq" : ""}${imgLoading ? " loading" : ""}`}
                src={imgUrl}
                alt={seg === "week" ? "Your week as a story image" : "Your profile card"}
                onLoad={() => setImgLoading(false)}
                onError={() => setImgLoading(false)}
              />
              {imgLoading && <span className="shspin" aria-label="Drawing the picture" />}
            </div>

            {/* The colours right under the picture, bare circles, centred:
                tapping one redraws the picture above it, and the picture is
                the label, so the word "Colors" said nothing. */}
            <div className="shcolors">
              <div className="shcolors-row" role="listbox" aria-label="Colors">
                {(Object.entries(STORY_THEMES) as [StoryThemeId, (typeof STORY_THEMES)["paper"]][]).map(
                  ([id, t]) => (
                    <button
                      key={id}
                      role="option"
                      aria-selected={id === themeId}
                      aria-label={t.label}
                      className={`shswatch${id === themeId ? " sel" : ""}`}
                      // backgroundImage, never the shorthand: the CSS clips
                      // the colour to the content circle so the ring can be
                      // the border, and the shorthand would reset that clip.
                      style={{
                        backgroundImage: t.bg.includes("gradient")
                          ? t.bg
                          : `linear-gradient(105deg, ${t.bg} 50%, ${t.accent} 50%)`,
                      }}
                      onClick={() => setThemeId(id)}
                    />
                  ),
                )}
              </div>
            </div>

            {seg === "week" && (
              <div className="shctrls">
                {/* The rail of what the picture says: its range, its roster,
                    its words. Each chip is a small labelled door to a sheet. */}
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
                <button className="shctrl" onClick={() => setPick("message")}>
                  <span className="shctrl-k">Message</span>
                  <span className="shctrl-v">{headline.trim() || "Come train with me."}</span>
                </button>
                <button className="shctrl" onClick={() => setPick("text")}>
                  <span className="shctrl-k">Text</span>
                  <span className="shctrl-v">For the group chat</span>
                </button>
              </div>
            )}

            <div className="shcta">
              {canShareFiles ? (
                <button
                  className="btn si"
                  disabled={sharing}
                  onClick={() =>
                    shareImage(imgUrl, fileName, seg === "week" ? "picture" : "card")
                  }
                >
                  {sharing ? "Opening…" : "Share image"}
                </button>
              ) : (
                <a className="btn si" href={imgUrl} download={fileName}>
                  Save image
                </a>
              )}
            </div>
          </>
        )}

        {seg === "qr" && (
          <>
            {/* The card the mock drew: name, the ask, the code on white, the
                address. A bare code is anybody's; this one says whose. */}
            <div className="qrcard">
              {/* The name alone: "scan for my week" under it said what a QR
                  code already says by existing, and came off by Matt's call. */}
              <div className="qrcard-nm">{name}</div>
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
            {/* The one preset worth a chip: "I'm at this tonight" is a real
                post, and it was a dropdown plus a number away. */}
            <button
              className={`shday shtoday${from === today && days === 1 ? " on" : ""}`}
              onClick={() => {
                setFrom(today);
                setDays(1);
              }}
            >
              Today only
            </button>
            {/* A dropdown, not a list of rows: fourteen rows was a scroll for
                a one-word answer, and the native picker is the control
                everybody's thumb already knows. */}
            <label className="flabel" htmlFor="shFrom">
              Starting
            </label>
            <select
              id="shFrom"
              className="typeselect"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            >
              {startDays.map((iso) => (
                <option key={iso} value={iso}>
                  {wday(iso)}, {short(iso)}
                </option>
              ))}
            </select>
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
            <div className="publishwrap nostick">
              <button className="btn si" onClick={() => setPick(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {pick === "text" && (
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
            <h2>The week as text</h2>
            {/* The why, said out loud: without it this reads as a lesser
                copy of the picture rather than the format group chats
                actually want. */}
            <p className="lead">
              For group chats and DMs, where a pasted week is handier than a picture and anyone
              can forward it. Same days, same classes as the image.
            </p>
            <pre className="shtext">{weekText}</pre>
            <div className="publishwrap nostick">
              <button className="btn si" onClick={copyText}>
                Copy text
              </button>
            </div>
          </div>
        </div>
      )}

      {pick === "message" && (
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
            <h2>Message</h2>
            <p className="lead">The words at the top of the picture.</p>
            <label className="flabel" htmlFor="shMsg">
              Your words
            </label>
            <input
              id="shMsg"
              className="editinput"
              value={headline}
              maxLength={44}
              placeholder="Come train with me."
              onChange={(e) => setHeadline(e.target.value)}
            />
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
