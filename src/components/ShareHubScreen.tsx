"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  STORY_STYLES,
  STORY_THEMES,
  type StoryStyleId,
  type StoryThemeId,
} from "@/lib/format";
import { TYPEFACES, type TypeFaceId } from "@/lib/typefaces";
import type { DecoId } from "@/lib/decorations";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { personalDetail, type PersonalMatch } from "@/app/actions/personal";
import { setStoryBackground } from "@/app/actions/profile";
import { setGoing } from "@/app/actions/going";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { readPhoto } from "@/lib/photo";

// The Share tab's screen, on Matt's concept: one surface, four subjects.
// Week, Profile and QR code are segments rather than tiles, the title says
// which one you are on, the colours redraw the picture live, and the big
// button saves the thing on screen. The Week segment carries the Dates and
// Classes pickers side by side above the colours, so the whole picture is
// decided here. The old composer at /share still exists but nothing links
// to it any more, by Matt's call; copy-week-as-text is gone the same way,
// and the page link lives with the QR code.
//
type Seg = "week" | "profile" | "qr" | "text";

/** One occurrence the picture could hold, from the same loader the image
 *  route reads: key is `{classId}.{iso}`, which is what hiding is keyed on.
 *  `where` rides along for the text version, which says the studio the way
 *  the poster does. `own` marks a member's own entry, the only kind the
 *  sheet can offer to edit: a mark points at somebody else's class. */
export type HubItem = {
  key: string;
  iso: string;
  time: string;
  name: string;
  where: string;
  own?: boolean;
  /** A class the coach leads, against the saved half riding beside it now:
   *  the Classes sheet tags the rows and offers the shortcuts on it. */
  coaching?: boolean;
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
  embedded = false,
  coach,
  handle,
  name,
  items,
  defaultFrom,
  today,
  savedHeadline,
  savedBackground,
  studios,
  templates,
  customTypes,
  lastUsed,
}: {
  /** Render inside another surface (the calendar's share sheet). The sheet
   *  owns dismissal, so the editor does not add a second back control. */
  embedded?: boolean;
  /** Both kinds get the full sheet: the week, the card, the QR code and
   *  the text. What `coach` still decides is the week's subject (teaching
   *  against saved), the fallback headline, and whether the hub carries
   *  the build flow, which is a member's. */
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
  /** The last background picked in this editor, reusable next time. */
  savedBackground: string | null;
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
  const [styleId, setStyleId] = useState<StoryStyleId>("plain");
  const [from, setFrom] = useState(defaultFrom);
  const [days, setDays] = useState(7);
  const [hide, setHide] = useState<Set<string>>(new Set());
  // The words at the top of the poster. Sent explicitly on every request
  // (the composer's old doctrine): letting the route fall back to saved
  // prefs would let the chip and the picture disagree.
  const [headline, setHeadline] = useState(savedHeadline);
  const [background, setBackground] = useState(savedBackground);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const backgroundRef = useRef<HTMLInputElement>(null);
  // Off means no headline at all, by Matt's call: the picture is the week
  // alone. Its own switch rather than an empty field, because an empty
  // field falls back to the stock words on purpose.
  const [noHead, setNoHead] = useState(false);
  // The poster's voice, picked by personality: see typefaces.ts.
  const [typeId, setTypeId] = useState<TypeFaceId>("standard");
  // The headline's loudness, in percent. hsize is what the picture reads;
  // slider is the thumb's live position, committed on release, because a
  // poster takes a second to draw and a redraw per pixel of drag is a
  // spinner that never ends.
  const [hsize, setHsize] = useState(100);
  const [slider, setSlider] = useState(100);
  // The dressing: the top bar (the default), frames and day dividers.
  // See decorations.ts.
  const [decoId, setDecoId] = useState<DecoId>("top");
  const [pick, setPick] = useState<
    null | "dates" | "classes" | "message" | "layout" | "color"
  >(null);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [shareCapabilityKnown, setShareCapabilityKnown] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [preparedShare, setPreparedShare] = useState<{ url: string; file: File } | null>(null);
  const [prepareFailed, setPrepareFailed] = useState(false);
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
  // Editing one of your own from the Classes sheet: the same form, opened
  // on the row's saved details.
  const [edit, setEdit] = useState<{ id: string; prefill: AdderPrefill } | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const openEdit = async (it: HubItem) => {
    if (editBusy) return;
    setEditBusy(true);
    const d = await personalDetail(it.key.split(".")[0]);
    setEditBusy(false);
    if (!d) {
      toast("That class isn't there any more");
      refreshWeek();
      return;
    }
    setPick(null);
    setEdit({
      id: d.id,
      prefill: {
        name: d.name,
        classType: d.classType,
        description: d.description,
        image: d.image,
        startTime: d.startTime,
        durationMin: d.durationMin,
        studioId: d.studioId,
        location: d.location,
        withWho: d.withWho,
        links: d.links,
        days: [d.dayOfWeek],
        dayOfWeek: d.dayOfWeek,
        endsOn: d.endsOn,
        specificDate: d.specificDate,
      },
    });
  };
  const [toastMsg, toastOn, toast] = useToast();

  const chooseBackground = (file: File) => {
    if (backgroundBusy) return;
    readPhoto(
      file,
      async (dataUrl) => {
        setBackgroundBusy(true);
        const result = await setStoryBackground(dataUrl);
        setBackgroundBusy(false);
        if (!result.ok || !result.background) {
          toast(result.error ?? "Couldn't add that background");
          return;
        }
        setBackground(result.background);
        setBust(Date.now());
        setPick(null);
        toast("Photo background added");
      },
      () => toast("That photo format isn't supported"),
    );
  };

  const removeBackground = async () => {
    if (backgroundBusy) return;
    setBackgroundBusy(true);
    const result = await setStoryBackground(null);
    setBackgroundBusy(false);
    if (!result.ok) {
      toast(result.error ?? "Couldn't remove the background");
      return;
    }
    setBackground(null);
    setBust(Date.now());
    setPick(null);
    toast("Photo background removed");
  };

  const chooseColorBackground = async (id: StoryThemeId) => {
    if (backgroundBusy) return;
    if (background) {
      setBackgroundBusy(true);
      const result = await setStoryBackground(null);
      setBackgroundBusy(false);
      if (!result.ok) {
        toast(result.error ?? "Couldn't change the background");
        return;
      }
      setBackground(null);
      setBust(Date.now());
    }
    setThemeId(id);
    setPick(null);
  };

  // A server change (an add, a mark) has to reach both the list and the
  // picture: refresh re-runs the page's loader for the list, the bust
  // redraws the picture.
  const refreshWeek = () => {
    setBust(Date.now());
    router.refresh();
  };

  // The first landing after a save explains the screen once, by Matt's
  // call: saving lights your circle on Home rather than toasting, the
  // circle lands here, and this says why. `fl-you-new` is the lit ring
  // (cleared on arrival, because arriving is what the ring asked for);
  // `fl-share-intro` means the explanation has been given and never
  // repeats.
  const [intro, setIntro] = useState(false);
  useEffect(() => {
    try {
      const fresh = localStorage.getItem("fl-you-new");
      if (fresh) localStorage.removeItem("fl-you-new");
      if (fresh && !localStorage.getItem("fl-share-intro")) setIntro(true);
    } catch {
      // Private mode: no ring was stored, so there is nothing to explain.
    }
  }, []);

  useEffect(() => {
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function",
    );
    setNativeShareAvailable(
      !!(window as typeof window & {
        webkit?: { messageHandlers?: { fittlistShareTarget?: unknown } };
      }).webkit?.messageHandlers?.fittlistShareTarget,
    );
    setShareCapabilityKnown(true);
    setPageHost(window.location.host);
  }, []);

  // The route version is opened from your circle and owns the whole mobile
  // screen just like the calendar's embedded editor. The native header and
  // tab bar live outside the web view, so they need the same explicit signal.
  useEffect(() => {
    if (embedded) return;
    window.dispatchEvent(new CustomEvent("fittlist:takeover", { detail: true }));
    return () => {
      window.dispatchEvent(new CustomEvent("fittlist:takeover", { detail: false }));
    };
  }, [embedded]);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) toast(detail.message);
    };
    window.addEventListener("fittlist:native-share-result", receive);
    return () => window.removeEventListener("fittlist:native-share-result", receive);
  }, [toast]);

  // A member with nothing anywhere yet is building, not sharing: the screen
  // becomes the start block alone, because an empty poster pushed the one
  // button that fixes it below the fold. The first add flips this off and
  // the picture appears with the class on it.
  const building = !coach && items.length === 0;

  // What the picked range holds, and what of it is showing: the control says
  // "4 of 5" and the picture has to be those four, which is why both read
  // the same items and the same hide set.
  const inRange = useMemo(() => {
    const last = plusDays(from, days - 1);
    return items.filter((it) => it.iso >= from && it.iso <= last);
  }, [items, from, days]);

  // The range follows an add it doesn't cover: a class added for a date
  // past the picked window redrew a poster it wasn't on, and the only way
  // to see it was a reload recomputing the start day. Same rule the page's
  // own defaultFrom applies: nothing in range while the week holds
  // something means start where the week does.
  useEffect(() => {
    if (coach) return;
    if (items.length > 0 && inRange.length === 0) setFrom(items[0].iso);
  }, [coach, items, inRange.length]);

  // The two hats never mix on one picture, by Matt's call: a coach
  // promoting the classes they teach and a coach showing where they train
  // are two different posts, so the Classes sheet is a two-way segment
  // (Coaching, Saved) rather than the old All / only / only shortcuts.
  // The other hat's rows in range are folded into the hide set the image
  // reads, and the sheet lists only the hat in front of you, so the ticks
  // stay a within-hat choice. A member has one hat and no segment.
  const twoHats = coach && items.some((it) => it.coaching) && items.some((it) => !it.coaching);
  const [hat, setHat] = useState<"coaching" | "saved">("coaching");
  const effHide = useMemo(() => {
    if (!twoHats) return hide;
    const next = new Set(hide);
    for (const it of inRange) {
      if (hat === "coaching" ? !it.coaching : it.coaching) next.add(it.key);
    }
    return next;
  }, [twoHats, hide, hat, inRange]);

  // What the Classes sheet lists: the active hat only, when there are two.
  const hatRows = twoHats
    ? inRange.filter((it) => (hat === "coaching" ? it.coaching : !it.coaching))
    : inRange;

  const shown = inRange.filter((it) => !effHide.has(it.key)).length;

  const hideParam = [...effHide].join(",");
  // Both pictures at once now, because both slides are on screen: the
  // carousel is what makes swiping between them a thing.
  const weekImgUrl =
    `/api/story/compose?theme=${themeId}&style=${styleId}&from=${from}&days=${days}&photo=0&bg=${background ? 1 : 0}` +
    `&headline=${encodeURIComponent(headline)}&type=${typeId}&hs=${hsize}&deco=${decoId}` +
    `&nohead=${noHead ? 1 : 0}` +
    `${hideParam ? `&hide=${encodeURIComponent(hideParam)}` : ""}&v=${bust}-${themeId}-${styleId}-${background ? "photo" : "plain"}`;
  const cardImgUrl = `/api/card/${handle}?theme=${themeId}&v=${bust}-${themeId}`;
  const imgUrl = seg === "week" ? weekImgUrl : cardImgUrl;
  const fileName =
    seg === "week"
      ? `fittlist-${handle}-week-${styleId}.png`
      : `fittlist-${handle}-card.png`;
  const qrUrl = `/api/qr/${handle}`;
  const qrFileName = `fittlist-${handle}-qr.png`;
  const activeShareUrl = seg === "qr" ? qrUrl : imgUrl;
  const activeShareFile = seg === "qr" ? qrFileName : fileName;

  // Safari requires navigator.share to begin in the tap's user-activation
  // window. Preparing the PNG after the tap can take long enough to lose that
  // window, so prepare the currently visible subject as soon as it changes.
  useEffect(() => {
    if (seg === "text") return;
    const controller = new AbortController();
    setPreparedShare(null);
    setPrepareFailed(false);
    void (async () => {
      try {
        const response = await fetch(activeShareUrl, { signal: controller.signal });
        if (!response.ok) {
          setPrepareFailed(true);
          return;
        }
        const blob = await response.blob();
        setPreparedShare({
          url: activeShareUrl,
          file: new File([blob], activeShareFile, { type: blob.type || "image/png" }),
        });
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") {
          setPreparedShare(null);
          setPrepareFailed(true);
        }
      }
    })();
    return () => controller.abort();
  }, [activeShareFile, activeShareUrl, seg]);

  const rangeLabel =
    days === 1 ? `${wday(from)}, ${short(from)}` : `${short(from)} to ${short(plusDays(from, days - 1))}`;

  const downloadImage = (url: string, file: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    a.click();
  };

  const nativeShare = (url: string, file: string) => {
    const handler = (window as typeof window & {
      webkit?: { messageHandlers?: { fittlistShareTarget?: { postMessage: (body: unknown) => void } } };
    }).webkit?.messageHandlers?.fittlistShareTarget;
    if (!handler) return false;
    // Let the native side download the image with the web view's cookies.
    // Sending a 1080px PNG as base64 through WKScriptMessage was large enough
    // to fail before Instagram or Messages ever opened.
    handler.postMessage({ target: "more", url: new URL(url, window.location.href).href, file });
    return true;
  };

  const shareImage = async (url: string, file: string, failWord: string) => {
    if (sharing) return;
    setSharing(true);
    try {
      if (nativeShare(url, file)) return;
      if (
        canShareFiles &&
        preparedShare?.url === url &&
        navigator.canShare({ files: [preparedShare.file] })
      ) {
        await navigator.share({
          files: [preparedShare.file],
          title: "Share your FittList",
        });
        return;
      }
      if (canShareFiles) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Share image returned ${res.status}`);
        const f = new File([await res.blob()], file, { type: "image/png" });
        if (navigator.canShare({ files: [f] })) {
          await navigator.share({
            files: [f],
            title: "Share your FittList",
          });
          return;
        }
      }
      downloadImage(url, file);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") toast(`Couldn't share the ${failWord}`);
    } finally {
      setSharing(false);
    }
  };

  const imageShareActions = (url: string, file: string, failWord: string) => (
    <div className="shcta">
      <button
        className="btn si"
        disabled={
          sharing ||
          !shareCapabilityKnown ||
          (canShareFiles && !nativeShareAvailable && preparedShare?.url !== url && !prepareFailed)
        }
        onClick={() => shareImage(url, file, failWord)}
      >
        {sharing
          ? "Opening share sheet..."
          : !shareCapabilityKnown || (canShareFiles && !nativeShareAvailable && preparedShare?.url !== url && !prepareFailed)
            ? "Preparing..."
            : prepareFailed
              ? "Try sharing"
            : "Share"}
      </button>
    </div>
  );

  // The week as words, matching the picture exactly: same range, same hide
  // set, same studio names. Ends on the page link, because the text is a
  // door as well as an answer.
  const weekText = useMemo(() => {
    const kept = inRange.filter((it) => !effHide.has(it.key));
    const byDay = new Map<string, HubItem[]>();
    for (const it of kept) byDay.set(it.iso, [...(byDay.get(it.iso) ?? []), it]);
    const blocks = [...byDay.entries()].map(
      ([iso, list]) =>
        `${wday(iso)}, ${short(iso)}\n` +
        list.map((it) => `${it.time} ${it.name}${it.where ? ` · ${it.where}` : ""}`).join("\n"),
    );
    return [`My week, ${rangeLabel}`, ...blocks, `Full schedule: ${pageHost}/${handle}`].join("\n\n");
  }, [inRange, effHide, rangeLabel, pageHost, handle]);

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

  // Everyone gets the full sheet now, by Matt's call: a member's week is a
  // real thing to share since they build it here, and their profile card,
  // QR code and week-as-words are as real as a coach's. The only member
  // state without the segments is the start block, whose one job is the
  // first add.
  const segs: { id: Seg; label: string }[] = [
    { id: "week", label: "Schedule" },
    { id: "profile", label: "Profile" },
    { id: "qr", label: "QR code" },
    // The week as words is a subject of its own, by Matt's call: it sat
    // on the rail as a chip and reads better beside Profile and QR code,
    // because it is a different thing to send, not a knob on the picture.
    { id: "text", label: "Text" },
  ];
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
      {/* `shpage` is the marker the gradient opt-out keys on. */}
      <div className={`cardwrap shpage${embedded ? " shpage-embedded" : ""}`}>
        {!embedded && (
          <div className="shpage-back">
            <BackLink className="evback share-page-close" href="/calendar" anywhere label="Close share screen">
              <Icon name="close" size={24} />
            </BackLink>
          </div>
        )}
        {/* The start block, in place of an empty poster, by Matt's call:
            the picture of nothing pushed the one button that fixes it
            below the fold. Two lines and the button; the experiment talk
            and the feedback link came off, also by Matt's call. */}
        {building && (
          <div className="shstart">
            <h2>Add the classes you&rsquo;re taking this week</h2>
            <p>
              We&rsquo;ll turn them into a shareable schedule and keep them on your profile
              until they&rsquo;re over.
            </p>
            <button className="btn si" onClick={() => setAddOpen(true)}>
              Add a class
            </button>
          </div>
        )}
        {!building && (
          <div className="shseg">
            <select
              className="shseg-select"
              aria-label="What to share"
              value={seg}
              onChange={(event) => goSeg(event.target.value as Seg)}
            >
              {segs.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* The slides, one per segment, swiped between the way Spotify's
            share sheet swipes between the song card and the lyrics, by
            Matt's call: the next card peeks in from the edge, which is
            what says a swipe exists. A grab mid-ride cancels the pill
            tap's claim on the scroll. */}
        {!building && (
        <div
          className="shslides"
          ref={slidesRef}
          onScroll={onSlides}
          onTouchStart={() => (rideTo.current = null)}
        >
          <div className="shslide" aria-hidden={seg !== "week"}>
            <SlideImg cls="shprev shprev-week" src={weekImgUrl} alt="Your week as a story image" />
          </div>
          <div className="shslide" aria-hidden={seg !== "profile"}>
            <SlideImg cls="shprev shprev-sq" src={cardImgUrl} alt="Your profile card" />
          </div>
          <div className="shslide" aria-hidden={seg !== "qr"}>
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
          <div className="shslide" aria-hidden={seg !== "text"}>
            <pre className="shtext">{weekText}</pre>
          </div>
        </div>
        )}

        {!building && (seg === "week" || seg === "profile") && (
          <div className="shctrls">
            {seg === "week" ? (
              <>
                {/* The rail of what the picture says: its range, its roster,
                    its words. Each chip is a small labelled door to a sheet.
                    A member's rail leads with the add in brand, by Matt's
                    call: growing the week is this screen's first action, so
                    the loud chip is the one that does it. */}
                {/* "another", because this chip only exists once the first
                    add has landed: the start block owns the first one. */}
                {!coach && (
                  <button className="shctrl shctrl-add" onClick={() => setAddOpen(true)}>
                    + Add another class
                  </button>
                )}
                <button className="shctrl" onClick={() => { setColorMenuOpen(false); setPick("color"); }}>
                  <span className="shctrl-k">Background</span>
                  <span className="shctrl-v">{background ? "Photo" : STORY_THEMES[themeId].label}</span>
                </button>
                {/* A complete visual style follows the background: the
                    picture's surface is the first decision people see. */}
                <button className="shctrl" onClick={() => setPick("layout")}>
                  <span className="shctrl-k">Style</span>
                  <span className="shctrl-v">{STORY_STYLES[styleId].label}</span>
                </button>
                <input
                  ref={backgroundRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) chooseBackground(file);
                    event.currentTarget.value = "";
                  }}
                />
                <button className="shctrl" onClick={() => setPick("classes")}>
                  <span className="shctrl-k">Classes</span>
                  <span className="shctrl-v">
                    {hatRows.length === 0 ? "None in range" : `${shown} of ${hatRows.length} showing`}
                  </span>
                </button>
                <button className="shctrl" onClick={() => setPick("dates")}>
                  <span className="shctrl-k">Dates</span>
                  <span className="shctrl-v">{rangeLabel}</span>
                </button>
                <button className="shctrl" onClick={() => setPick("message")}>
                  <span className="shctrl-k">Headline</span>
                  <span className="shctrl-v">
                    {noHead ? "None" : headline.trim() || (coach ? "Train with me." : "Come with me.")}
                  </span>
                </button>
              </>
            ) : (
              <button className="shctrl" onClick={() => { setColorMenuOpen(false); setPick("color"); }}>
                <span className="shctrl-k">Color</span>
                <span className="shctrl-v">{STORY_THEMES[themeId].label}</span>
              </button>
            )}
          </div>
        )}

        {!building && (seg === "week" || seg === "profile") &&
          imageShareActions(imgUrl, fileName, seg === "week" ? "picture" : "card")}

        {!building && seg === "qr" && imageShareActions(qrUrl, qrFileName, "QR code")}

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

      {pick === "color" && (
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
            <h2>{seg === "week" ? "Background" : "Color"}</h2>
            <p className="lead">
              {seg === "week" ? "Choose a color or use one of your photos." : "Choose a color for your profile card."}
            </p>
            <div className={`shbackground-choices${seg === "week" ? "" : " single"}`}>
              <button
                type="button"
                className={`shbackground-choice${seg !== "week" || !background ? " on" : ""}`}
                aria-pressed={seg !== "week" || !background}
                aria-haspopup="dialog"
                disabled={backgroundBusy}
                onClick={() => setColorMenuOpen(true)}
              >
                <span className="shbackground-choice-top">
                  <span className="shcolor-preview shbackground-preview" style={{ background: STORY_THEMES[themeId].bg }} />
                  {(seg !== "week" || !background) && <Icon name="check" size={20} />}
                </span>
                <strong>Color</strong>
                <span>{STORY_THEMES[themeId].label}</span>
              </button>
              {seg === "week" && (
                <button
                  type="button"
                  className={`shbackground-choice${background ? " on" : ""}`}
                  aria-pressed={!!background}
                  disabled={backgroundBusy}
                  onClick={() => backgroundRef.current?.click()}
                >
                  <span className="shbackground-choice-top">
                    <span className="shbackground-image-preview"><Icon name="image" size={24} /></span>
                    {background && <Icon name="check" size={20} />}
                  </span>
                  <strong>Photo</strong>
                  <span>{background ? "Photo selected" : "Choose from photos"}</span>
                </button>
              )}
            </div>
            {seg === "week" && background && (
              <button className="shbackground-remove" disabled={backgroundBusy} onClick={() => void removeBackground()}>
                Remove photo
              </button>
            )}
          </div>
        </div>
      )}

      {pick === "color" && colorMenuOpen && (
        <div
          className="sheet-scrim shcolor-sheet-scrim"
          onClick={(event) => {
            if (event.target === event.currentTarget) setColorMenuOpen(false);
          }}
        >
          <div className="sheet shcolor-sheet" role="dialog" aria-modal="true" aria-labelledby="shcolor-title">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setColorMenuOpen(false)}>
              <Icon name="close" size={18} />
            </button>
            <h2 id="shcolor-title">Choose a color</h2>
            <div className="shcolor-sheet-list" role="listbox" aria-label="Background color">
              {(Object.entries(STORY_THEMES) as [StoryThemeId, (typeof STORY_THEMES)["paper"]][]).map(([id, theme]) => (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={id === themeId}
                  onClick={() => {
                    setColorMenuOpen(false);
                    if (seg === "week") void chooseColorBackground(id);
                    else {
                      setThemeId(id);
                      setPick(null);
                    }
                  }}
                >
                  <span className="shcolor-preview" style={{ background: theme.bg }} />
                  <span>{theme.label}</span>
                  {id === themeId && <Icon name="check" size={18} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {pick === "layout" && (
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
            <h2>Style</h2>
            <p className="lead">Choose a complete starting style. You can still change its color and type afterward.</p>
            <div className="settingslist layoutlist">
              {(Object.entries(STORY_STYLES) as [StoryStyleId, (typeof STORY_STYLES)["plain"]][]).filter(
                ([id]) => id !== "cowboy",
              ).map(
                ([id, style]) => {
                  const on = id === styleId;
                  return (
                    <button
                      key={id}
                      className="setrow layoutpick"
                      data-layout={id}
                      aria-pressed={on}
                      onClick={() => {
                        setStyleId(id);
                        setThemeId(style.theme);
                        setTypeId(style.typeface);
                        setDecoId(style.decoration);
                        setHsize(style.headlineSize);
                        setSlider(style.headlineSize);
                        setPick(null);
                      }}
                    >
                      <span className={`layoutmini layoutmini-${id}`} aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                      <span className="setrow-txt">
                        <span className="t">{style.label}</span>
                        <span className="s">{style.description}</span>
                      </span>
                      {on && (
                        <span className="setrow-ic">
                          <Icon name="check" size={20} />
                        </span>
                      )}
                    </button>
                  );
                },
              )}
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
            {/* Off means none at all, and the knobs below go with it: a
                slider for words that aren't there is a control that lies. */}
            <button
              className="setrow"
              aria-pressed={!noHead}
              onClick={() => setNoHead((v) => !v)}
            >
              <span className="setrow-txt">
                <span className="t">Show a headline</span>
              </span>
              <span className={`switch${!noHead ? " on" : ""}`} aria-hidden="true">
                <span className="switch-knob" />
              </span>
            </button>
            {!noHead && (
              <>
                <label className="flabel" htmlFor="shMsg">
                  Your words
                </label>
                <input
                  id="shMsg"
                  className="editinput"
                  value={headline}
                  maxLength={44}
                  placeholder={coach ? "Train with me." : "Come with me."}
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
                  onPointerUp={(e) => setHsize(Number(e.currentTarget.value))}
                  onKeyUp={(e) => setHsize(Number(e.currentTarget.value))}
                  onTouchEnd={(e) => setHsize(Number(e.currentTarget.value))}
                  onBlur={(e) => setHsize(Number(e.currentTarget.value))}
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
              </>
            )}
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
              Untick one to leave it off the picture. Your schedule keeps it.
            </p>
            {/* Which hat, never both, by Matt's call: the picture is the
                classes you coach or the ones you added, and the segment
                picks. The other hat's rows leave the list as well as the
                picture, so the ticks below are a within-hat choice. */}
            {twoHats && (
              <div className="shdays shcuts" role="group" aria-label="Which classes">
                {(
                  [
                    ["coaching", "Coaching"],
                    ["saved", "Saved"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    className={`shday${hat === id ? " on" : ""}`}
                    onClick={() => setHat(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="settingslist shpick-list">
              {hatRows.length === 0 && <p className="empty">Nothing in this range yet.</p>}
              {hatRows.map((it) => {
                const off = hide.has(it.key);
                return (
                  // The tick and the edit are two buttons in one row, and
                  // siblings on purpose: a button inside a button is not a
                  // thing. The edit only exists on the member's own rows; a
                  // mark points at somebody else's class, which the coach
                  // keeps.
                  <div key={it.key} className="shpick-row">
                    <button
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
                        <span className="shpick-titleline">
                          <span className="t">{it.name}</span>
                          <span className={`shclass-tag ${it.coaching ? "coaching" : "saved"}`}>
                            {it.coaching ? "Coaching" : "Saved"}
                          </span>
                        </span>
                        <span className="s">
                          {wday(it.iso)}, {short(it.iso)} · {it.time}
                        </span>
                      </span>
                    </button>
                    {it.own && (
                      <button
                        className="shpick-editbtn"
                        aria-label={`Edit ${it.name}`}
                        disabled={editBusy}
                        onClick={() => openEdit(it)}
                      >
                        <Icon name="edit" size={18} />
                      </button>
                    )}
                  </div>
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
            toast("Saved to your week");
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

      {edit && (
        <Adder
          studios={studios}
          templates={templates}
          customTypes={customTypes}
          lastUsed={lastUsed}
          subsCount={0}
          firstPublish={false}
          personal={{ canCoach: false, editId: edit.id }}
          prefill={edit.prefill}
          onClose={() => setEdit(null)}
          onToast={toast}
          onPublished={() => {
            setEdit(null);
            toast("Saved");
            refreshWeek();
          }}
          onDeleted={(msg) => {
            setEdit(null);
            toast(msg);
            refreshWeek();
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
                    toast("Saved to your week");
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

      {intro && (
        <div className="sheet-scrim">
          <div className="sheet confirmsheet shareintro">
            <h2>Your week lives here</h2>
            <p className="lead">
              Everything you save lands on this picture. Share it as a story, a
              link or a QR code, and the people you train with can come along.
            </p>
            <button
              className="btn si"
              onClick={() => {
                try {
                  localStorage.setItem("fl-share-intro", "1");
                } catch {
                  // Private mode: it may show once more, which is survivable.
                }
                setIntro(false);
              }}
            >
              Continue
            </button>
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
