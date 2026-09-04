"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { AdderPrefill } from "@/components/Adder";
import {
  CalSticky,
  MonthHeadRow,
  MonthScroll,
  ScrollHead,
  monthLabel,
  useScrolledPast,
  type MonthCellItem,
} from "@/components/CalendarBits";
import type { PeekClass } from "@/components/ClassPeek";
import { BodyPortal } from "@/components/BodyPortal";
import { HighlightOnLand } from "@/components/HighlightOnLand";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";
import { AddWeekChoices } from "@/components/AddWeekChoices";
import { Toast, useToast } from "@/components/Toast";
import { CalendarList, WeekEmpty, type WeekDayRows } from "@/components/WeekView";
import { clockParts, dayBandLabel, runsOn, timeToMinutes } from "@/lib/format";
import type { ClassDto, StudioDto, TemplateDto } from "@/lib/types";
import type { WeekDay as WeekDayData, WeekItem } from "@/lib/week";
import { setGoing } from "@/app/actions/going";
import { loadMonthlyCalendarInsights, type MonthlyCalendarInsights } from "@/app/actions/product-activity";
import { setTeaching } from "@/app/actions/auth";
import { removePersonalClass, type PersonalDetail, type PersonalMatch } from "@/app/actions/personal";
import {
  loadCalendarComposerData,
  type CalendarComposerData,
} from "@/app/actions/calendar-data";
import { invalidateClientMemory } from "@/lib/client-memory";
import type { GroupCalendarDestination, ManagedCalendarDestination } from "@/lib/managed-calendars";
import type { ProfileSettingsView } from "@/components/YouDashboard";

const Adder = dynamic(() => import("@/components/Adder").then((module) => module.Adder));
const AddBrowse = dynamic(() => import("@/components/AddBrowse").then((module) => module.AddBrowse));
const ClassPeek = dynamic(() => import("@/components/ClassPeek").then((module) => module.ClassPeek));
const PlanSheet = dynamic(() => import("@/components/PlanSheet").then((module) => module.PlanSheet));
const SiteSearchSheet = dynamic(() => import("@/components/SiteSearchSheet").then((module) => module.SiteSearchSheet));
const QrSheet = dynamic(() => import("@/components/QrSheet").then((module) => module.QrSheet));
const ShareTakeover = dynamic(() => import("@/components/ShareTakeover").then((module) => module.ShareTakeover));
const CreateGroupSheet = dynamic(() => import("@/components/SavedScreen").then((module) => module.CreateGroupSheet));
const SettingsDetailSheet = dynamic(() => import("@/components/SettingsDetailSheet").then((module) => module.SettingsDetailSheet));

/**
 * A coach's own calendar: the classes they teach, and nothing else.
 *
 * This screen used to be everybody's calendar. It held what you teach, the
 * shifts a gym had you on, the classes you had saved off somebody else's page
 * and your own private entries, four relationships deep, each with its own
 * colour and its own tap behaviour, and a legend in a sheet to explain them.
 * It is one thing now: what you teach.
 *
 * The shape it wears is the last argument that was still open. It was a week
 * you stepped through with an arrow either side, which capped the calendar at
 * three weeks for no reason the data had and asked somebody to page through a
 * thing they can scroll. It is a continuous list under a title now, with the
 * day bands pinning as you go, and Month is the other way of looking at the
 * same rows rather than a third screen.
 */

/** How far the list runs. Long enough that scrolling is the way to next month
 *  and short enough that a coach with a standing Tuesday is not handed two
 *  hundred identical rows; Month is the view for anything further out. */

type View = "list" | "month";
type CalendarFilter = "all" | "coaching" | "saved" | "personal";
type SummaryVoice = "straightforward" | "friendly" | "sassy" | "unfiltered" | "shakespearean";

const SUMMARY_VOICE_KEY = "fl-calendar-summary-voice";
const SUMMARY_VARIANT_KEY = "fl-calendar-summary-variant";
const SUMMARY_VOICES: { value:SummaryVoice; label:string; description:string }[] = [
  { value:"straightforward", label:"Straightforward", description:"Clear, useful, and to the point." },
  { value:"friendly", label:"Friendly", description:"Warm encouragement without laying it on thick." },
  { value:"sassy", label:"Roast me", description:"Aggressively sarcastic and unnecessarily personal." },
  { value:"unfiltered", label:"Unfiltered", description:"A bit of swearing. You asked for it." },
  { value:"shakespearean", label:"Shakespearean", description:"Forsooth, thy calendar awaits." },
];

const prefillFromTemplate = (template: TemplateDto): AdderPrefill => ({
  ...template,
  days: [],
});

/**
 * A coach can still have an older personal copy of a class after the studio
 * starts owning that same slot. Covers and manager conflict overrides can
 * then make both records eligible for the coach's calendar. They are two
 * records, but one real class occurrence, so prefer the studio-owned shift.
 */
function uniqueCoachingOccurrences(rows: ClassDto[], studioById: Map<string, StudioDto>) {
  const bySlot = new Map<string, ClassDto>();
  for (const row of rows) {
    // coachweek identifies the exact legacy pair when it can. Keeping that
    // copy out also covers dates where the canonical series is skipped.
    if (row.duplicateOf) continue;
    // Old coach-owned copies can store the studio as free text while the
    // managed copy stores its studio id. Resolve both to what the calendar
    // actually displays so those records compare as the same place.
    const place = (row.studioId ? studioById.get(row.studioId)?.name : row.location)
      ?.trim()
      .toLocaleLowerCase() ?? "";
    const name = row.name.trim().toLocaleLowerCase();
    const slot = `${place}|${name}|${row.startTime}`;
    const current = bySlot.get(slot);
    if (!current || (row.shift && !current.shift)) bySlot.set(slot, row);
  }
  return [...bySlot.values()];
}

export function CalendarScreen({
  handle,
  viewer,
  classes,
  todayIso,
  studios,
  savedDays = [],
  openAdder = false,
  member = false,
  sheet = false,
  onClose,
  managedCalendars = [],
  groupCalendars = [],
  studioRelationships = [],
}: {
  /** Your own handle: the base your classes' detail loads from, so the sheet
   *  can show the photograph and the About you wrote, and Share has a URL. */
  handle?: string | null;
  /** Your own attribution, shown on the classes you coach just as it is on
   *  Following. */
  viewer: { id: string; name: string; photo: string | null; color: string };
  classes: ClassDto[];
  todayIso: string;
  studios: StudioDto[];
  savedDays?: WeekDayData[];
  /** Members use this exact calendar too, but every row is attending. They
   *  have no relationship filter and Add opens the catalog directly. */
  member?: boolean;
  /** Land with the adder up: `/calendar?add=1`, which is /app's old parameter
   *  carried through its redirect. */
  openAdder?: boolean;
  sheet?: boolean;
  onClose?: () => void;
  managedCalendars?: ManagedCalendarDestination[];
  groupCalendars?: GroupCalendarDestination[];
  studioRelationships?: { id:string; name:string; slug:string; admin:boolean; photo:string|null }[];
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<CalendarFilter>("all");
  const [calendarChooserOpen, setCalendarChooserOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [profileQrOpen, setProfileQrOpen] = useState(false);
  const [profileActionsOpen, setProfileActionsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [scopeTarget, setScopeTarget] = useState<"you" | "following">("you");
  const [scopeSummaryEntering, setScopeSummaryEntering] = useState(false);
  const [classSheetDismissed, setClassSheetDismissed] = useState(false);
  const [calendarSyncOpen, setCalendarSyncOpen] = useState(false);
  const [settingsView, setSettingsView] = useState<ProfileSettingsView | "away" | null>(null);
  const [summaryVoiceOpen, setSummaryVoiceOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [monthlyInsights, setMonthlyInsights] = useState<MonthlyCalendarInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [summaryVoice, setSummaryVoice] = useState<SummaryVoice>("straightforward");
  const [summaryVariant, setSummaryVariant] = useState(0);
  const closeCalendarSync = useCallback(() => setCalendarSyncOpen(false), []);
  const classSheetPullStart = useRef<number | null>(null);
  const [classSheetPullY, setClassSheetPullY] = useState(0);
  const [addChoice, setAddChoice] = useState(openAdder);
  const [addChoiceKind, setAddChoiceKind] = useState<"coaching" | "saved" | "personal" | null>(null);
  const [addChoiceStep, setAddChoiceStep] = useState<"role" | "regular">("role");
  const [addOpen, setAddOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [personalAdd, setPersonalAdd] = useState(false);
  const [personalWorkout, setPersonalWorkout] = useState(false);
  const [quickPrefill, setQuickPrefill] = useState<AdderPrefill | null>(null);
  const [addDate, setAddDate] = useState<string | null>(null);
  const [match, setMatch] = useState<PersonalMatch | null>(null);
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const [removeConfirm, setRemoveConfirm] = useState<{
    key: string;
    classId: string;
    iso: string;
    name: string;
    personalId?: string;
  } | null>(null);
  const [, startRemove] = useTransition();
  const [enablingCoach, startEnablingCoach] = useTransition();
  // The month grid uses a fixed weekday rail once the page has scrolled.
  // Day view relies on its actual date bands as sticky headers instead of
  // rendering a second, competing overlay.
  const [ymInView, setYmInView] = useState<string | null>(null);
  const [dayHorizon, setDayHorizon] = useState(180);
  const [monthHorizon, setMonthHorizon] = useState(12);
  const dayMoreRef = useRef<HTMLButtonElement>(null);
  const lastAutoDayCount = useRef(-1);
  const scrolled = useScrolledPast(120);
  // The tapped occurrence, and the editor it can open onto.
  const [peek, setPeek] = useState<PeekClass | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [planEdit, setPlanEdit] = useState<{ id: string; prefill: AdderPrefill } | null>(null);
  const [edit, setEdit] = useState<{ id: string; prefill: AdderPrefill } | null>(null);
  const [toastMsg, toastOn, toast] = useToast();
  const [composerData, setComposerData] = useState<CalendarComposerData | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const composerLoadingRef = useRef(false);
  const [loadingTools, startTools] = useTransition();
  const [calendarStateLoaded, setCalendarStateLoaded] = useState(false);
  const calendarStateKey = `fl-calendar-state:${viewer.id}`;
  const refreshCalendarData = useCallback(() => {
    invalidateClientMemory("share-takeover");
    window.dispatchEvent(new CustomEvent("fittlist:calendar-data-changed"));
    router.refresh();
  }, [router]);
  const visible = {
    coaching: !member && (filter === "all" || filter === "coaching"),
    saved: filter === "all" || filter === "saved",
    personal: filter === "all" || filter === "personal",
  };

  const localMonthlyInsights=useMemo(() => {
    const studioById=new Map(studios.map((studio) => [studio.id,studio]));
    const unique=uniqueCoachingOccurrences(classes,studioById);
    const [year,month]=todayIso.split("-").map(Number);
    const days=Number(todayIso.slice(8,10));
    let coached=0;
    const studioIds=new Set<string>();
    for (let day=1;day<=days;day+=1) {
      const iso=`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      const date=new Date(`${iso}T00:00:00.000Z`);
      const dow=(date.getUTCDay()+6)%7;
      for (const cls of unique) {
        if (!runsOn(cls,iso,dow)) continue;
        coached+=1;
        if (cls.studioId) studioIds.add(cls.studioId);
      }
    }
    return { coached,studios:studioIds.size };
  },[classes,studios,todayIso]);

  const openInsights=useCallback(async () => {
    setInsightsOpen(true);
    if (monthlyInsights || insightsLoading) return;
    setInsightsLoading(true);
    try { setMonthlyInsights(await loadMonthlyCalendarInsights()); }
    finally { setInsightsLoading(false); }
  },[insightsLoading,monthlyInsights]);

  useEffect(() => {
    if (openAdder) {
      setAddChoiceStep("role");
      setAddChoice(true);
    }
  }, [openAdder]);

  useEffect(() => {
    router.prefetch("/calendar/following");
  },[router]);
  useEffect(() => {
    const stored=localStorage.getItem(SUMMARY_VOICE_KEY);
    if (SUMMARY_VOICES.some((voice) => voice.value === stored)) setSummaryVoice(stored as SummaryVoice);
  },[]);
  useEffect(() => {
    const key=`${SUMMARY_VARIANT_KEY}:${summaryVoice}`;
    const stored=localStorage.getItem(key);
    const previous=stored === null ? -1 : Number.parseInt(stored,10);
    const next=Number.isFinite(previous) && previous >= 0
      ? (previous+1+Math.floor(Math.random()*4))%5
      : Math.floor(Math.random()*5);
    localStorage.setItem(key,String(next));
    setSummaryVariant(next);
  },[summaryVoice]);
  useEffect(() => {
    if (sessionStorage.getItem("fl-calendar-scope-enter") !== "you") return;
    sessionStorage.removeItem("fl-calendar-scope-enter");
    setScopeSummaryEntering(true);
    window.setTimeout(() => setScopeSummaryEntering(false),240);
  },[]);

  useEffect(() => {
    const openFromDesktop = () => {
      setAddChoiceStep("role");
      setAddChoice(true);
    };
    window.addEventListener("fittlist:add-class", openFromDesktop);
    return () => window.removeEventListener("fittlist:add-class", openFromDesktop);
  }, []);

  const ensureComposer = useCallback(() => {
    if (composerData || composerLoadingRef.current) return;
    composerLoadingRef.current = true;
    setComposerError(null);
    startTools(async () => {
      try {
        const data = await loadCalendarComposerData();
        if (!data) throw new Error("No composer data");
        setComposerData(data);
      } catch {
        setComposerError("We couldn’t load your class tools. Check your connection and try again.");
      } finally {
        composerLoadingRef.current = false;
      }
    });
  }, [composerData]);
  // Deep links and the desktop/native add event open the role chooser without
  // going through openAdd(), so warm the composer from the shared state too.
  // Otherwise choosing Teaching can open a loading sheet without ever
  // starting its data request.
  useEffect(() => {
    if (addChoice) ensureComposer();
  }, [addChoice, ensureComposer]);
  // Calendar owns its share surface now that the global bottom dock is gone.
  // Keeping it mounted here also preserves this page's exact scroll and view.
  const openShare = (_event: ReactMouseEvent<HTMLButtonElement>) => setShareOpen(true);
  const switchScope = (event:ReactMouseEvent<HTMLAnchorElement>, target:"you"|"following") => {
    event.preventDefault();
    if (target === scopeTarget) return;
    setScopeTarget(target);
    sessionStorage.setItem("fl-calendar-scope-enter",target);
    // Keep the outgoing surface present while the prefetched route swaps in.
    // A short cue is enough to communicate the change without exposing the
    // page background if navigation takes a beat on a slower connection.
    window.setTimeout(() => router.push(target === "you" ? "/calendar" : "/calendar/following"), 60);
  };
  const restoreActionSurface = () => {
    window.scrollTo({ top:0, behavior:"auto" });
    setClassSheetDismissed(false);
    requestAnimationFrame(() => window.scrollTo({ top:0, behavior:"auto" }));
  };
  const startClassSheetPull = (event:ReactTouchEvent<HTMLDivElement>) => {
    if (window.scrollY > 4) return;
    classSheetPullStart.current=event.touches[0]?.clientY ?? null;
  };
  const moveClassSheetPull = (event:ReactTouchEvent<HTMLDivElement>) => {
    if (classSheetPullStart.current === null) return;
    const distance=Math.max(0,(event.touches[0]?.clientY ?? classSheetPullStart.current)-classSheetPullStart.current);
    if (distance > 0) event.preventDefault();
    setClassSheetPullY(distance);
  };
  const endClassSheetPull = () => {
    if (classSheetPullY > 120) setClassSheetDismissed(true);
    classSheetPullStart.current=null;
    setClassSheetPullY(0);
  };
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(calendarStateKey) ?? "null");
      if (stored && typeof stored === "object") {
        const state = stored as { view?: unknown; filter?: unknown; visible?: Record<string, unknown> };
        if (state.view === "list" || state.view === "month") setView(state.view);
        if (state.filter === "all" || state.filter === "coaching" || state.filter === "saved" || state.filter === "personal")
          setFilter(member && state.filter === "coaching" ? "all" : state.filter);
        else if (state.visible) {
          const legacy = (["coaching", "saved", "personal"] as const).filter((key) => state.visible?.[key] === true);
          setFilter(legacy.length === 1 && !(member && legacy[0] === "coaching") ? legacy[0] : "all");
        }
      }
    } catch { /* malformed or unavailable storage */ }
    setCalendarStateLoaded(true);
  }, [calendarStateKey, member]);

  useEffect(() => {
    if (!calendarStateLoaded) return;
    try { localStorage.setItem(calendarStateKey, JSON.stringify({ view, filter })); } catch { /* private mode */ }
  }, [calendarStateKey, calendarStateLoaded, filter, view]);

  const studioById = useMemo(() => new Map(studios.map((s) => [s.id, s])), [studios]);
  const savedByIso = useMemo(() => {
    const byIso = new Map(
      savedDays.map((day) => [
        day.iso,
        day.items.filter((item) => !gone[`added|${item.personal ? item.id : item.classId}|${item.iso}`]),
      ] as const),
    );
    const personal = new Map<string, WeekItem>();
    for (const day of savedDays)
      for (const item of day.items)
        if (item.personal && item.repeatDay !== undefined && !item.specificDate) personal.set(item.id, item);
    const start = new Date(`${todayIso}T00:00:00Z`);
    const through = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + monthHorizon + 1, 1));
    const dayThrough = new Date(start);
    dayThrough.setUTCDate(start.getUTCDate() + dayHorizon);
    if (dayThrough > through) through.setTime(dayThrough.getTime());
    for (const item of personal.values()) {
      const firstOffset = ((item.repeatDay! - ((start.getUTCDay() + 6) % 7)) + 7) % 7;
      const cursor = new Date(start);
      cursor.setUTCDate(start.getUTCDate() + firstOffset);
      while (cursor < through) {
        const iso = cursor.toISOString().slice(0, 10);
        if (item.endsOn && iso > item.endsOn) break;
        const key = `added|${item.id}|${iso}`;
        if (!gone[key]) {
          const list = byIso.get(iso) ?? [];
          if (!list.some((entry) => entry.personal && entry.id === item.id))
            byIso.set(iso, [...list, { ...item, iso, dayLabel: dayBandLabel(iso, todayIso) }]);
        }
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
    }
    return byIso;
  }, [savedDays, gone, todayIso, dayHorizon, monthHorizon]);
  const atOf = (r: { hm: string; ap: string }) => {
    const [h, m] = r.hm.split(":").map(Number);
    return ((h % 12) + (r.ap.toLowerCase() === "pm" ? 12 : 0)) * 60 + (m || 0);
  };
  const calendarWeekSummary = useMemo(() => {
    const start=Date.parse(`${todayIso}T00:00:00Z`);
    let coaching=0;
    let attending=0;
    let personal=0;
    const studios=new Set<string>();
    for (let offset=0; offset<7; offset+=1) {
      const date=new Date(start+offset*864e5);
      const iso=date.toISOString().slice(0,10);
      const rows=uniqueCoachingOccurrences(classes.filter((item) => runsOn(item,iso,(date.getUTCDay()+6)%7)),studioById);
      coaching+=rows.length;
      rows.forEach((item) => {
        const place=item.studioId ? studioById.get(item.studioId)?.name : item.location;
        if (place) studios.add(place);
      });
      (savedByIso.get(iso) ?? []).forEach((item) => {
        if (item.personal) personal+=1;
        else attending+=1;
      });
    }
    const classWord=(count:number) => count === 1 ? "class" : "classes";
    const studioPhrase=studios.size ? ` at ${studios.size} ${studios.size === 1 ? "studio" : "studios"}` : "";
    const attendingPhrase=attending ? ` and attending ${attending} ${classWord(attending)}` : "";
    const totalScheduled=coaching+attending+personal;
    const plain=coaching && attending
      ? `You’re coaching ${coaching} ${classWord(coaching)} and attending ${attending} this week.`
      : coaching
        ? `You’re coaching ${coaching} ${classWord(coaching)}${studioPhrase} this week.`
        : attending
          ? `You’re attending ${attending} ${classWord(attending)} this week.`
          : personal
            ? `You have ${personal} personal ${classWord(personal)} this week.`
            : "Your week is open.";
    const variant=(options:string[]) => options[summaryVariant%options.length];
    let title=variant([
      plain,
      coaching ? `${coaching} ${classWord(coaching)} to coach this week${studioPhrase}${attending ? `, with ${attending} more to attend` : ""}.` : plain,
      coaching ? `This week: ${coaching} coaching${attending ? `, ${attending} attending` : ""}${studioPhrase}.` : plain,
      coaching ? `You have ${coaching} ${classWord(coaching)} to coach this week${studioPhrase}.` : plain,
      plain,
    ]);
    if (summaryVoice === "friendly")
      title=coaching ? variant([`Nice week ahead: ${coaching} ${classWord(coaching)} to coach${studioPhrase}${attending ? `, plus ${attending} to attend` : ""}.`,`You’ve got this. ${coaching} ${classWord(coaching)} to coach this week${studioPhrase}.`,`A good week is taking shape: ${coaching} coaching${attending ? ` and ${attending} attending` : ""}.`,`Your week looks strong: ${coaching} ${classWord(coaching)} to coach${studioPhrase}.`,`Ready when you are. ${coaching} ${classWord(coaching)} are waiting for you this week.`]) : attending ? `You’ve got ${attending} ${classWord(attending)} to look forward to this week.` : personal ? `You’ve made time for ${personal} personal ${classWord(personal)} this week.` : "A wide-open week. What sounds good?";
    else if (summaryVoice === "sassy") {
      if (totalScheduled === 0)
        title=variant(["What the fuck are you doing here? There is absolutely nothing on your calendar, which is less a schedule and more a blank document with ambition.","Your calendar is so empty it has started echoing. Add a class before somebody mistakes this for a minimalist art project.","Not one class. Not one plan. Just you opening a fitness calendar to admire all the available whitespace.","There is nothing on your calendar this week. The audacity of checking it anyway is honestly the most exercise happening here.","Your schedule has achieved perfect stillness, which would be impressive if this were a meditation app and not a place for actual classes."]);
      else if (totalScheduled < 3)
        title=variant([`${plain} That’s it? You opened a whole calendar for ${totalScheduled} ${classWord(totalScheduled)} like the rest of the week needed professional supervision.`,`${plain} An adorable little schedule. Tiny, manageable, and apparently still important enough to require its own app.`,`${plain} Pace yourself, hero. At this rate you may need almost one full hand to count everything you’re doing.`,`${plain} The calendar equivalent of dipping one toe in the pool and announcing that you swim now.`,`You’ve got ${totalScheduled} ${classWord(totalScheduled)} this week. Blink carefully or your entire fitness era will be over before you notice it started.`]);
      else if (totalScheduled < 7)
        title=variant([`${plain} Respectable, balanced, and annoyingly difficult to roast without inventing a personal crisis.`,`${plain} Busy enough to mention, not busy enough to become your entire personality, although you’ll certainly give it a try.`,`${plain} A perfectly solid week, which is inconvenient because I was prepared to make fun of either your laziness or your complete lack of boundaries.`,`${plain} Look at you occupying the exact middle ground between “I should move more” and “why did I agree to all of this?”`,`${plain} This is almost suspiciously reasonable. Please make one questionable scheduling decision so we have something interesting to discuss.`]);
      else
        title=variant([`${plain} Apparently you are the exhausted hero this city never asked for, personally holding the fitness industry together one aggressively scheduled class at a time.`,`${plain} Congratulations on becoming the main character, the supporting cast, and the overworked production assistant in the heroic saga of your own completely unhinged week.`,`${plain} Save some fitness for everyone else, legend. Your calendar looks like it was assembled by someone who believes rest days are malicious gossip.`,`${plain} This is not a schedule anymore; it is a public declaration that you intend to save the entire week through charisma, caffeine, and a deeply concerning refusal to sit down.`,`${plain} Behold the hero of the group chat, bravely taking on more classes than anyone requested and somehow preparing to mention every single one of them.`]);
    }
    else if (summaryVoice === "unfiltered")
      title=coaching ? variant([`Holy shit, bro. You’re coaching ${coaching} fucking ${classWord(coaching)} this week${studioPhrase}${attendingPhrase}.`,`Well, damn. ${coaching} ${classWord(coaching)} to coach this week${studioPhrase}${attendingPhrase}. You absolute machine.`,`Fuck me, you’re busy. ${coaching} ${classWord(coaching)} to coach${studioPhrase}${attendingPhrase}.`,`Look at this badass schedule: ${coaching} ${classWord(coaching)} to coach${studioPhrase}${attendingPhrase}.`,`Jesus, save some energy for the rest of us. You’re coaching ${coaching} ${classWord(coaching)}${studioPhrase}${attendingPhrase}.`]) : attending ? `Holy shit, bro. You’re attending ${attending} fucking ${classWord(attending)} this week.` : personal ? `You handled your shit: ${personal} personal ${classWord(personal)} this week.` : "No plans. No bullshit. Your week is open.";
    else if (summaryVoice === "shakespearean")
      title=coaching ? variant([`Dost thou coach ${coaching} ${classWord(coaching)}${studioPhrase}${attending ? ` and attend ${attending}` : ""} this week? Verily.`,`Hark! ${coaching} ${classWord(coaching)} await thy noble instruction${studioPhrase}${attendingPhrase}.`,`Lo, thy week bears ${coaching} ${classWord(coaching)} to coach${studioPhrase}${attendingPhrase}.`,`By my troth, ${coaching} ${classWord(coaching)} summon thee this week${studioPhrase}${attendingPhrase}.`,`Attend, good coach! ${coaching} ${classWord(coaching)} stand upon thy calendar${studioPhrase}${attendingPhrase}.`]) : attending ? `Hark! ${attending} ${classWord(attending)} await thee this week.` : personal ? `Thou hast ${personal} personal ${classWord(personal)} this week.` : "Thy week lies open before thee.";
    const details=[
      coaching ? `${coaching} coaching` : "",
      attending ? `${attending} attending` : "",
      personal ? `${personal} personal` : "",
    ].filter(Boolean).join(" · ");
    return { title, detail:details || "Nothing scheduled in the next 7 days." };
  },[classes,savedByIso,studioById,todayIso,summaryVoice,summaryVariant]);

  /** Every date from today that holds something, with its rows in time order.
   *  Days with nothing on them never make a block, so a light week reads as a
   *  light week rather than as a wall of empty headings. */
  const days: WeekDayRows[] = useMemo(() => {
    const out: WeekDayRows[] = [];
    const start = Date.parse(`${todayIso}T00:00:00Z`);
    // The horizon grows as the end approaches. This keeps first paint small
    // without placing a product limit on how far ahead somebody can plan.
    for (let i = 0; i < dayHorizon; i++) {
      const d = new Date(start + i * 864e5);
      const iso = d.toISOString().slice(0, 10);
      const dow = (d.getUTCDay() + 6) % 7;
      const coachingRows = uniqueCoachingOccurrences(
        classes.filter((c) => runsOn(c, iso, dow)),
        studioById,
      )
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
        .map((c) => {
          const t = clockParts(c.startTime);
          const st = c.studioId ? studioById.get(c.studioId) : null;
          const where = st?.name ?? c.location ?? null;
          return {
            key: `${c.id}|${iso}`,
            // The landing highlight (?hl from a save toast's See it, or an
            // add note) finds rows by these keys.
            classId: c.id,
            iso,
            name: c.name,
            where,
            hm: t.hm,
            ap: t.ap,
            dur: `${c.durationMin} min`,
            coach: null,
            tag: c.shift ? "Shift" : "Coaching",
            tagTone: c.shift ? "shift" as const : "coaching" as const,
            onTap: () => setPeek(peekOf(c, iso, where, st?.slug ? `/s/${st.slug}` : null, handle)),
          };
        });
      const addedRows = (savedByIso.get(iso) ?? []).map((i) => {
        const key = `added|${i.personal ? i.id : i.classId}|${i.iso}`;
        return {
        key,
        classId: i.personal ? undefined : i.classId,
        iso: i.iso,
        name: i.name,
        where: i.where,
        hm: i.hm,
        ap: i.ap,
        dur: `${i.durationMin} min`,
        coach: i.personal
          ? null
          : i.coachName
            ? { id: i.classId, name: i.coachName, color: i.coachColor, photo: i.coachPhoto }
            : null,
        tag: i.personal ? "Personal" : "Saved",
        tagTone: i.personal ? "personal" as const : "attending" as const,
        onTap: i.personal
          ? () => setPlan(i.id)
          : () => setPeek(peekOfAdded(i)),
        corner: (
          <button
            className="following-add on calendar-attending-check"
            type="button"
            aria-label={`Remove ${i.name} from your schedule`}
            onClick={() =>
              setRemoveConfirm({
                key,
                classId: i.classId,
                iso: i.iso,
                name: i.name,
                personalId: i.personal ? i.id : undefined,
              })
            }
          >
            <Icon name="check" size={24} />
          </button>
        ),
      };
      });
      const rows = [
        ...(visible.coaching ? coachingRows : []),
        ...addedRows.filter((row) => row.tagTone === "personal" ? visible.personal : visible.saved),
      ].sort((a, b) => atOf(a) - atOf(b));
      if (rows.length) out.push({ iso, label: dayBandLabel(iso, todayIso), today: iso === todayIso, rows });
    }
    return out;
  }, [classes, todayIso, studioById, handle, visible.coaching, visible.personal, visible.saved, savedByIso, viewer, dayHorizon]);
  /** The month grid reads the same rows, over its own longer range: it is a
   *  different way of looking at the calendar, not a different calendar. */
  const monthItems = useMemo(() => {
    const m = new Map<string, MonthCellItem[]>();
    const start = Date.parse(`${todayIso}T00:00:00Z`) - 62 * 864e5;
    const [year, month] = todayIso.slice(0, 7).split("-").map(Number);
    const rangeEnd = Date.UTC(year, month - 1 + monthHorizon + 1, 1);
    const rangeDays = Math.ceil((rangeEnd - start) / 864e5);
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(start + i * 864e5);
      const iso = d.toISOString().slice(0, 10);
      const dow = (d.getUTCDay() + 6) % 7;
      const coachingRows = uniqueCoachingOccurrences(
        classes.filter((c) => runsOn(c, iso, dow)),
        studioById,
      )
        .map((c) => ({
          kind: "coaching" as const,
          name: c.name,
          at: timeToMinutes(c.startTime),
        }))
        .sort((a, b) => a.at - b.at);
      const addedRows = (savedByIso.get(iso) ?? []).map((i) => ({
        kind: (i.personal ? "private" : "added") as "private" | "added",
        name: i.name,
        at: atOf(i),
      }));
      const rows = [
        ...(visible.coaching ? coachingRows : []),
        ...addedRows.filter((row) => row.kind === "private" ? visible.personal : visible.saved),
      ].sort((a, b) => a.at - b.at);
      if (rows.length) m.set(iso, rows);
    }
    return m;
  }, [classes, todayIso, studioById, visible.coaching, visible.personal, visible.saved, savedByIso, monthHorizon]);

  useEffect(() => {
    if (view !== "list") return;
    if (days.length <= lastAutoDayCount.current) return;
    lastAutoDayCount.current = days.length;
    const target = dayMoreRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setDayHorizon((value) => value + 84);
    }, { rootMargin: "600px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [view, dayHorizon, days.length]);

  // Tapping a day in the grid goes back to the list and lands on it. The grid
  // answers "what does the month look like"; a day is a list of classes, and
  // that is a thing the list already draws well.
  const openDay = useCallback((iso: string) => {
    if (!monthItems.has(iso)) {
      ensureComposer();
      setQuickPrefill(null);
      setAddDate(iso);
      setAddChoiceKind(null);
      setAddChoiceStep("role");
      setAddChoice(true);
      return;
    }
    const offset = Math.max(0, Math.floor((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 864e5));
    if (offset >= dayHorizon) setDayHorizon(offset + 28);
    setView("list");
    requestAnimationFrame(() => {
      document.getElementById(`day-${iso}`)?.scrollIntoView({ block: "start" });
    });
  }, [ensureComposer, monthItems, todayIso, dayHorizon]);

  // Whether this coach has published anything at all, not whether the next
  // eight weeks do: the empty state offers the thing to do only when there is
  // nothing on their coaching calendar.
  const bare = classes.length === 0 && savedDays.every((day) => day.items.length === 0);
  const openAdd = () => {
    ensureComposer();
    setQuickPrefill(null);
    setAddDate(null);
    setAddChoiceKind(null);
    setAddChoiceStep("role");
    setAddChoice(true);
  };
  const openNewCoachingClass = () => {
    setAddChoice(false);
    setPersonalAdd(false);
    setPersonalWorkout(false);
    setAddOpen(true);
  };
  const continueAdd = () => {
    if (!addChoiceKind) return;
    if (addChoiceKind === "coaching" && member && bare) {
      startEnablingCoach(async () => {
        const result = await setTeaching(true);
        if (!result.ok) {
          toast(result.error ?? "Couldn’t turn on coaching");
          return;
        }
        if (composerData?.templates.some((template) => template.isPublic))
          setAddChoiceStep("regular");
        else openNewCoachingClass();
      });
      return;
    }
    if (addChoiceKind === "coaching") {
      if (composerData?.templates.some((template) => template.isPublic))
        setAddChoiceStep("regular");
      else openNewCoachingClass();
      return;
    }
    setAddChoice(false);
    if (addChoiceKind === "saved") setBrowseOpen(true);
    else {
      setPersonalAdd(true);
      setPersonalWorkout(true);
      setAddOpen(true);
    }
  };
  return (
    <>
      {/* "See it" from a save toast lands here with ?hl: light the row. */}
      <HighlightOnLand />
      {!sheet && <><div className={`calendar-scope-top${classSheetDismissed ? " is-expanded" : ""}`} style={{ "--sheet-pull-progress": Math.min(classSheetPullY / 120, 1), "--sheet-search-scale": 1 - (.12 * Math.min(classSheetPullY / 120, 1)) } as React.CSSProperties}>
          <Link className="calendar-scope-search calendar-scope-notifications" href="/notifications" aria-label="Notifications"><Icon name="notifications" size={23} /></Link>
          <nav className={`calendar-mode-tabs${classSheetDismissed ? " is-collapsed" : ""}`} data-active={scopeTarget} aria-label="Calendar view"><Link href="/calendar" aria-current="page" onClick={(event) => switchScope(event,"you")}>You</Link><Link href="/calendar/following" tabIndex={classSheetDismissed ? -1 : undefined} onClick={(event) => switchScope(event,"following")}>Following</Link></nav>
          <span className="calendar-scope-actions"><button type="button" className="calendar-scope-search calendar-scope-search-open" aria-label="Search FittList" onClick={() => setDiscoverOpen(true)}><Icon name="search" size={23} /></button><button type="button" className="calendar-scope-search calendar-scope-close" aria-label="Show calendar actions" onClick={restoreActionSurface}><Icon name="close" size={23} /></button></span>
        </div>
        <section className={`calendar-scope-hero calendar-transition-surface${scopeTarget !== "you" ? " calendar-surface-leaving" : ""}${scopeSummaryEntering ? " calendar-surface-entering" : ""}`}><section className="calendar-section-summary personal-upcoming-summary" aria-label="Calendar summary"><div className={`calendar-summary-copy${summaryVoice === "sassy" ? " is-sassy" : ""}`}><strong>{calendarWeekSummary.title}</strong></div><button type="button" className={`calendar-summary-reveal${classSheetDismissed ? " is-open" : ""}`} aria-label={classSheetDismissed ? "Show calendar actions" : "Show your calendar"} aria-expanded={classSheetDismissed} onClick={() => classSheetDismissed ? restoreActionSurface() : setClassSheetDismissed(true)}><Icon name="expand_more" size={25} /></button></section></section></>}
      {!sheet && !classSheetDismissed && <section className={`calendar-action-sheet calendar-pull-sheet calendar-transition-surface${scopeTarget !== "you" ? " calendar-surface-leaving" : ""}${scopeSummaryEntering ? " calendar-surface-entering" : ""}`} style={{ transform:`translateY(${classSheetPullY}px)` }} onTouchStart={startClassSheetPull} onTouchMove={moveClassSheetPull} onTouchEnd={endClassSheetPull} onTouchCancel={endClassSheetPull} aria-label="Calendar actions">
        <div className="calendar-action-hub">
          <section className="calendar-quick-actions" aria-label="Quick actions"><div>
            <button type="button" onClick={openShare}><Icon name="reply" className="share-arrow-forward" size={20} />Share week</button>
            {handle && <button type="button" onClick={() => setProfileQrOpen(true)}><Icon name="qr_code_2" size={20} />Share profile</button>}
          </div></section>
          <section><h3>Profile</h3><div className="calendar-action-list">
            <button type="button" onClick={() => setProfileActionsOpen(true)}><span className="calendar-action-icon profile-avatar">{viewer.photo ? <img src={viewer.photo} alt="" /> : <span style={{ background:viewer.color }}>{viewer.name.charAt(0)}</span>}</span><span><strong>{viewer.name}</strong><small>{handle ? `@${handle}` : "Personal profile"}</small></span><Icon name="chevron_right" size={20} /></button>
          </div></section>
          {studioRelationships.length > 0 && <section><h3>Studios</h3><div className="calendar-action-list">
            {studioRelationships.map((studio) => <Link key={studio.id} href={studio.admin ? `/s/${studio.slug}/manage` : `/s/${studio.slug}`}><span className="calendar-action-icon studio">{studio.photo ? <img src={studio.photo} alt="" /> : <Icon name="storefront" size={23} />}</span><span><strong>{studio.name}</strong><small className="calendar-relationship-role">{studio.admin ? "Manager" : "Coach"}</small></span><Icon name="chevron_right" size={20} /></Link>)}
          </div></section>}
          <section><div className="calendar-action-section-head"><h3>Groups</h3><button type="button" onClick={() => setCreateGroupOpen(true)}><Icon name="add" size={17} />New group</button></div><div className="calendar-action-list">
            {groupCalendars.map((group) => <Link key={group.id} href={`/g/${group.slug}`}><span className="calendar-action-icon group">{group.photo ? <img src={group.photo} alt="" /> : <Icon name="groups" size={23} />}</span><span><strong>{group.name}</strong><small className="calendar-relationship-role">{group.role === "owner" || group.role === "admin" ? "Manager" : "Member"}</small></span><Icon name="chevron_right" size={20} /></Link>)}
            {groupCalendars.length === 0 && <Link href="/saved"><span className="calendar-action-icon group"><Icon name="groups" size={23} /></span><span><strong>Create or join a group</strong><small>Plan classes and events together</small></span><Icon name="chevron_right" size={20} /></Link>}
          </div></section>
          <section><h3>Updates</h3><div className="calendar-action-list">
            <Link href="/inbox"><span className="calendar-action-icon"><Icon name="chat_bubble" size={23} /></span><span><strong>Messages</strong><small>Conversations and class questions</small></span><Icon name="chevron_right" size={20} /></Link>
            <Link href="/notifications"><span className="calendar-action-icon"><Icon name="notifications" size={23} /></span><span><strong>Notifications</strong><small>Follows, saves, and account activity</small></span><Icon name="chevron_right" size={20} /></Link>
          </div></section>
          <section><h3>Tools</h3><div className="calendar-action-list">
            <button type="button" onClick={openInsights}><span className="calendar-action-icon"><Icon name="activity" size={23} /></span><span><strong>Insights</strong><small>Your coaching, classes, and sharing</small></span><Icon name="chevron_right" size={20} /></button>
            <button type="button" onClick={() => setCalendarSyncOpen(true)}><span className="calendar-action-icon"><Icon name="event" size={23} /></span><span><strong>Calendar &amp; sync</strong><small>Connect Google, Apple, or Outlook</small></span><Icon name="chevron_right" size={20} /></button>
            <button type="button" onClick={() => setSummaryVoiceOpen(true)}><span className="calendar-action-icon"><Icon name="campaign" size={23} /></span><span><strong>Calendar voice</strong><small>{SUMMARY_VOICES.find((voice) => voice.value === summaryVoice)?.label}</small></span><Icon name="chevron_right" size={20} /></button>
          </div></section>
          <section><h3>Settings</h3><div className="calendar-action-list">
            {!member && <button type="button" onClick={() => setSettingsView("away")}><span className="calendar-action-icon"><Icon name="schedule" size={23} /></span><span><strong>Set yourself as away</strong><small>Add away dates, a profile note, and an automatic reply</small></span><Icon name="chevron_right" size={20} /></button>}
            <button type="button" onClick={() => setSettingsView("reach")}><span className="calendar-action-icon"><Icon name="public_off" size={23} /></span><span><strong>Privacy &amp; communication</strong><small>Messages, visibility, and follower approvals</small></span><Icon name="chevron_right" size={20} /></button>
            <button type="button" onClick={() => setSettingsView("account")}><span className="calendar-action-icon"><Icon name="lock" size={23} /></span><span><strong>Account &amp; preferences</strong><small>Login, notifications, and appearance</small></span><Icon name="chevron_right" size={20} /></button>
          </div></section>
          <footer className="calendar-community-footer"><Wordmark variant="cloud" /><p>Thanks for being part of the FittList community.</p><nav aria-label="FittList links"><Link href="/support">Support</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav><small>© {new Date().getFullYear()} FittList</small></footer>
        </div>
      </section>}
      <header className="calendar-page-header calendar-page-actions">
        <div className="calendar-page-title-row">
          <div className="calendar-page-title">
            {sheet ? <button type="button" className="calendar-page-back" aria-label="Back" onClick={onClose}><Icon name="arrow_back" size={23} /></button> : <Link className="calendar-page-back" href="/you" aria-label="Back to You"><Icon name="arrow_back" size={23} /></Link>}
            <h1>Your calendar</h1>
          </div>
          <button type="button" className="calendar-header-share" aria-label="Share your week" onClick={openShare}><Icon name="reply" className="share-arrow-forward" size={20} /><span>Share</span></button>
        </div>
        <div className="calendar-desktop-controls">
          <label className="calendar-desktop-filter">
            <span className="sr-only">View calendar</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as CalendarFilter)}>
              <option value="all">View: All</option>
              {!member && <option value="coaching">View: Coaching</option>}
              <option value="saved">View: Saved</option>
              <option value="personal">View: Personal</option>
            </select>
          </label>
          <div className="calendar-desktop-view" role="group" aria-label="Calendar view">
            <button type="button" className={view === "list" ? "on" : ""} aria-label="Day view" aria-pressed={view === "list"} onClick={() => setView("list")}><Icon name="calendar_view_day" size={21} /></button>
            <button type="button" className={view === "month" ? "on" : ""} aria-label="Month view" aria-pressed={view === "month"} onClick={() => setView("month")}><Icon name="calendar_month" size={21} /></button>
          </div>
        </div>
      </header>

      {(sheet || classSheetDismissed) && <div className={`cardwrap calendar-cardwrap${!sheet ? " calendar-surface-schedule" : ""}`}>
      {/* The title and the two ways of looking, pinned under the app header.
          `CalSticky` publishes its own height as `--dayband-top`, which is
          where every day band underneath pins: one writer for that number,
          because two screens working it out separately is how they end up
          disagreeing by a few pixels nobody can explain. */}
      <CalSticky>
        {view === "month" && <MonthHeadRow />}
      </CalSticky>

      {bare ? (
        <WeekEmpty
          first
          title="Your calendar is empty"
          body="Add a class you&rsquo;re taking or teaching."
          actions={(
            <div className="calendar-empty-actions">
              <button className="btn si" type="button" onClick={openAdd}>Add a class</button>
            </div>
          )}
        />
      ) : view === "month" ? (
        <MonthScroll
          todayIso={todayIso}
          items={monthItems}
          onDay={openDay}
          onMonthInView={setYmInView}
          monthsAhead={monthHorizon}
          onNeedMore={() => setMonthHorizon((value) => value + 12)}
        />
      ) : (
        <>
          {days.length ? (
            <CalendarList className={`personal-calendar-list${!sheet ? " personal-calendar-upcoming" : ""}`} days={days} />
          ) : (
            <WeekEmpty first title="Nothing showing" body="Keep looking ahead, choose another view, or add something to your calendar." />
          )}
          <button ref={dayMoreRef} className={`calendar-load-more${!sheet ? " calendar-load-sentinel" : ""}`} type="button" onClick={() => setDayHorizon((value) => value + 84)}>
            Show more dates
          </button>
        </>
      )}
      </div>}

      {/* Month view needs its weekday rail fixed above the grid. Day view
          uses the real date bands as sticky headers so there is only one
          date label competing for the top edge while scrolling. */}
      {(sheet || classSheetDismissed) && !bare && days.length > 0 && view === "month" && (
        <ScrollHead
          on={scrolled}
          label={ymInView ? monthLabel(ymInView, todayIso) : ""}
          sub={<MonthHeadRow />}
        />
      )}

      {sheet ? <div className="calendar-bottom-actions" aria-label="Schedule actions"><button className="calendar-bottom-add" aria-label="Add to your schedule" onClick={openAdd}><Icon name="add" size={30} /></button></div> : classSheetDismissed && <BodyPortal><div className="calendar-revealed-controls" aria-label="Calendar controls"><div className="calendar-view-toggle" data-active={view} role="group" aria-label="Calendar view"><button type="button" aria-label="Day view" aria-pressed={view === "list"} onClick={() => setView("list")}><Icon name="calendar_view_day" size={22} /></button><button type="button" aria-label="Month view" aria-pressed={view === "month"} onClick={() => setView("month")}><Icon name="calendar_month" size={22} /></button></div><button className="calendar-add-pill" type="button" aria-label="Add to your calendar" onClick={openAdd}><Icon name="add" size={27} /></button></div></BodyPortal>}
      {!sheet && calendarChooserOpen && <BodyPortal><div className="mobile-calendar-switcher-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setCalendarChooserOpen(false); }}><section className="mobile-calendar-switcher" role="dialog" aria-modal="true" aria-labelledby="owned-calendar-title" onMouseDown={(event) => event.stopPropagation()}><div className="mobile-calendar-switcher-handle" aria-hidden="true" /><header><h2 id="owned-calendar-title">Your calendars</h2><button type="button" aria-label="Close calendar chooser" onClick={() => setCalendarChooserOpen(false)}><Icon name="close" size={21} /></button></header><div className="mobile-calendar-switcher-list"><button type="button" className="selected" aria-current="page" onClick={() => setCalendarChooserOpen(false)}><span className="mobile-calendar-switcher-icon"><Icon name="person" size={21} /></span><span><strong>Personal calendar</strong><small>Your classes, shifts, and saved classes</small></span><Icon name="check" size={19} /></button>{managedCalendars.length > 0 && <p>Calendars you manage</p>}{managedCalendars.map((calendar) => { const href=calendar.kind === "studio" ? `/s/${calendar.slug}/manage/calendar?show=all` : `/g/${calendar.slug}`; return <Link href={href} key={`${calendar.kind}:${calendar.id}`}><span className={`mobile-calendar-switcher-icon ${calendar.kind}`}>{calendar.photo ? <img src={calendar.photo} alt="" /> : <Icon name={calendar.kind === "studio" ? "storefront" : "groups"} size={21} />}</span><span><strong>{calendar.name}</strong><small>{calendar.kind === "studio" ? "Studio calendar" : "Group calendar"}</small></span><Icon name="chevron_right" size={19} /></Link>; })}</div></section></div></BodyPortal>}
      {addChoice && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setAddChoice(false); }}>
          <div className="sheet addrole-sheet" role="dialog" aria-modal="true" aria-labelledby="addrole-title">
            {addChoiceStep === "regular" && (
              <button className="iconbtn addrole-back" aria-label="Back" onClick={() => setAddChoiceStep("role")}>
                <Icon name="arrow_back" size={20} />
              </button>
            )}
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setAddChoice(false)}>
              <Icon name="close" size={18} />
            </button>
            {addChoiceStep === "role" ? (
              <>
                <h2 id="addrole-title">Add to your week</h2>
                <p className="lead">What are you doing?</p>
                <AddWeekChoices
                  canCoach={!member || bare}
                  coachDetail={member && bare ? "I also coach" : undefined}
                  disabled={enablingCoach}
                  selected={addChoiceKind}
                  onSelect={setAddChoiceKind}
                />
                <button type="button" className="addrole-continue" disabled={!addChoiceKind || enablingCoach || (addChoiceKind === "coaching" && loadingTools)} onClick={continueAdd}>{enablingCoach ? "Turning on coaching…" : addChoiceKind === "coaching" && loadingTools ? "Finding your classes…" : "Continue"}</button>
              </>
            ) : (
              <>
                <h2 id="addrole-title">Add again</h2>
                <p>Start with a class you already use.</p>
                <section className="calendar-quick-add calendar-quick-add-step" aria-label="Your regular classes">
                  <div>
                  {(composerData?.templates ?? []).filter((template) => template.isPublic).slice(0, 4).map((template) => {
                    const studio = template.studioId ? studioById.get(template.studioId) : null;
                    return (
                      <button
                        type="button"
                        key={`${template.name}|${template.studioId ?? template.location ?? ""}`}
                        onClick={() => {
                          setQuickPrefill({
                            ...prefillFromTemplate(template),
                            ...(addDate ? { specificDate: addDate } : {}),
                          });
                          setAddDate(null);
                          setAddChoice(false);
                          setPersonalAdd(false);
                          setPersonalWorkout(false);
                          setAddOpen(true);
                        }}
                      >
                        <span><b>{template.name}</b><small>{studio?.name ?? template.location ?? "Your class"}</small></span>
                        <Icon name="chevron_right" size={19} />
                      </button>
                    );
                  })}
                  </div>
                </section>
                <button type="button" className="addrole-new-class" onClick={openNewCoachingClass}>
                  <span><Icon name="add" size={20} /> New class</span>
                  <Icon name="chevron_right" size={19} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {browseOpen && (
        <AddBrowse
          onClose={() => setBrowseOpen(false)}
          onAddNew={() => {
            setBrowseOpen(false);
            setPersonalAdd(true);
            setPersonalWorkout(false);
            setAddOpen(true);
          }}
          onEvent={() => {
            setBrowseOpen(false);
            setPersonalAdd(true);
            setPersonalWorkout(true);
            setAddOpen(true);
          }}
          onNotice={(message, highlight) => {
            toast(message);
            if (highlight) refreshCalendarData();
          }}
        />
      )}
      {addOpen && composerData && (
        <Adder
          studios={studios}
          templates={composerData.templates}
          customTypes={composerData.customTypes}
          lastUsed={composerData.lastUsed}
          subsCount={composerData.subsCount}
          firstPublish={bare}
          prefill={quickPrefill ?? (addDate ? {
            name: "",
            startTime: composerData.lastUsed.startTime,
            durationMin: composerData.lastUsed.durationMin,
            studioId: composerData.lastUsed.studioId,
            links: [],
            specificDate: addDate,
          } : undefined)}
          personal={
            personalAdd
              ? { canCoach: false, event: personalWorkout, oneOff: true }
              : undefined
          }
          onClose={() => {
            setAddOpen(false);
            setQuickPrefill(null);
            setAddDate(null);
            setPersonalAdd(false);
            setPersonalWorkout(false);
          }}
          onToast={toast}
          onPublished={(msg, _planId, _live, focus) => {
            setAddOpen(false);
            setQuickPrefill(null);
            setAddDate(null);
            setPersonalAdd(false);
            setPersonalWorkout(false);
            toast(msg);
            if (focus) {
              // A new class can land outside the saved view or in Month view.
              // Put the calendar in the one state where its exact row is
              // visible, then let HighlightOnLand scroll to and light it.
              setFilter("all");
              setView("list");
              try {
                localStorage.setItem(calendarStateKey, JSON.stringify({ view: "list", filter: "all" }));
              } catch { /* private mode */ }
              router.replace(`/calendar?hl=${encodeURIComponent(`${focus.id}.${focus.iso}`)}`, { scroll: false });
            } else {
              refreshCalendarData();
            }
          }}
          onDeleted={(msg) => {
            setAddOpen(false);
            setQuickPrefill(null);
            setAddDate(null);
            setPersonalAdd(false);
            toast(msg);
            refreshCalendarData();
          }}
          onMatch={(found) => {
            setAddOpen(false);
            setMatch(found);
          }}
        />
      )}
      {(addOpen || !!edit || !!planEdit) && !composerData && (
        <div className="sheet-scrim">
          <div className="sheet calendar-tool-loading" role="dialog" aria-modal="true" aria-live="polite" aria-busy={!composerError}>
            {composerError ? (
              <>
                <h2>Class tools unavailable</h2>
                <p className="lead">{composerError}</p>
                <button className="btn si" type="button" onClick={ensureComposer}>Try again</button>
                <button className="btn ghost" type="button" style={{ marginTop: 8 }} onClick={() => { setAddOpen(false); setEdit(null); setPlanEdit(null); }}>Close</button>
              </>
            ) : "Loading your class tools…"}
          </div>
        </div>
      )}
      {match && (
        <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) setMatch(null); }}>
          <div className="sheet confirmsheet" role="dialog" aria-modal="true">
            <h2>That class is already on FittList</h2>
            <p className="lead">
              {match.name} with {match.coachName} is already listed at that time and place. Add the existing class so updates stay in sync.
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                onClick={() => startRemove(async () => {
                  const result = await setGoing(match.classId, match.iso, true);
                  if (!result.ok) {
                    toast(result.error ?? "Couldn't add that");
                    return;
                  }
                  toast(`${match.name} was saved to your calendar`);
                  setMatch(null);
                  refreshCalendarData();
                })}
              >
                Add existing class
              </button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setMatch(null)}>Go back</button>
            </div>
          </div>
        </div>
      )}
      {peek && (
        <ClassPeek
          cls={peek}
          onClose={() => setPeek(null)}
          onToast={toast}
          onChanged={refreshCalendarData}
          onEdit={() => {
            const c = classes.find((x) => x.id === peek.id);
            setPeek(null);
            if (c) { ensureComposer(); setEdit({ id: c.id, prefill: prefillOf(c) }); }
          }}
        />
      )}

      {plan && (
        <PlanSheet
          id={plan}
          onClose={() => setPlan(null)}
          onToast={toast}
          onRemoved={(message) => {
            setPlan(null);
            toast(message);
            refreshCalendarData();
          }}
          onEdit={(personal) => {
            setPlan(null);
            ensureComposer();
            setPlanEdit({ id: personal.id, prefill: personalPrefill(personal) });
          }}
        />
      )}

      {planEdit && composerData && (
        <Adder
          studios={studios}
          templates={composerData.templates}
          customTypes={composerData.customTypes}
          lastUsed={composerData.lastUsed}
          subsCount={composerData.subsCount}
          firstPublish={false}
          personal={{ canCoach: !member, editId: planEdit.id }}
          prefill={planEdit.prefill}
          onClose={() => setPlanEdit(null)}
          onToast={toast}
          onPublished={(message) => {
            setPlanEdit(null);
            toast(message);
            refreshCalendarData();
          }}
          onDeleted={(message) => {
            setPlanEdit(null);
            toast(message);
            refreshCalendarData();
          }}
        />
      )}

      {edit && composerData && (
        <Adder
          studios={studios}
          templates={composerData.templates}
          customTypes={composerData.customTypes}
          lastUsed={composerData.lastUsed}
          subsCount={composerData.subsCount}
          firstPublish={false}
          prefill={edit.prefill}
          onClose={() => setEdit(null)}
          onToast={toast}
          onPublished={(msg) => {
            setEdit(null);
            toast(msg);
            refreshCalendarData();
          }}
          onDeleted={(msg) => {
            setEdit(null);
            toast(msg);
            refreshCalendarData();
          }}
        />
      )}
      {removeConfirm && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRemoveConfirm(null);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>Remove this from your calendar?</h2>
            <p className="lead">
              {removeConfirm.name} comes off your schedule. You can add it again from the catalog.
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                onClick={() => {
                  const item = removeConfirm;
                  setRemoveConfirm(null);
                  setGone((current) => ({ ...current, [item.key]: true }));
                  startRemove(async () => {
                    const result = item.personalId
                      ? await removePersonalClass(item.personalId)
                      : await setGoing(item.classId, item.iso, false);
                    if (!result.ok) {
                      setGone((current) => ({ ...current, [item.key]: false }));
                      toast(result.error ?? "Couldn't remove that");
                      return;
                    }
                    toast(`${item.name} was removed from your schedule`);
                    refreshCalendarData();
                  });
                }}
              >
                Remove it
              </button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setRemoveConfirm(null)}>
                Keep it
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
      {handle && <QrSheet handle={handle} open={profileQrOpen} onClose={() => setProfileQrOpen(false)} onToast={toast} />}
      {profileActionsOpen && <BodyPortal><div className="sheet-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileActionsOpen(false); }}><section className="sheet profile-actions-sheet" role="dialog" aria-modal="true" aria-labelledby="profile-actions-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="iconbtn sheetclose" aria-label="Close profile options" onClick={() => setProfileActionsOpen(false)}><Icon name="close" size={18} /></button><h2 id="profile-actions-title">Profile</h2><div className="calendar-action-list"><Link href={handle ? `/${handle}?edit=1` : "/settings?edit=1"} onClick={() => setProfileActionsOpen(false)}><span className="calendar-action-icon"><Icon name="edit" size={23} /></span><span><strong>Edit profile</strong><small>Update your photo and profile details</small></span><Icon name="chevron_right" size={20} /></Link>{handle && <Link href={`/${handle}`} onClick={() => setProfileActionsOpen(false)}><span className="calendar-action-icon"><Icon name="person" size={23} /></span><span><strong>View public profile</strong><small>See what other people see</small></span><Icon name="chevron_right" size={20} /></Link>}</div></section></div></BodyPortal>}
      {shareOpen && <ShareTakeover onClosed={() => setShareOpen(false)} />}
      {createGroupOpen && <CreateGroupSheet onClose={() => setCreateGroupOpen(false)} />}
      {!sheet && discoverOpen && <SiteSearchSheet todayIso={todayIso} userId={viewer.id} onClose={() => setDiscoverOpen(false)} />}
      {calendarSyncOpen && <SettingsDetailSheet view="calendar" onClose={closeCalendarSync} />}
      {settingsView && <SettingsDetailSheet view={settingsView} onClose={() => setSettingsView(null)} />}
      {insightsOpen && <BodyPortal><div className="header-account-overlay" onMouseDown={() => setInsightsOpen(false)}><section className="header-account-sheet calendar-insights-sheet" role="dialog" aria-modal="true" aria-label="Calendar insights" onMouseDown={(event) => event.stopPropagation()}><div className="accttop"><div><h1 className="acct-h">Insights</h1><p>{monthlyInsights?.month ?? new Date(`${todayIso}T12:00:00.000Z`).toLocaleDateString("en-US",{ month:"long",year:"numeric",timeZone:"UTC" })}</p></div><button type="button" className="iconbtn acctclose" aria-label="Close insights" onClick={() => setInsightsOpen(false)}><Icon name="close" size={20} /></button></div><div className="calendar-insights-grid"><article><strong>{localMonthlyInsights.coached}</strong><span>Classes coached</span></article><article><strong>{insightsLoading ? "–" : monthlyInsights?.attended ?? 0}</strong><span>Classes taken</span></article><article><strong>{insightsLoading ? "–" : monthlyInsights?.shareImages ?? 0}</strong><span>Images shared</span></article><article><strong>{localMonthlyInsights.studios}</strong><span>Studios coached at</span></article></div><div className="calendar-insights-note"><Icon name="activity" size={24} /><p>{localMonthlyInsights.coached > 0 ? `You’ve coached ${localMonthlyInsights.coached} ${localMonthlyInsights.coached === 1 ? "class" : "classes"} across ${localMonthlyInsights.studios || 1} ${localMonthlyInsights.studios === 1 ? "studio" : "studios"} this month.` : "Your monthly story will take shape as you add classes and share your week."}</p></div></section></div></BodyPortal>}
      {summaryVoiceOpen && <BodyPortal><div className="header-account-overlay" onMouseDown={() => setSummaryVoiceOpen(false)}><section className="header-account-sheet calendar-voice-sheet" role="dialog" aria-modal="true" aria-label="Calendar voice" onMouseDown={(event) => event.stopPropagation()}><div className="accttop"><div><h1 className="acct-h">Calendar voice</h1><p>Choose how your calendar talks to you.</p></div><button type="button" className="iconbtn acctclose" aria-label="Close" onClick={() => setSummaryVoiceOpen(false)}><Icon name="close" size={20} /></button></div><div className="calendar-voice-options">{SUMMARY_VOICES.map((voice) => <button type="button" className={summaryVoice === voice.value ? "selected" : ""} aria-pressed={summaryVoice === voice.value} key={voice.value} onClick={() => { setSummaryVoice(voice.value); localStorage.setItem(SUMMARY_VOICE_KEY,voice.value); }}><span><strong>{voice.label}</strong><small>{voice.description}</small></span><Icon name={summaryVoice === voice.value ? "check_circle" : "radio_button_unchecked"} size={23} /></button>)}</div></section></div></BodyPortal>}
    </>
  );
}

/** The tapped occurrence, as the sheet wants it. It lives here rather than in
 *  the sheet because only the caller knows which date was tapped. */
function peekOf(
  c: ClassDto,
  iso: string,
  where: string | null,
  whereHref: string | null,
  handle?: string | null,
): PeekClass {
  const d = new Date(`${iso}T00:00:00Z`);
  // Title case, because it is a value in the facts list and reads beside
  // "6:00 pm" and "Ironbound Performance Athletics", not above them.
  const dow = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const t = clockParts(c.startTime);
  return {
    id: c.id,
    iso,
    name: c.name,
    when: `${dow}, ${md}`,
    time: `${t.hm} ${t.ap.toLowerCase()}`,
    studio: where,
    studioHref: whereHref,
    repeats: c.specificDate ? "Once" : "Weekly",
    // A gym's class you are on the rota for. It is on this calendar and it is
    // not yours to edit, cancel or delete: the studio owns it, and what a
    // coach can do with a date they are on is give it up or hand it over.
    shift: c.shift,
    // A shift's page lives under the studio, because that is who owns it.
    base: c.shift ? (c.shiftBase ? `s/${c.shiftBase}` : undefined) : (handle ?? undefined),
    mine: true,
  };
}

/** A catalog class already on this calendar opens the same modern peek as it
 *  does from Following. The row has enough to paint the first frame; the
 *  sheet loads its image, About, booking links and RSVP state behind it. */
function peekOfAdded(item: WeekItem): PeekClass {
  const d = new Date(`${item.iso}T00:00:00Z`);
  const dow = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return {
    id: item.classId,
    iso: item.iso,
    name: item.name,
    when: `${dow}, ${md}`,
    time: `${item.hm} ${item.ap.toLowerCase()}`,
    studio: item.where,
    coach: item.coachName
      ? {
          name: item.coachName,
          handle: item.handle || null,
          photo: item.coachPhoto,
          color: item.coachColor,
        }
      : null,
    base: item.handle,
    saved: true,
    mine: false,
  };
}

function personalPrefill(item: PersonalDetail): AdderPrefill {
  return {
    name: item.name,
    classType: item.classType,
    description: item.description,
    image: item.image,
    startTime: item.startTime,
    durationMin: item.durationMin,
    studioId: item.studioId,
    location: item.location,
    withWho: item.withWho,
    links: item.links,
    days: [item.dayOfWeek],
    dayOfWeek: item.dayOfWeek,
    endsOn: item.endsOn,
    specificDate: item.specificDate,
  };
}

/** The editor, opened on this class and this date. */
function prefillOf(c: ClassDto): AdderPrefill {
  return {
    name: c.name,
    classType: c.classType,
    description: c.description,
    startTime: c.startTime,
    durationMin: c.durationMin,
    studioId: c.studioId,
    location: c.location,
    isPublic: c.isPublic,
    links: c.links.map((l) => ({ ...l })),
    days: [c.dayOfWeek],
    dayOfWeek: c.dayOfWeek,
    endsOn: c.endsOn,
    specificDate: c.specificDate,
    classId: c.id,
  };
}
