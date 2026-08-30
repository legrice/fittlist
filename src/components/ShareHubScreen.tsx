"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
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
import { loadCalendarComposerData, type CalendarComposerData } from "@/app/actions/calendar-data";
import { setStoryBackground } from "@/app/actions/profile";
import {
  deleteSavedStoryLook,
  saveDefaultStoryDesign,
  saveNamedStoryLook,
} from "@/app/actions/share-design";
import { recordShareImageExport } from "@/app/actions/product-activity";
import { setGoing } from "@/app/actions/going";
import type { AdderPrefill } from "@/components/Adder";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { InstagramTagPrompt } from "@/components/InstagramTagPrompt";
import { readPhoto } from "@/lib/photo";
import {
  DEFAULT_SHARE_DESIGN,
  sanitizeShareDesign,
  type SavedStoryLook,
  type ShareDesign,
} from "@/lib/share-design";
import {
  invalidateClientMemory,
  loadClientMemory,
  readClientMemory,
  writeClientMemory,
} from "@/lib/client-memory";

const loadAdderModule = () => import("@/components/Adder");
const Adder = dynamic(() => loadAdderModule().then((module) => module.Adder));
type PersonalDetail = NonNullable<Awaited<ReturnType<typeof personalDetail>>>;

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
type EditorSnapshot = {
  design: ShareDesign;
  headline: string;
  from: string;
  days: number;
  hidden: string[];
  hat: "coaching" | "saved";
  featuredKey: string | null;
};

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

const shortFormatter = new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", timeZone:"UTC" });
const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday:"short", timeZone:"UTC" });
const short = (iso: string) => shortFormatter.format(new Date(`${iso}T00:00:00Z`));
const wday = (iso: string) => weekdayFormatter.format(new Date(`${iso}T00:00:00Z`));
const plusDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export function ShareHubScreen({
  embedded = false,
  tabbed = false,
  coach,
  handle,
  name,
  items,
  defaultFrom,
  today,
  savedHeadline,
  hasBackground,
  studios,
  templates,
  customTypes,
  lastUsed,
  initialRevision,
  initialDesign,
  savedLooks: initialSavedLooks,
  deferAdderData = false,
}: {
  /** Render inside another surface (the calendar's share sheet). The sheet
   *  owns dismissal, so the editor does not add a second back control. */
  embedded?: boolean;
  /** Keep the route inside the persistent app navigation. */
  tabbed?: boolean;
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
  /** Whether a reusable background photo is already stored. */
  hasBackground: boolean;
  /** The adder's ingredients, loaded only for a member: their hub carries
   *  the personal adder, because building the week is what the tab is for. */
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
  /** Server-created once per screen load so SSR and hydration use one image URL. */
  initialRevision: number;
  /** The account-level default chosen with Save this look. */
  initialDesign: ShareDesign | null;
  /** Reusable named looks, such as Teaching week or Weekend plans. */
  savedLooks: SavedStoryLook[];
  /** Route tabs defer member-only class tools until Add or Edit is used. */
  deferAdderData?: boolean;
}) {
  const router = useRouter();
  const rememberedDesign = useRef(
    readClientMemory<ShareDesign>(`share-design-draft:${handle}`),
  ).current;
  const startingDesign = useRef(
    sanitizeShareDesign(
      rememberedDesign ?? initialDesign ?? {
        ...DEFAULT_SHARE_DESIGN,
        useBackgroundPhoto: hasBackground,
      },
    ),
  ).current;
  const resetDesignRef = useRef(startingDesign);
  const [seg, setSeg] = useState<Seg>("week");
  const [themeId, setThemeId] = useState<StoryThemeId>(startingDesign.themeId);
  const [styleId, setStyleId] = useState<StoryStyleId>(startingDesign.styleId);
  const [from, setFrom] = useState(defaultFrom);
  const [days, setDays] = useState(7);
  const [hide, setHide] = useState<Set<string>>(new Set());
  const [draftFrom, setDraftFrom] = useState(defaultFrom);
  const [draftDays, setDraftDays] = useState(7);
  const [draftHide, setDraftHide] = useState<Set<string>>(new Set());
  // The words at the top of the poster. Sent explicitly on every request
  // (the composer's old doctrine): letting the route fall back to saved
  // prefs would let the chip and the picture disagree.
  const [headline, setHeadline] = useState(savedHeadline);
  const [draftHeadline, setDraftHeadline] = useState(savedHeadline);
  const [background, setBackground] = useState(hasBackground && startingDesign.useBackgroundPhoto);
  const [photoAvailable, setPhotoAvailable] = useState(hasBackground);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const backgroundRef = useRef<HTMLInputElement>(null);
  const [photoX, setPhotoX] = useState(startingDesign.photoX);
  const [photoY, setPhotoY] = useState(startingDesign.photoY);
  const [photoOverlay, setPhotoOverlay] = useState(startingDesign.overlay);
  const [draftPhotoX, setDraftPhotoX] = useState(startingDesign.photoX);
  const [draftPhotoY, setDraftPhotoY] = useState(startingDesign.photoY);
  const [draftPhotoOverlay, setDraftPhotoOverlay] = useState(startingDesign.overlay);
  // Off means no headline at all, by Matt's call: the picture is the week
  // alone. Its own switch rather than an empty field, because an empty
  // field falls back to the stock words on purpose.
  const [noHead, setNoHead] = useState(startingDesign.noHead);
  const [draftNoHead, setDraftNoHead] = useState(startingDesign.noHead);
  // The poster's voice, picked by personality: see typefaces.ts.
  const [typeId, setTypeId] = useState<TypeFaceId>(startingDesign.typeId);
  const [draftTypeId, setDraftTypeId] = useState<TypeFaceId>(startingDesign.typeId);
  // The headline's loudness, in percent. hsize is what the picture reads;
  // The draft slider stays local to its sheet, so dragging never queues a
  // server render per pixel. Done commits one final image.
  const [hsize, setHsize] = useState(startingDesign.headlineSize);
  const [draftSlider, setDraftSlider] = useState(startingDesign.headlineSize);
  // The dressing: the top bar (the default), frames and day dividers.
  // See decorations.ts.
  const [decoId, setDecoId] = useState<DecoId>(startingDesign.decoId);
  const [pick, setPick] = useState<
    null | "dates" | "classes" | "message" | "layout" | "color"
  >(null);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [shareCapabilityKnown, setShareCapabilityKnown] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [instagramPromptOpen, setInstagramPromptOpen] = useState(false);
  const closeInstagramPrompt = useCallback(() => setInstagramPromptOpen(false), []);
  const [preparedShare, setPreparedShare] = useState<{ url: string; file: File } | null>(null);
  const [prepareFailed, setPrepareFailed] = useState(false);
  const [pageHost, setPageHost] = useState("fittlist.co");
  // One buster per visit, bumped after an add: the week changes behind the
  // picture the moment a class lands, and a cached preview of the week
  // before is a lie waiting to be posted.
  const [bust, setBust] = useState(initialRevision);
  const backgroundPreviewUrl = photoAvailable ? `/api/story/background?v=${bust}` : null;
  // The member's build flow: the adder, and the "that class is on fittlist"
  // offer that comes back from it.
  const [addOpen, setAddOpen] = useState(false);
  const [adderBusy, setAdderBusy] = useState(false);
  const [adderData, setAdderData] = useState<CalendarComposerData | null>(() => deferAdderData
    ? readClientMemory<CalendarComposerData>("calendar-composer")
    : {
        studios,
        templates,
        customTypes,
        lastUsed,
        subsCount:0,
      });
  const adderPromise = useRef<Promise<CalendarComposerData | null> | null>(null);
  const [match, setMatch] = useState<{ m: PersonalMatch; again: () => void } | null>(null);
  const [matchBusy, setMatchBusy] = useState(false);
  // Editing one of your own from the Classes sheet: the same form, opened
  // on the row's saved details.
  const [edit, setEdit] = useState<{ id: string; prefill: AdderPrefill } | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [featuredKey, setFeaturedKey] = useState<string | null>(null);
  const [draftFeaturedKey, setDraftFeaturedKey] = useState<string | null>(null);
  const [savedLooks, setSavedLooks] = useState(initialSavedLooks);
  const [savingLook, setSavingLook] = useState(false);
  const [lookName, setLookName] = useState("");
  const [designSaving, setDesignSaving] = useState(false);
  const [undoStack, setUndoStack] = useState<EditorSnapshot[]>([]);

  useEffect(() => {
    if (adderData) writeClientMemory("calendar-composer", adderData);
  }, [adderData]);

  const ensureAdderData = async () => {
    if (adderData) return adderData;
    if (!adderPromise.current) {
      adderPromise.current = loadClientMemory("calendar-composer", () => loadCalendarComposerData(false));
    }
    const loaded = await adderPromise.current;
    adderPromise.current = null;
    if (loaded) setAdderData(loaded);
    return loaded;
  };
  const openAdder = async () => {
    if (adderBusy) return;
    if (adderData) {
      setAddOpen(true);
      return;
    }
    setAdderBusy(true);
    try {
      const [, tools] = await Promise.all([loadAdderModule(), ensureAdderData()]);
      if (tools) setAddOpen(true);
      else toast("Couldn't load your class tools");
    } catch {
      toast("Couldn't load your class tools");
    } finally {
      setAdderBusy(false);
    }
  };

  const openEdit = async (it: HubItem) => {
    if (editBusy) return;
    setEditBusy(true);
    const id = it.key.split(".")[0];
    try {
      const detailKey = `personal-detail:${id}`;
      const remembered = readClientMemory<PersonalDetail>(detailKey);
      const [d, tools] = await Promise.all([
        remembered ?? loadClientMemory(detailKey, () => personalDetail(id)),
        ensureAdderData(),
        loadAdderModule(),
      ]);
      if (!d) {
        toast("That class isn't there any more");
        refreshWeek();
        return;
      }
      if (!tools) {
        toast("Couldn't load your class tools");
        return;
      }
      writeClientMemory(detailKey, d);
      // A cache hit opens the editor without waiting. Refresh its remembered
      // source quietly for the next visit, without moving fields under the
      // user's fingers after the form is already on screen.
      if (remembered) void loadClientMemory(detailKey, () => personalDetail(id));
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
    } catch {
      toast("Couldn't open that class");
    } finally {
      setEditBusy(false);
    }
  };
  const [toastMsg, toastOn, toast] = useToast();

  const chooseBackground = (file: File) => {
    if (backgroundBusy) return;
    setBackgroundBusy(true);
    readPhoto(
      file,
      async (dataUrl) => {
        try {
          const result = await setStoryBackground(dataUrl);
          if (!result.ok || !result.background) {
            toast(result.error ?? "Couldn't add that background");
            return;
          }
          pushUndo();
          setPhotoAvailable(true);
          setBackground(true);
          setPhotoX(50);
          setPhotoY(50);
          setPhotoOverlay(24);
          setDraftPhotoX(50);
          setDraftPhotoY(50);
          setDraftPhotoOverlay(24);
          setBust(Date.now());
          toast("Photo added. Position it below.");
        } catch {
          toast("Couldn't add that background");
        } finally {
          setBackgroundBusy(false);
        }
      },
      () => {
        setBackgroundBusy(false);
        toast("That photo format isn't supported");
      },
    );
  };

  const removeBackground = async () => {
    if (backgroundBusy) return;
    const previous = background;
    const previousAvailable = photoAvailable;
    setBackground(false);
    setPhotoAvailable(false);
    setBust(Date.now());
    setPick(null);
    setBackgroundBusy(true);
    try {
      const result = await setStoryBackground(null);
      if (result.ok) {
        toast("Photo deleted");
        return;
      }
      setBackground(previous);
      setPhotoAvailable(previousAvailable);
      setBust(Date.now());
      toast(result.error ?? "Couldn't remove the background");
    } catch {
      setBackground(previous);
      setPhotoAvailable(previousAvailable);
      setBust(Date.now());
      toast("Couldn't remove the background");
    } finally {
      setBackgroundBusy(false);
    }
  };

  const chooseColorBackground = (id: StoryThemeId) => {
    if (backgroundBusy) return;
    pushUndo();
    setThemeId(id);
    setBackground(false);
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
    if (embedded || tabbed) return;
    window.dispatchEvent(new CustomEvent("fittlist:takeover", { detail: true }));
    return () => {
      window.dispatchEvent(new CustomEvent("fittlist:takeover", { detail: false }));
    };
  }, [embedded, tabbed]);

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
  const [draftHat, setDraftHat] = useState<"coaching" | "saved">("coaching");
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
  const draftHatRows = twoHats
    ? inRange.filter((it) => (draftHat === "coaching" ? it.coaching : !it.coaching))
    : inRange;

  const shown = inRange.filter((it) => !effHide.has(it.key)).length;

  const currentDesign = useMemo(
    () => sanitizeShareDesign({
      styleId,
      themeId,
      typeId,
      decoId,
      headlineSize:hsize,
      noHead,
      useBackgroundPhoto:background && photoAvailable,
      photoX,
      photoY,
      overlay:photoOverlay,
    }),
    [
      background,
      decoId,
      hsize,
      noHead,
      photoAvailable,
      photoOverlay,
      photoX,
      photoY,
      styleId,
      themeId,
      typeId,
    ],
  );

  // Returning to Share keeps the work-in-progress look instantly. Save this
  // look below is the deliberate cross-session/account action; this short
  // memory is what makes an accidental tab switch harmless.
  useEffect(() => {
    writeClientMemory(`share-design-draft:${handle}`, currentDesign);
  }, [currentDesign, handle]);

  useEffect(() => {
    if (featuredKey && !items.some((item) => item.key === featuredKey)) setFeaturedKey(null);
  }, [featuredKey, items]);

  const captureSnapshot = (): EditorSnapshot => ({
    design:currentDesign,
    headline,
    from,
    days,
    hidden:[...hide],
    hat,
    featuredKey,
  });

  const pushUndo = () => {
    const snapshot = captureSnapshot();
    setUndoStack((current) => [...current.slice(-19), snapshot]);
  };

  const applyDesign = (design: ShareDesign) => {
    const safe = sanitizeShareDesign(design);
    setStyleId(safe.styleId);
    setThemeId(safe.themeId);
    setTypeId(safe.typeId);
    setDecoId(safe.decoId);
    setHsize(safe.headlineSize);
    setNoHead(safe.noHead);
    setBackground(photoAvailable && safe.useBackgroundPhoto);
    setPhotoX(safe.photoX);
    setPhotoY(safe.photoY);
    setPhotoOverlay(safe.overlay);
  };

  const restoreSnapshot = (snapshot: EditorSnapshot) => {
    applyDesign(snapshot.design);
    setHeadline(snapshot.headline);
    setFrom(snapshot.from);
    setDays(snapshot.days);
    setHide(new Set(snapshot.hidden));
    setHat(snapshot.hat);
    setFeaturedKey(snapshot.featuredKey);
  };

  const undoLast = () => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setUndoStack((current) => current.slice(0, -1));
    restoreSnapshot(previous);
  };

  const resetDesign = () => {
    pushUndo();
    applyDesign(resetDesignRef.current);
    setFeaturedKey(null);
  };

  const applyCompleteStyle = (id: StoryStyleId) => {
    const style = STORY_STYLES[id];
    setStyleId(id);
    setThemeId(style.theme);
    setTypeId(style.typeface);
    setDecoId(style.decoration);
    setHsize(style.headlineSize);
    setBackground(false);
  };

  const remix = () => {
    const choices = (Object.keys(STORY_STYLES) as StoryStyleId[]).filter(
      (id) => id !== "cowboy" && id !== styleId,
    );
    const next = choices[Math.floor(Math.random() * choices.length)] ?? "plain";
    pushUndo();
    applyCompleteStyle(next);
  };

  const hideParam = [...effHide].join(",");
  // Both pictures at once now, because both slides are on screen: the
  // carousel is what makes swiping between them a thing.
  const rawWeekImgUrl =
    `/api/story/compose?theme=${themeId}&style=${styleId}&from=${from}&days=${days}&photo=0&bg=${background ? 1 : 0}` +
    `&headline=${encodeURIComponent(headline)}&type=${typeId}&hs=${hsize}&deco=${decoId}` +
    `&nohead=${noHead ? 1 : 0}&bx=${photoX}&by=${photoY}&bo=${photoOverlay}` +
    `${featuredKey ? `&feature=${encodeURIComponent(featuredKey)}` : ""}` +
    `${hideParam ? `&hide=${encodeURIComponent(hideParam)}` : ""}&v=${bust}-${themeId}-${styleId}-${background ? "photo" : "plain"}`;
  const rawCardImgUrl = `/api/card/${handle}?theme=${themeId}&v=${bust}-${themeId}`;
  // An offscreen carousel card keeps the last image it successfully showed.
  // A week edit should not also redraw the hidden profile card, and vice versa.
  const [restingWeekImgUrl, setRestingWeekImgUrl] = useState(rawWeekImgUrl);
  const [restingCardImgUrl, setRestingCardImgUrl] = useState<string | null>(null);
  const weekImgUrl = seg === "week" ? rawWeekImgUrl : restingWeekImgUrl;
  const cardImgUrl = seg === "profile" ? rawCardImgUrl : restingCardImgUrl;
  useEffect(() => { if (seg === "week") setRestingWeekImgUrl(rawWeekImgUrl); }, [rawWeekImgUrl, seg]);
  useEffect(() => { if (seg === "profile") setRestingCardImgUrl(rawCardImgUrl); }, [rawCardImgUrl, seg]);
  const imgUrl = seg === "week" ? weekImgUrl : cardImgUrl ?? rawCardImgUrl;
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
  const readyImages = useRef(new Set<string>());
  const [readyImageVersion, setReadyImageVersion] = useState(0);
  const markImageReady = useCallback((url: string) => {
    if (readyImages.current.has(url)) return;
    readyImages.current.add(url);
    setReadyImageVersion((version) => version + 1);
  }, []);
  useEffect(() => {
    if (seg === "text" || nativeShareAvailable || !canShareFiles || !readyImages.current.has(activeShareUrl)) return;
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
  }, [activeShareFile, activeShareUrl, canShareFiles, nativeShareAvailable, readyImageVersion, seg]);

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

  const shareImage = async (
    url: string,
    file: string,
    failWord: string,
    offerInstagramReshare = false,
  ) => {
    if (sharing) return;
    setSharing(true);
    const shared = () => {
      void recordShareImageExport();
      if (offerInstagramReshare) setInstagramPromptOpen(true);
    };
    try {
      if (nativeShare(url, file)) {
        shared();
        return;
      }
      if (
        canShareFiles &&
        preparedShare?.url === url &&
        navigator.canShare({ files: [preparedShare.file] })
      ) {
        await navigator.share({
          files: [preparedShare.file],
          title: "Share your FittList",
        });
        shared();
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
          shared();
          return;
        }
      }
      downloadImage(url, file);
      shared();
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") toast(`Couldn't share the ${failWord}`);
    } finally {
      setSharing(false);
    }
  };

  const imageShareActions = (
    url: string,
    file: string,
    failWord: string,
    offerInstagramReshare = false,
  ) => (
    <div className="shcta">
      <button
        className="btn si"
        disabled={
          sharing ||
          !shareCapabilityKnown ||
          (canShareFiles && !nativeShareAvailable && preparedShare?.url !== url && !prepareFailed)
        }
        onClick={() => shareImage(url, file, failWord, offerInstagramReshare)}
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

  const saveCurrentDesign = async () => {
    if (designSaving || backgroundBusy) return;
    setDesignSaving(true);
    try {
      const result = await saveDefaultStoryDesign(currentDesign);
      if (!result.ok) {
        toast(result.error);
        return;
      }
      writeClientMemory(`share-design-draft:${handle}`, result.design);
      resetDesignRef.current = result.design;
      toast("Look saved for next time");
    } catch {
      toast("Couldn't save this look");
    } finally {
      setDesignSaving(false);
    }
  };

  const saveNamedLook = async () => {
    if (designSaving || backgroundBusy || !lookName.trim()) return;
    setDesignSaving(true);
    try {
      const result = await saveNamedStoryLook({ name:lookName, design:currentDesign });
      if (!result.ok) {
        toast(result.error);
        return;
      }
      setSavedLooks(result.savedLooks);
      setLookName("");
      setSavingLook(false);
      toast(`${result.look.name} saved`);
    } catch {
      toast("Couldn't save that look");
    } finally {
      setDesignSaving(false);
    }
  };

  const removeNamedLook = async (id: string) => {
    if (designSaving || backgroundBusy) return;
    setDesignSaving(true);
    try {
      const result = await deleteSavedStoryLook(id);
      if (!result.ok) {
        toast(result.error);
        return;
      }
      setSavedLooks(result.savedLooks);
      toast("Saved look removed");
    } catch {
      toast("Couldn't remove that look");
    } finally {
      setDesignSaving(false);
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
  const slideFrame = useRef<number | null>(null);
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
    if (slideFrame.current !== null) return;
    slideFrame.current = window.requestAnimationFrame(() => {
      slideFrame.current = null;
      const el = slidesRef.current;
      if (!el) return;
      const i = nearestSlide(el);
      if (rideTo.current !== null) {
        if (i === rideTo.current) rideTo.current = null;
        return;
      }
      const id = segs[i]?.id;
      if (id && id !== seg) setSeg(id);
    });
  };
  useEffect(() => () => {
    if (slideFrame.current !== null) window.cancelAnimationFrame(slideFrame.current);
  }, []);

  return (
    <>
      {/* `shpage` is the marker the gradient opt-out keys on. */}
      <div className={`cardwrap shpage${!building ? " shpage-editor" : ""}${embedded ? " shpage-embedded" : ""}${tabbed ? " shpage-tabbed" : ""}`}>
        {!embedded && !tabbed && (
          <div className="shpage-back">
            <BackLink className="evback share-page-close" href="/calendar" anywhere label="Close share screen">
              <Icon name="close" size={24} />
            </BackLink>
          </div>
        )}
        {tabbed && (
          <header className="share-tab-header">
            <h1>Share</h1>
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
              <Icon className="shseg-chevron" name="expand_more" size={20} />
            </div>
          </header>
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
            <button className="btn si" disabled={adderBusy} onClick={() => void openAdder()}>
              {adderBusy ? "Loading class tools..." : "Add a class"}
            </button>
          </div>
        )}
        {!building && !tabbed && (
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
            <Icon className="shseg-chevron" name="expand_more" size={20} />
          </div>
        )}

        {!building && (
          <section className={`sheditor-shell sheditor-${seg}`} aria-label={`${segs.find((subject) => subject.id === seg)?.label ?? "Share"} editor`}>
            {/* The preview stays a direct-child carousel: swiping still changes
                the subject, while the dark stage gives the artwork a canvas
                instead of letting controls compete with it. */}
            <div className="sheditor-stage">
              <div
                className="shslides"
                ref={slidesRef}
                onScroll={onSlides}
                onTouchStart={() => (rideTo.current = null)}
              >
                <div className="shslide" aria-hidden={seg !== "week"}>
                  <SlideImg cls="shprev shprev-week" src={weekImgUrl} alt="Your week as a story image" onReady={markImageReady} />
                </div>
                <div className="shslide" aria-hidden={seg !== "profile"}>
                  <SlideImg cls="shprev shprev-sq" src={cardImgUrl} alt="Your profile card" onReady={markImageReady} />
                </div>
                <div className="shslide" aria-hidden={seg !== "qr"}>
                  <div className="qrcard">
                    <div className="qrcard-nm">{name}</div>
                    <div className="qrframe">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="qrimg" src={qrUrl} alt="QR code that opens your fittlist page" loading="lazy" onLoad={() => markImageReady(qrUrl)} />
                    </div>
                    <div className="qrurl">{pageHost}/{handle}</div>
                  </div>
                </div>
                <div className="shslide" aria-hidden={seg !== "text"}>
                  <pre className="shtext">{weekText}</pre>
                </div>
              </div>
            </div>

            {/* The dock borrows the reference's studio hierarchy, but every
                tool is one the FittList picture already understands. Detailed
                editing still opens the familiar focused sheets. */}
            <div className={`sheditor-dock sheditor-dock-${seg}`}>
              {seg === "week" && (
                <>
                  <div className="sheditor-tools sheditor-tools-primary" aria-label="Creative tools">
                    <StudioTool icon="auto_awesome" label="Remix" detail="New look" accent onClick={remix} />
                    <StudioTool
                      icon="image"
                      label="Background"
                      detail={background ? "Photo" : STORY_THEMES[themeId].label}
                      onClick={() => {
                        setDraftPhotoX(photoX);
                        setDraftPhotoY(photoY);
                        setDraftPhotoOverlay(photoOverlay);
                        setColorMenuOpen(false);
                        setPick("color");
                      }}
                    />
                    <StudioTool
                      icon="palette"
                      label="Style"
                      detail={STORY_STYLES[styleId].label}
                      onClick={() => setPick("layout")}
                    />
                  </div>

                  <div className="shstyle-rail" role="group" aria-label="Quick styles">
                    {(Object.entries(STORY_STYLES) as [StoryStyleId, (typeof STORY_STYLES)["plain"]][]).filter(
                      ([id]) => id !== "cowboy",
                    ).map(([id, style]) => (
                      <button
                        key={id}
                        type="button"
                        className="shstyle-option"
                        aria-pressed={id === styleId}
                        onClick={() => {
                          if (id === styleId) return;
                          pushUndo();
                          applyCompleteStyle(id);
                        }}
                      >
                        <span className={`layoutmini layoutmini-${id}`} aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                        <span>{style.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="sheditor-tools sheditor-tools-details" aria-label="Schedule and copy tools">
                    <StudioTool
                      icon="list"
                      label="Classes"
                      detail={hatRows.length === 0 ? "None" : `${shown} of ${hatRows.length}`}
                      onClick={() => {
                        setDraftHide(new Set(hide));
                        setDraftHat(hat);
                        setDraftFeaturedKey(featuredKey);
                        setPick("classes");
                      }}
                    />
                    <StudioTool
                      icon="calendar_month"
                      label="Dates"
                      detail={rangeLabel}
                      onClick={() => {
                        setDraftFrom(from);
                        setDraftDays(days);
                        setPick("dates");
                      }}
                    />
                    <StudioTool
                      icon="edit"
                      label="Headline"
                      detail={noHead ? "None" : headline.trim() || (coach ? "Train with me." : "Come with me.")}
                      onClick={() => {
                        setDraftHeadline(headline);
                        setDraftNoHead(noHead);
                        setDraftTypeId(typeId);
                        setDraftSlider(hsize);
                        setPick("message");
                      }}
                    />
                    {!coach && (
                      <StudioTool
                        icon="add"
                        label={adderBusy ? "Loading" : "Add class"}
                        detail="Build your week"
                        disabled={adderBusy}
                        onClick={() => void openAdder()}
                      />
                    )}
                  </div>

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

                  <div className="shdesign-actions" aria-label="Design actions">
                    <button type="button" disabled={undoStack.length === 0} onClick={undoLast}>Undo</button>
                    <button type="button" onClick={resetDesign}>Reset</button>
                    <button type="button" disabled={designSaving || backgroundBusy} onClick={() => void saveCurrentDesign()}>
                      {designSaving ? "Saving..." : "Save this look"}
                    </button>
                  </div>
                  {imageShareActions(imgUrl, fileName, "picture", true)}
                </>
              )}

              {seg === "profile" && (
                <>
                  <div className="sheditor-tools sheditor-tools-single" aria-label="Profile card tools">
                    <StudioTool
                      icon="palette"
                      label="Color"
                      detail={STORY_THEMES[themeId].label}
                      onClick={() => {
                        setColorMenuOpen(false);
                        setPick("color");
                      }}
                    />
                  </div>
                  {imageShareActions(imgUrl, fileName, "card")}
                </>
              )}

              {seg === "qr" && (
                <>
                  {imageShareActions(qrUrl, qrFileName, "QR code")}
                  <div className="shcta">
                    <button className="btn ghost" onClick={copyLink}>Copy link</button>
                  </div>
                </>
              )}

              {seg === "text" && (
                <div className="shcta">
                  <button className="btn si" onClick={copyText}>Copy text</button>
                </div>
              )}
            </div>
          </section>
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
              className={`shday shtoday${draftFrom === today && draftDays === 1 ? " on" : ""}`}
              onClick={() => {
                setDraftFrom(today);
                setDraftDays(1);
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
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
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
                  className={`shday${draftDays === n ? " on" : ""}`}
                  onClick={() => setDraftDays(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="publishwrap nostick">
              <button className="btn si" onClick={() => { pushUndo(); setFrom(draftFrom); setDays(draftDays); setPick(null); }}>
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
                onClick={() => {
                  if (!photoAvailable) {
                    backgroundRef.current?.click();
                    return;
                  }
                  pushUndo();
                  setBackground(true);
                }}
              >
                  <span className="shbackground-choice-top">
                    <span className="shbackground-image-preview"><Icon name="image" size={24} /></span>
                    {background && <Icon name="check" size={20} />}
                </span>
                <strong>Photo</strong>
                <span>{photoAvailable ? (background ? "Photo selected" : "Use saved photo") : "Choose from photos"}</span>
              </button>
              )}
            </div>
            {seg === "week" && background && (
              <div className="shphoto-controls">
                {backgroundPreviewUrl && (
                  <div className="shphoto-position-preview" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={backgroundPreviewUrl}
                      alt=""
                      style={{ objectPosition:`${draftPhotoX}% ${draftPhotoY}%` }}
                    />
                    <span style={{ background:`rgba(0,0,0,${draftPhotoOverlay / 100})` }} />
                  </div>
                )}
                <label className="flabel" htmlFor="shPhotoX">Move left or right</label>
                <input
                  id="shPhotoX"
                  className="shslider"
                  type="range"
                  min={0}
                  max={100}
                  value={draftPhotoX}
                  onChange={(event) => setDraftPhotoX(Number(event.target.value))}
                />
                <label className="flabel" htmlFor="shPhotoY">Move up or down</label>
                <input
                  id="shPhotoY"
                  className="shslider"
                  type="range"
                  min={0}
                  max={100}
                  value={draftPhotoY}
                  onChange={(event) => setDraftPhotoY(Number(event.target.value))}
                />
                <label className="flabel" htmlFor="shPhotoOverlay">
                  Darken photo <span>· {draftPhotoOverlay}%</span>
                </label>
                <input
                  id="shPhotoOverlay"
                  className="shslider"
                  type="range"
                  min={0}
                  max={60}
                  step={2}
                  value={draftPhotoOverlay}
                  onChange={(event) => setDraftPhotoOverlay(Number(event.target.value))}
                />
                <div className="publishwrap nostick">
                  <button
                    className="btn si"
                    onClick={() => {
                      pushUndo();
                      setPhotoX(draftPhotoX);
                      setPhotoY(draftPhotoY);
                      setPhotoOverlay(draftPhotoOverlay);
                      setPick(null);
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
            {seg === "week" && photoAvailable && (
              <button
                className="shbackground-remove"
                disabled={backgroundBusy}
                onClick={() => {
                  if (window.confirm("Delete this saved photo? This cannot be undone.")) {
                    void removeBackground();
                  }
                }}
              >
                Delete saved photo
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
                      pushUndo();
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
            <button className="shremix-action" type="button" onClick={remix}>
              <Icon name="auto_awesome" size={19} />
              Remix this look
            </button>
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
                        pushUndo();
                        applyCompleteStyle(id);
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
            <div className="shsavedlooks">
              <div className="shsavedlooks-head">
                <div>
                  <h3>Your looks</h3>
                  <p>Keep a few versions ready for different kinds of weeks.</p>
                </div>
                <button type="button" disabled={designSaving || backgroundBusy} onClick={() => setSavingLook(true)}>Save new</button>
              </div>
              {savingLook && (
                <div className="shsavedlooks-form">
                  <label className="flabel" htmlFor="shLookName">Look name</label>
                  <input
                    id="shLookName"
                    className="editinput"
                    autoFocus
                    maxLength={32}
                    value={lookName}
                    placeholder="Teaching week"
                    onChange={(event) => setLookName(event.target.value)}
                  />
                  <div>
                    <button type="button" onClick={() => { setSavingLook(false); setLookName(""); }}>Cancel</button>
                    <button type="button" className="shsavedlooks-save" disabled={!lookName.trim() || designSaving || backgroundBusy} onClick={() => void saveNamedLook()}>
                      {designSaving ? "Saving..." : "Save look"}
                    </button>
                  </div>
                </div>
              )}
              {savedLooks.length === 0 && !savingLook ? (
                <p className="shsavedlooks-empty">Save a look for teaching weeks, workouts, or weekend plans.</p>
              ) : (
                <div className="shsavedlooks-list">
                  {savedLooks.map((look) => (
                    <div className="shsavedlook" key={look.id}>
                      <button
                        type="button"
                        className="shsavedlook-main"
                        onClick={() => {
                          pushUndo();
                          applyDesign(look.design);
                          setPick(null);
                        }}
                      >
                        <span className="shsavedlook-swatch" style={{ background:STORY_THEMES[look.design.themeId].bg }} />
                        <span>{look.name}</span>
                      </button>
                      <button type="button" className="shsavedlook-delete" aria-label={`Delete ${look.name}`} disabled={designSaving || backgroundBusy} onClick={() => void removeNamedLook(look.id)}>
                        <Icon name="delete" size={18} />
                      </button>
                    </div>
                  ))}
                </div>
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
              aria-pressed={!draftNoHead}
              onClick={() => setDraftNoHead((v) => !v)}
            >
              <span className="setrow-txt">
                <span className="t">Show a headline</span>
              </span>
              <span className={`switch${!draftNoHead ? " on" : ""}`} aria-hidden="true">
                <span className="switch-knob" />
              </span>
            </button>
            {!draftNoHead && (
              <>
                <label className="flabel" htmlFor="shMsg">
                  Your words
                </label>
                <input
                  id="shMsg"
                  className="editinput"
                  value={draftHeadline}
                  maxLength={44}
                  placeholder={coach ? "Train with me." : "Come with me."}
                  onChange={(e) => setDraftHeadline(e.target.value)}
                />
                {/* How loud: a slider, by Matt's call, for taking up the room a
                    quiet week leaves. It commits on release rather than per
                    pixel, because every value is a fresh server render. */}
                <label className="flabel" htmlFor="shSize">
                  Size <span>· {draftSlider}%</span>
                </label>
                <input
                  id="shSize"
                  className="shslider"
                  type="range"
                  min={60}
                  max={180}
                  step={5}
                  value={draftSlider}
                  onChange={(e) => setDraftSlider(Number(e.target.value))}
                />
                {/* The voice, as a plain dropdown, by Matt's call: the sheet
                    of sample rows folded in here with the words it dresses. */}
                <label className="flabel" htmlFor="shFont">
                  Font
                </label>
                <select
                  id="shFont"
                  className="typeselect"
                  value={draftTypeId}
                  onChange={(e) => setDraftTypeId(e.target.value as TypeFaceId)}
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
              <button className="btn si" onClick={() => { pushUndo(); setHeadline(draftHeadline); setNoHead(draftNoHead); setTypeId(draftTypeId); setHsize(draftSlider); setPick(null); }}>
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
              Untick one to leave it off the picture. Tap a star to make one class the feature.
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
                    className={`shday${draftHat === id ? " on" : ""}`}
                    onClick={() => setDraftHat(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="settingslist shpick-list">
              {draftHatRows.length === 0 && <p className="empty">Nothing in this range yet.</p>}
              {draftHatRows.map((it) => {
                const off = draftHide.has(it.key);
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
                        setDraftHide((cur) => {
                          const next = new Set(cur);
                          if (next.has(it.key)) next.delete(it.key);
                          else {
                            next.add(it.key);
                            if (draftFeaturedKey === it.key) setDraftFeaturedKey(null);
                          }
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
                    <button
                      className={`shpick-featurebtn${draftFeaturedKey === it.key ? " on" : ""}`}
                      aria-label={draftFeaturedKey === it.key ? `Stop featuring ${it.name}` : `Feature ${it.name}`}
                      aria-pressed={draftFeaturedKey === it.key}
                      disabled={off}
                      onClick={() => setDraftFeaturedKey((current) => current === it.key ? null : it.key)}
                    >
                      <Icon name={draftFeaturedKey === it.key ? "star_filled" : "star"} size={20} />
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
                disabled={adderBusy}
                onClick={() => {
                  setPick(null);
                  void openAdder();
                }}
              >
                {adderBusy ? "Loading class tools..." : "+ Add a class"}
              </button>
            )}
            <div className="publishwrap nostick">
              <button className="btn si" onClick={() => {
                pushUndo();
                setHide(new Set(draftHide));
                setHat(draftHat);
                setFeaturedKey(
                  draftFeaturedKey && draftHatRows.some((item) => item.key === draftFeaturedKey) && !draftHide.has(draftFeaturedKey)
                    ? draftFeaturedKey
                    : null,
                );
                setPick(null);
              }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <Adder
          studios={adderData?.studios ?? []}
          templates={adderData?.templates ?? []}
          customTypes={adderData?.customTypes ?? []}
          lastUsed={adderData?.lastUsed ?? lastUsed}
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
          studios={adderData?.studios ?? []}
          templates={adderData?.templates ?? []}
          customTypes={adderData?.customTypes ?? []}
          lastUsed={adderData?.lastUsed ?? lastUsed}
          subsCount={0}
          firstPublish={false}
          personal={{ canCoach: false, editId: edit.id }}
          prefill={edit.prefill}
          onClose={() => setEdit(null)}
          onToast={toast}
          onPublished={() => {
            invalidateClientMemory(`personal-detail:${edit.id}`);
            setEdit(null);
            toast("Saved");
            refreshWeek();
          }}
          onDeleted={(msg) => {
            invalidateClientMemory(`personal-detail:${edit.id}`);
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
      <InstagramTagPrompt
        open={instagramPromptOpen}
        onClose={closeInstagramPrompt}
        onToast={toast}
      />
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

/** One picture in the carousel, with its own spinner: the preview redraws
 *  server-side on every knob and takes a second or two to paint, and the
 *  spinner is what says the wait is the picture coming rather than a dead
 *  control. Per slide, because two pictures are on screen at once now. */
function SlideImg({ cls, src, alt, onReady }: { cls: string; src: string | null; alt: string; onReady: (url:string) => void }) {
  const [shownSrc, setShownSrc] = useState(src);
  const [loading, setLoading] = useState(!!src);
  // Double-buffer updates: the complete old poster remains readable while
  // the next PNG draws, then swaps only after the browser has it in memory.
  useEffect(() => {
    if (!src || src === shownSrc) return;
    let live = true;
    const image = new Image();
    setLoading(true);
    image.onload = () => {
      if (!live) return;
      setShownSrc(src);
      setLoading(false);
      onReady(src);
    };
    image.onerror = () => { if (live) setLoading(false); };
    image.src = src;
    return () => { live = false; };
  }, [onReady, shownSrc, src]);
  if (!shownSrc) return (
    <div className="shprev-wrap" aria-label={`Preparing ${alt.toLowerCase()}`}>
      <div className={`${cls} shprev-placeholder`} />
      <span className="shspin" aria-hidden="true" />
    </div>
  );
  return (
    <div className="shprev-wrap">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={cls}
        src={shownSrc}
        alt={alt}
        onLoad={() => { setLoading(false); onReady(shownSrc); }}
        onError={() => setLoading(false)}
      />
      {loading && <span className="shspin" aria-label="Drawing the picture" />}
    </div>
  );
}

/** A compact, labelled editor tool. The label stays visible beneath the
 *  icon because this is a creation surface, not a mystery toolbar; the
 *  current value is useful context but deliberately quieter. */
function StudioTool({
  icon,
  label,
  detail,
  onClick,
  disabled = false,
  accent = false,
}: {
  icon: string;
  label: string;
  detail?: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      className={`sheditor-tool${accent ? " is-accent" : ""}`}
      aria-label={detail ? `${label}: ${detail}` : label}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="sheditor-tool-icon"><Icon name={icon} size={23} /></span>
      <span className="sheditor-tool-label">{label}</span>
      {detail && <span className="sheditor-tool-detail">{detail}</span>}
    </button>
  );
}
