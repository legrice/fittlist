"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import { TYPEFACES, type TypeFaceId } from "@/lib/typefaces";
import { DECOS, type DecoId } from "@/lib/decorations";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import type { PersonalMatch } from "@/app/actions/personal";
import { setGoing } from "@/app/actions/going";
import { Adder } from "@/components/Adder";
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
type Seg = "week" | "profile" | "qr" | "text";

/** One occurrence the picture could hold, from the same loader the image
 *  route reads: key is `{classId}.{iso}`, which is what hiding is keyed on.
 *  `where` rides along for the text version, which says the studio the way
 *  the poster does. */
export type HubItem = { key: string; iso: string; time: string; name: string; where: string };

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
  hasPhoto,
  studios,
  templates,
  customTypes,
  lastUsed,
}: {
  /** A coach's picture is the week they teach, beside their card and QR
   *  code; a member gets the Week alone and builds it right here. */
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
  /** Whether there is a face to offer: the Photo chip only renders when
   *  turning it on could show something. */
  hasPhoto: boolean;
  /** The adder's ingredients, loaded only for a member: their hub carries
   *  the personal adder, because building the week is what the tab is for. */
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
}) {
  const router = useRouter();
  const [seg, setSeg] = useState<Seg>("week");
  const [themeId, setThemeId] = useState<StoryThemeId>("paper");
  const [from, setFrom] = useState(defaultFrom);
  const [days, setDays] = useState(7);
  const [hide, setHide] = useState<Set<string>>(new Set());
  // The words at the top of the poster. Sent explicitly on every request
  // (the composer's old doctrine): letting the route fall back to saved
  // prefs would let the chip and the picture disagree.
  const [headline, setHeadline] = useState(savedHeadline);
  // The poster's voice, picked by personality: see typefaces.ts.
  const [typeId, setTypeId] = useState<TypeFaceId>("standard");
  // The headline's loudness, in percent. hsize is what the picture reads;
  // slider is the thumb's live position, committed on release, because a
  // poster takes a second to draw and a redraw per pixel of drag is a
  // spinner that never ends.
  const [hsize, setHsize] = useState(100);
  const [slider, setSlider] = useState(100);
  // The face on the poster, offered only to somebody who has one. A chip
  // that toggles in place rather than opening a sheet: two states need no
  // room of their own. Off by default, by Matt's call: the headline owns
  // the top now, and the face is the opt-in.
  const [photo, setPhoto] = useState(false);
  // The dressing: the top bar (the default), frames and day dividers.
  // See decorations.ts.
  const [decoId, setDecoId] = useState<DecoId>("top");
  const [pick, setPick] = useState<null | "dates" | "classes" | "message" | "deco">(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pageHost, setPageHost] = useState("fittlist.co");
  // One buster per visit, bumped after an add: the week changes behind the
  // picture the moment a class lands, and a cached preview of the week
  // before is a lie waiting to be posted.
  const [bust, setBust] = useState(() => Date.now());
  // The member's build flow: the adder, and the "that class is on fittlist"
  // offer that comes back from it.
  const [addOpen, setAddOpen] = useState(false);
  const [match, setMatch] = useState<{ m: PersonalMatch; again: () => void } | null>(null);
  const [matchBusy, setMatchBusy] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();

  // A server change (an add, a mark) has to reach both the list and the
  // picture: refresh re-runs the page's loader for the list, the bust
  // redraws the picture.
  const refreshWeek = () => {
    setBust(Date.now());
    router.refresh();
  };

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
  // Both pictures at once now, because both slides are on screen: the
  // carousel is what makes swiping between them a thing.
  const weekImgUrl =
    `/api/story/compose?theme=${themeId}&from=${from}&days=${days}&photo=${photo ? 1 : 0}` +
    `&headline=${encodeURIComponent(headline)}&type=${typeId}&hs=${hsize}&deco=${decoId}` +
    `${hideParam ? `&hide=${encodeURIComponent(hideParam)}` : ""}&v=${bust}-${themeId}`;
  const cardImgUrl = `/api/card/${handle}?theme=${themeId}&v=${bust}-${themeId}`;
  const imgUrl = seg === "week" ? weekImgUrl : cardImgUrl;
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

  // A member gets the Week alone, by Matt's call: no profile card, no QR
  // code, none of the extra stuff. Their tab is for building the week
  // they're going to and handing it on, and one segment is no segment row
  // at all, because a control with one option teaches somebody the screen
  // is more complicated than it is.
  const segs: { id: Seg; label: string }[] = coach
    ? [
        { id: "week", label: "Week" },
        { id: "profile", label: "Profile" },
        { id: "qr", label: "QR code" },
        // The week as words is a subject of its own, by Matt's call: it sat
        // on the rail as a chip and reads better beside Profile and QR code,
        // because it is a different thing to send, not a knob on the picture.
        { id: "text", label: "Text" },
      ]
    : [{ id: "week", label: "Week" }];
  // The next fortnight of start days on offer, whether or not each holds
  // anything: "from Saturday" is a real ask on a week that starts quiet.
  const startDays = useMemo(() => Array.from({ length: 14 }, (_, i) => plusDays(today, i)), [today]);

  // The carousel: the slides scroll-snap, a swipe lands on the next one and
  // the controls below follow, and a pill tap rides the same scroll. The
  // segment state stays the one truth; the scroll handler only reads which
  // slide is nearest the middle, measured rather than divided, so a peeking
  // neighbour never throws the arithmetic.
  const slidesRef = useRef<HTMLDivElement>(null);
  // A pill tap animates the scroll; the handler stays quiet until the ride
  // ends, or the controls would flick through every segment passed over.
  const rideTo = useRef<number | null>(null);
  const nearestSlide = (el: HTMLDivElement) => {
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bd = Infinity;
    [...el.children].forEach((k, idx) => {
      const kid = k as HTMLElement;
      const d = Math.abs(kid.offsetLeft + kid.offsetWidth / 2 - mid);
      if (d < bd) {
        bd = d;
        best = idx;
      }
    });
    return best;
  };
  const goSeg = (id: Seg) => {
    setSeg(id);
    const el = slidesRef.current;
    const i = segs.findIndex((s) => s.id === id);
    const kid = el?.children[i] as HTMLElement | undefined;
    if (!el || !kid) return;
    rideTo.current = i;
    el.scrollTo({ left: kid.offsetLeft - (el.clientWidth - kid.offsetWidth) / 2, behavior: "smooth" });
  };
  const onSlides = () => {
    const el = slidesRef.current;
    if (!el) return;
    const i = nearestSlide(el);
    if (rideTo.current !== null) {
      if (i === rideTo.current) rideTo.current = null;
      return;
    }
    const id = segs[i]?.id;
    if (id && id !== seg) setSeg(id);
  };

  return (
    <>
      {/* No title and no lead, by Matt's call: the segments say what there
          is and the picture is most of the screen, so two lines of words
          above them were room spent saying what the eye already sees.
          `shpage` is the marker the gradient opt-out keys on. */}
      <div className="cardwrap shpage">
        {segs.length > 1 && (
          <div className="shseg" role="tablist" aria-label="What to share">
            {segs.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={seg === s.id}
                className={`shseg-pill${seg === s.id ? " on" : ""}`}
                onClick={() => goSeg(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* The slides, one per segment, swiped between the way Spotify's
            share sheet swipes between the song card and the lyrics, by
            Matt's call: the next card peeks in from the edge, which is
            what says a swipe exists. A grab mid-ride cancels the pill
            tap's claim on the scroll. */}
        <div
          className="shslides"
          ref={slidesRef}
          onScroll={onSlides}
          onTouchStart={() => (rideTo.current = null)}
        >
          <div className="shslide">
            <SlideImg cls="shprev shprev-week" src={weekImgUrl} alt="Your week as a story image" />
          </div>
          {coach && (
            <div className="shslide">
              <SlideImg cls="shprev shprev-sq" src={cardImgUrl} alt="Your profile card" />
            </div>
          )}
          {coach && (
            <div className="shslide">
              {/* The card the mock drew: name, the code on white, the address.
                  A bare code is anybody's; this one says whose. */}
              <div className="qrcard">
                <div className="qrcard-nm">{name}</div>
                <div className="qrframe">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="qrimg" src={qrUrl} alt="QR code that opens your fittlist page" />
                </div>
                <div className="qrurl">
                  {pageHost}/{handle}
                </div>
              </div>
            </div>
          )}
          {coach && (
            <div className="shslide">
              <pre className="shtext">{weekText}</pre>
            </div>
          )}
        </div>

        {(seg === "week" || seg === "profile") && (
          <>
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
                  <span className="shctrl-k">Headline</span>
                  <span className="shctrl-v">
                    {headline.trim() || (coach ? "Come train with me." : "Come with me.")}
                  </span>
                </button>
                <button className="shctrl" onClick={() => setPick("deco")}>
                  <span className="shctrl-k">Decoration</span>
                  <span className="shctrl-v">
                    {DECOS.find((d) => d.id === decoId)?.label ?? "Top bar"}
                  </span>
                </button>
                {hasPhoto && (
                  <button className="shctrl" onClick={() => setPhoto((v) => !v)}>
                    <span className="shctrl-k">Photo</span>
                    <span className="shctrl-v">{photo ? "On" : "Off"}</span>
                  </button>
                )}
              </div>
            )}

            {/* A member's week starts empty and this screen is where it gets
                built, so an empty range leads with the one act that fixes
                it. With something on it, sharing leads and adding stays a
                tap away. */}
            {!coach && inRange.length === 0 ? (
              <div className="shcta">
                <button className="btn si" onClick={() => setAddOpen(true)}>
                  Add the classes you&rsquo;re going to
                </button>
              </div>
            ) : (
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
                {!coach && (
                  <button className="btn ghost" onClick={() => setAddOpen(true)}>
                    Add a class
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {seg === "text" && (
          <>
            <div className="shcta">
              <button className="btn si" onClick={copyText}>
                Copy text
              </button>
            </div>
          </>
        )}

        {seg === "qr" && (
          <>
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

      {pick === "deco" && (
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
            <h2>Decoration</h2>
            {/* Each row carries a little swatch of what it does: a frame
                you can see beats a frame you can only read about. */}
            <div className="settingslist">
              {DECOS.map((d) => {
                const on = d.id === decoId;
                return (
                  <button
                    key={d.id}
                    className="setrow"
                    aria-pressed={on}
                    onClick={() => {
                      setDecoId(d.id);
                      setPick(null);
                    }}
                  >
                    <span className={`decochip decochip-${d.id}`} aria-hidden="true" />
                    <span className="setrow-txt">
                      <span className="t">{d.label}</span>
                    </span>
                    {on && (
                      <span className="setrow-ic">
                        <Icon name="check" size={20} />
                      </span>
                    )}
                  </button>
                );
              })}
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
            <h2>Headline</h2>
            <p className="lead">The words at the top of the picture, how loud, and their voice.</p>
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
            {/* How loud: a slider, by Matt's call, for taking up the room a
                quiet week leaves. It commits on release rather than per
                pixel, because every value is a fresh server render. */}
            <label className="flabel" htmlFor="shSize">
              Size <span>· {slider}%</span>
            </label>
            <input
              id="shSize"
              className="shslider"
              type="range"
              min={60}
              max={180}
              step={5}
              value={slider}
              onChange={(e) => setSlider(Number(e.target.value))}
              onPointerUp={() => setHsize(slider)}
              onKeyUp={() => setHsize(slider)}
              onTouchEnd={() => setHsize(slider)}
            />
            {/* The voice, as a plain dropdown, by Matt's call: the sheet
                of sample rows folded in here with the words it dresses. */}
            <label className="flabel" htmlFor="shFont">
              Font
            </label>
            <select
              id="shFont"
              className="typeselect"
              value={typeId}
              onChange={(e) => setTypeId(e.target.value as TypeFaceId)}
            >
              {TYPEFACES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
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
            {/* The sheet adds as well as picks, for a member: choosing what
                goes on the picture and keeping the week current are the
                same list, so doing one does the other. */}
            {!coach && (
              <button
                className="tertiary shpick-add"
                onClick={() => {
                  setPick(null);
                  setAddOpen(true);
                }}
              >
                + Add a class
              </button>
            )}
            <div className="publishwrap nostick">
              <button className="btn si" onClick={() => setPick(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <Adder
          studios={studios}
          templates={templates}
          customTypes={customTypes}
          lastUsed={lastUsed}
          subsCount={0}
          firstPublish={false}
          personal={{ canCoach: false, oneOff: true }}
          onClose={() => setAddOpen(false)}
          onToast={toast}
          onPublished={() => {
            setAddOpen(false);
            toast("Added to your week");
            refreshWeek();
          }}
          onDeleted={(msg) => {
            setAddOpen(false);
            toast(msg);
            refreshWeek();
          }}
          onMatch={(m, again) => {
            // The match stands alone; two stacked sheets read as a collision.
            // `again` still holds everything they typed.
            setAddOpen(false);
            setMatch({ m, again });
          }}
        />
      )}

      {match && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMatch(null);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>That class is on fittlist</h2>
            <p className="lead">
              {match.m.name} with {match.m.coachName} runs then. Add the real one and it stays up
              to date when the coach changes it.
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                disabled={matchBusy}
                onClick={async () => {
                  if (!match || matchBusy) return;
                  setMatchBusy(true);
                  const res = await setGoing(match.m.classId, match.m.iso, true);
                  setMatchBusy(false);
                  setMatch(null);
                  if (res.ok) {
                    toast("Added to your week");
                    refreshWeek();
                  } else {
                    toast(res.error ?? "Couldn't add it");
                  }
                }}
              >
                Add {match.m.name}
              </button>
              <button
                className="btn ghost"
                style={{ marginTop: 8 }}
                disabled={matchBusy}
                onClick={() => {
                  const { again } = match;
                  setMatch(null);
                  again();
                }}
              >
                Add mine anyway
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

/** One picture in the carousel, with its own spinner: the preview redraws
 *  server-side on every knob and takes a second or two to paint, and the
 *  spinner is what says the wait is the picture coming rather than a dead
 *  control. Per slide, because two pictures are on screen at once now. */
function SlideImg({ cls, src, alt }: { cls: string; src: string; alt: string }) {
  const [loading, setLoading] = useState(true);
  // Every knob that changes the url restarts the wait; a cached picture
  // fires onLoad immediately and the spinner never registers.
  useEffect(() => {
    setLoading(true);
  }, [src]);
  return (
    <div className="shprev-wrap">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={`${cls}${loading ? " loading" : ""}`}
        src={src}
        alt={alt}
        onLoad={() => setLoading(false)}
        onError={() => setLoading(false)}
      />
      {loading && <span className="shspin" aria-label="Drawing the picture" />}
    </div>
  );
}
