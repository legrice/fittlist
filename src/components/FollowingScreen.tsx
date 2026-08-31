"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type TouchEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { PeekClass } from "@/components/ClassPeek";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { CalendarList, ClassLine, type WeekRow } from "@/components/WeekView";
import { toggleCalendarPin } from "@/app/actions/pins";
import { loadCalendarRemainder } from "@/app/actions/calendar-stream";
import { MonthHeadRow, MonthScroll, type MonthCellItem } from "@/components/CalendarBits";
import { PersonalCalendarSheetTrigger } from "@/components/PersonalCalendarSheet";
import { GlobalAdd } from "@/components/GlobalAdd";
import { BodyPortal } from "@/components/BodyPortal";
import { loadClientMemory, readClientMemory } from "@/lib/client-memory";

const ClassPeek = dynamic(() => import("@/components/ClassPeek").then((module) => module.ClassPeek));
const CoachPeek = dynamic(() => import("@/components/CoachPeek").then((module) => module.CoachPeek));
const DiscoverSheet = dynamic(() => import("@/components/DiscoverSheet").then((module) => module.DiscoverSheet));
const NotificationsSheet = dynamic(() => import("@/components/NotificationsSheet").then((module) => module.NotificationsSheet));

export type FeedCoach = {
  id: string;
  name: string;
  handle: string;
  photo: string | null;
  color: string;
  /** When their next class is ("Today 6:00p"): the Add screen's browse list
   *  and People near you still say it. The rail deliberately does not. */
  next: string | null;
};

/** One circle on the This week rail: somebody you follow with something
 *  actually coming up, a class they coach or one they are going to. The
 *  circle is a name and a ring, nothing else. */
export type RailPerson = {
  id: string;
  name: string;
  handle: string | null;
  photo: string | null;
  color: string;
  /** Their week changed since you last opened it: the ring is orange. */
  fresh: boolean;
  /** When their next thing is, for the soonest-first order. */
  nextAt: string | null;
};

/** A tile on the Studios near you rail: a rectangle, because a place is a
 *  room and a person is a face. Closest first, as honestly as we can say
 *  it: the viewer's own city leads on the server, and the rail re-sorts by
 *  real distance once the distance filter has already earned the pin. */
export type NearStudio = {
  id: string;
  slug: string;
  name: string;
  photo: string | null;
  color: string;
  types: string[];
  lat: number | null;
  lng: number | null;
  /** A city-center estimate until the viewer grants an exact browser pin. */
  approxMiles: number | null;
  local: boolean;
};

export type SocialStudio = {
  id: string;
  slug: string;
  name: string;
  photo: string | null;
  color: string;
};

export type SocialGroup = {
  id: string;
  slug: string;
  name: string;
  photo: string | null;
  classKeys: string[];
};

type CalendarRemainder = NonNullable<Awaited<ReturnType<typeof loadCalendarRemainder>>>;

/** A circle on the Coaches near you rail, the viewer's own follow state
 *  riding along so the pill under the face starts right. */
export type FeedItem = {
  key: string;
  /** Which seven-day chunk of the rolling month it falls in. */
  week: number;
  iso: string;
  classId: string;
  /** The base its class page lives under: a handle, or `s/{slug}` for a gym. */
  base: string;
  coachId: string;
  /** The coach assigned by a followed studio for this occurrence. The studio
   * remains the calendar source; null means the shift is still open. */
  assignedCoachName: string | null;
  name: string;
  where: string | null;
  /** The studio's page, when the class names a studio rather than a room. */
  whereHref: string | null;
  hm: string;
  ap: string;
  durationMin: number;
  /** For sorting inside a day, since "6:00" sorts badly as a string. */
  mins: number;
  /** The sheet's depth, carried on the row so the peek paints whole on its
   *  first frame: the About text arriving a beat late grew the sheet after
   *  it was already up, which reads as a jump. The photo deliberately stays
   *  behind the fetch (legacy images are data URLs, and a feed carrying one
   *  per row is a feed that weighs megabytes). */
  about: string | null;
  classType: string | null;
  links: { label: string; url: string }[];
  /** The studio's street address, the sub-line under the place fact. */
  studioAddress: string | null;
  /** The studio's coordinates, for the distance filter. Null passes any
   *  distance: a class with no pin should widen a search, not vanish. */
  lat: number | null;
  lng: number | null;
  /** The viewer already saved this occurrence: the corner ribbon starts
   *  filled. */
  saved: boolean;
  /** This occurrence is a studio-assigned shift for the signed-in viewer. */
  shift: boolean;
};

const TIMES = [
  ["any", "Any time"],
  ["am", "Morning, before 11"],
  ["mid", "Midday, 11 to 4"],
  ["pm", "Evening, after 4"],
] as const;
const DISTS = [
  ["any", "Any distance"],
  ["1", "Within 1 mile"],
  ["3", "Within 3 miles"],
  ["5", "Within 5 miles"],
] as const;

type Filters = {
  time: "any" | "am" | "mid" | "pm";
  dist: "any" | "1" | "3" | "5";
  cat: string;
  place: "any" | string[];
};
const NO_FILTERS: Filters = { time: "any", dist: "any", cat: "any", place: "any" };

/**
 * Following: the coaches you keep up with and their combined schedule.
 *
 * The faces are the people you follow who actually have something coming
 * up, soonest first, each circle a name and a ring: solid orange when
 * their week changed since you last opened it, bare once seen. Under them
 * Discovery stays behind its own door; this screen is the value of a follow.
 */
export function FollowingScreen({
  items: initialItems,
  coaches: initialCoaches,
  favIds,
  follows,
  cats: initialCats,
  todayIso,
  meId,
  meKind,
  myRail: initialMyRail,
  meFace,
  savedStudios = [],
  socialGroups = [],
  initialPins = [],
  mode = "home",
}: {
  items: FeedItem[];
  coaches: FeedCoach[];
  /** Who the viewer follows, for the class peek's Follow pill state. */
  favIds: string[];
  /** The type filter's options, from what the list actually holds. */
  cats: string[];
  /** How many people they follow: the rail's teaching state forks on this. */
  follows: number;
  todayIso: string;
  /** The viewer: their own rows carry no Save, because setGoing refuses a
   *  mark on your own class and a button that fails is worse than none. */
  meId?: string;
  myRail: RailPerson[];
  /** Where the You circle points: the hub is per kind. */
  meKind: "coach" | "member";
  /** The viewer's own face, leading the rail: your circle is you, not a
   *  glyph, by Matt's call. */
  meFace: { photo: string | null; name: string; color: string };
  /** The rails under the schedule, by Matt's call: the places and the
   *  people around you, with Follow one tap deep. */
  nearStudios: NearStudio[];
  savedStudios?: SocialStudio[];
  socialGroups?: SocialGroup[];
  initialPins?: string[];
  /** Following is the combined schedule; Upcoming is the filtered browser. */
  mode?: "home" | "upcoming";
}) {
  const isHome = mode === "home";
  const [items, setItems] = useState(initialItems);
  const [coaches, setCoaches] = useState(initialCoaches);
  const [cats, setCats] = useState(initialCats);
  const [myRail, setMyRail] = useState(initialMyRail);
  const [calendarPending, setCalendarPending] = useState(mode === "home");
  const streamGeneration = useRef(0);

  // Give the browser the useful screen first. The network request for days
  // 3–31 begins only after hydration, then merges without replacing today's
  // already-interactive rows or resetting any filters/peek state.
  useEffect(() => {
    const generation = ++streamGeneration.current;
    // A server refresh can change the relationship graph without unmounting
    // this client component. Reset to that new first response, then stream a
    // matching remainder; otherwise an old month can survive an unfollow.
    setItems(initialItems);
    setCoaches(initialCoaches);
    setCats(initialCats);
    setMyRail(initialMyRail);
    if (!isHome) return undefined;
    const memoryKey = `calendar-remainder:${todayIso}`;
    const applyRemainder = (remainder: CalendarRemainder) => {
      if (streamGeneration.current !== generation) return;
      // Rebuild from the current server seed each time. That lets remembered
      // data paint instantly, while a quiet fresh answer can still remove a
      // class that disappeared since the last visit.
      const mergedItems = new Map(initialItems.map((item) => [item.key, item]));
      for (const item of remainder.items) mergedItems.set(item.key, item);
      setItems([...mergedItems.values()]);
      const mergedCoaches = new Map(initialCoaches.map((coach) => [coach.id, coach]));
      for (const coach of remainder.coaches) mergedCoaches.set(coach.id, coach);
      setCoaches([...mergedCoaches.values()]);
      setCats([...new Set([...initialCats, ...remainder.cats])]);
      setMyRail(remainder.myRail);
    };
    const remembered = readClientMemory<CalendarRemainder>(memoryKey);
    if (remembered) applyRemainder(remembered);
    setCalendarPending(!remembered);
    const frame = requestAnimationFrame(() => {
      void loadClientMemory(memoryKey, loadCalendarRemainder)
        .then((remainder) => {
          if (!remainder || streamGeneration.current !== generation) return;
          applyRemainder(remainder);
        })
        .catch(() => {
          // The first two days remain fully usable offline or on a failed
          // continuation request; a later navigation naturally retries.
        })
        .finally(() => {
          if (streamGeneration.current === generation) setCalendarPending(false);
        });
    });
    return () => {
      cancelAnimationFrame(frame);
      if (streamGeneration.current === generation) streamGeneration.current += 1;
    };
  }, [initialCats, initialCoaches, initialItems, initialMyRail, isHome, todayIso]);

  // The containerless list lands on today or the first day that holds
  // anything. Home keeps only the date rail and the selected day's results;
  // the dedicated Upcoming view adds the four value-showing filter chips.
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [sheet, setSheet] = useState<null | "all" | "time" | "dist" | "cat" | "place">(null);
  const [day, setDay] = useState<string>(() => {
    if (items.some((i) => i.iso === todayIso)) return todayIso;
    let first: string | null = null;
    for (const i of items) if (i.iso > todayIso && (!first || i.iso < first)) first = i.iso;
    return first ?? todayIso;
  });
  // Where the auto-landing went, so the note under the tabs can say why
  // Today isn't selected; it only ever names this one day.
  const landed = useRef(day);
  const [peek, setPeek] = useState<PeekClass | null>(null);
  const [find, setFind] = useState(false);
  const [calendarFilter, setCalendarFilter] = useState<"all" | "you" | "following" | "people" | `coach:${string}` | `studio:${string}` | `group:${string}`>("all");
  const [includeYou, setIncludeYou] = useState(true);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(() => new Set());
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [calendarDirectoryOpen, setCalendarDirectoryOpen] = useState(false);
  const [calendarDirectoryTab, setCalendarDirectoryTab] = useState<"people" | "studios" | "groups">("people");
  const [calendarDirectoryQuery, setCalendarDirectoryQuery] = useState("");
  const [calendarDirectoryFollowing, setCalendarDirectoryFollowing] = useState<Record<string, boolean>>({});
  const [calendarDirectoryBusy, setCalendarDirectoryBusy] = useState<string | null>(null);
  const calendarDirectoryListRef = useRef<HTMLDivElement>(null);
  const calendarDirectoryDragStartY = useRef<number | null>(null);
  const calendarDirectoryDragDistance = useRef(0);
  const [calendarDirectoryDragY, setCalendarDirectoryDragY] = useState(0);
  const [calendarDirectoryDragging, setCalendarDirectoryDragging] = useState(false);
  const closeCalendarDirectory = () => {
    setCalendarDirectoryOpen(false);
    setCalendarDirectoryDragY(0);
    setCalendarDirectoryDragging(false);
    calendarDirectoryDragStartY.current = null;
    calendarDirectoryDragDistance.current = 0;
  };
  const startCalendarDirectoryPull = (event: TouchEvent<HTMLElement>) => {
    calendarDirectoryDragStartY.current = event.touches[0]?.clientY ?? null;
    calendarDirectoryDragDistance.current = 0;
  };
  const moveCalendarDirectoryPull = (event: TouchEvent<HTMLElement>) => {
    if (calendarDirectoryDragStartY.current === null) return;
    const currentY = event.touches[0]?.clientY ?? calendarDirectoryDragStartY.current;
    if ((calendarDirectoryListRef.current?.scrollTop ?? 0) > 0) {
      calendarDirectoryDragStartY.current = currentY;
      return;
    }
    const distance = Math.max(0, currentY - calendarDirectoryDragStartY.current);
    if (!distance) return;
    event.preventDefault();
    calendarDirectoryDragDistance.current = distance;
    setCalendarDirectoryDragging(true);
    setCalendarDirectoryDragY(distance);
  };
  const endCalendarDirectoryPull = () => {
    if (calendarDirectoryDragDistance.current > 90) {
      closeCalendarDirectory();
      return;
    }
    setCalendarDirectoryDragY(0);
    setCalendarDirectoryDragging(false);
    calendarDirectoryDragStartY.current = null;
    calendarDirectoryDragDistance.current = 0;
  };
  useEffect(() => {
    if (!calendarDirectoryOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeCalendarDirectory(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [calendarDirectoryOpen]);
  const [calendarView, setCalendarView] = useState<"day" | "month">("day");
  const [personPeekOpen, setPersonPeekOpen] = useState<null | { id: string; name: string; photo: string | null; color: string; self: boolean }>(null);
  const [entityPeekOpen, setEntityPeekOpen] = useState<null | { type:"studio"|"group"; id:string; name:string; photo:string|null; color:string; href:string; items:FeedItem[] }>(null);
  const [pins, setPins] = useState(() => new Set(initialPins));
  const [visibleHomeDayCount, setVisibleHomeDayCount] = useState(2);
  const homeMoreRef = useRef<HTMLDivElement>(null);
  const [addedFocus, setAddedFocus] = useState<{ id: string; iso: string } | null>(null);
  const [toastMsg, toastOn, toast] = useToast();
  const [toastAction, setToastAction] = useState<{ label: string; href: string } | null>(null);
  const notify = (msg: string, highlight?: string) => {
    setToastAction(highlight ? { label: "Show it", href: `/calendar?hl=${encodeURIComponent(highlight)}` } : null);
    toast(msg);
  };
  const router = useRouter();

  useEffect(() => {
    if (!addedFocus) return;
    let stopped = false;
    let clear: ReturnType<typeof setTimeout> | null = null;
    const deadline = Date.now() + 8000;
    const reveal = () => {
      if (stopped) return;
      const selector = `[data-cid="${CSS.escape(addedFocus.id)}"][data-d="${CSS.escape(addedFocus.iso)}"]`;
      const row = document.querySelector<HTMLElement>(selector);
      if (!row) {
        if (Date.now() < deadline) requestAnimationFrame(reveal);
        return;
      }
      row.classList.add("ps-hl");
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      clear = setTimeout(() => {
        row.classList.remove("ps-hl");
        setAddedFocus(null);
      }, 3000);
    };
    requestAnimationFrame(reveal);
    return () => {
      stopped = true;
      if (clear) clearTimeout(clear);
    };
  }, [addedFocus]);

  const closeFind = () => {
    setFind(false);
    router.refresh();
  };

  const coachById = useMemo(() => new Map(coaches.map((c) => [c.id, c])), [coaches]);
  const favoriteIds = useMemo(() => new Set(favIds), [favIds]);

  // The viewer's pin: taken silently when the browser already granted it
  // somewhere else (the studio tiles say how far, the rail sorts by real
  // miles), and asked for the first time a distance is picked and never
  // before, because a screen that asks for location on arrival is a
  // screen people say no to.
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => {
        if (p.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => {},
        );
      })
      .catch(() => {
        // No permissions API: stay quiet rather than prompting.
      });
  }, []);

  const placeNames = useMemo(
    () => [...new Set(items.map((i) => i.where).filter((w): w is string => !!w))].sort(),
    [items],
  );

  const anyFilter =
    f.time !== "any" || f.dist !== "any" || f.cat !== "any" || f.place !== "any";

  const passes = (i: FeedItem): boolean => {
    if (f.cat !== "any" && i.classType !== f.cat) return false;
    if (f.place !== "any" && !(f.place as string[]).includes(i.where ?? "")) return false;
    if (f.time !== "any") {
      const h = i.mins / 60;
      if (f.time === "am" && h >= 11) return false;
      if (f.time === "mid" && (h < 11 || h >= 16)) return false;
      if (f.time === "pm" && h < 16) return false;
    }
    if (f.dist !== "any" && geo && i.lat !== null && i.lng !== null) {
      // A class with no pin, or a viewer without one, passes: a distance
      // filter that can't be computed must widen, never silently hide.
      if (milesBetween(geo, { lat: i.lat, lng: i.lng }) > Number(f.dist)) return false;
    }
    return true;
  };

  const coachOptions = useMemo(
    () => myRail.filter((person) => person.id !== meId),
    [myRail, meId],
  );
  const studioOptions = useMemo(
    () => savedStudios,
    [savedStudios],
  );
  const groupOptions = useMemo(() => socialGroups, [socialGroups]);
  const calendarDirectoryItems = useMemo(() => {
    const items = calendarDirectoryTab === "people"
      ? coachOptions.map((coach) => ({ id:coach.id, name:coach.name, photo:coach.photo, color:coach.color, href:coach.handle ? `/${coach.handle}` : "", handle:coach.handle, slug:"", kind:"people" as const }))
      : calendarDirectoryTab === "studios"
        ? studioOptions.map((studio) => ({ id:studio.id, name:studio.name, photo:studio.photo, color:studio.color, href:`/s/${studio.slug}`, handle:"", slug:studio.slug, kind:"studios" as const }))
        : groupOptions.map((group) => ({ id:group.id, name:group.name, photo:group.photo, color:"var(--color-surface-muted)", href:`/g/${group.slug}`, handle:"", slug:group.slug, kind:"groups" as const }));
    const query = calendarDirectoryQuery.trim().toLocaleLowerCase();
    return query ? items.filter((item) => item.name.toLocaleLowerCase().includes(query)) : items;
  }, [calendarDirectoryQuery, calendarDirectoryTab, coachOptions, studioOptions, groupOptions]);
  const toggleDirectoryFollow = async (item: { id:string; handle:string|null; slug:string; kind:"people"|"studios"|"groups" }) => {
    const key = `${item.kind}:${item.id}`;
    if (calendarDirectoryBusy) return;
    const following = calendarDirectoryFollowing[key] ?? true;
    setCalendarDirectoryBusy(key);
    let ok = false;
    if (item.kind === "people" && item.handle) {
      const { followTrainer, unfollowTrainer } = await import("@/app/actions/subscribe");
      const result = following ? await unfollowTrainer(item.handle) : await followTrainer(item.handle);
      ok = result.ok;
    } else if (item.kind === "studios") {
      const { toggleStudioVisit } = await import("@/app/actions/endorsements");
      const result = await toggleStudioVisit(item.slug);
      ok = result.ok;
    } else if (item.kind === "groups") {
      const { toggleGroupFavorite } = await import("@/app/actions/groups");
      const result = await toggleGroupFavorite(item.slug);
      ok = result.ok;
    }
    if (ok) {
      setCalendarDirectoryFollowing((current) => ({ ...current, [key]:!following }));
      window.dispatchEvent(new Event("calendar-pins-changed"));
    }
    setCalendarDirectoryBusy(null);
  };
  const sortedCoachOptions = useMemo(() => [...coachOptions].sort((a, b) => Number(pins.has(`person:${b.id}`)) - Number(pins.has(`person:${a.id}`))), [coachOptions, pins]);
  const togglePerson = (id: string) => {
    if (selectedPeople.has(id)) {
      setIncludeYou(true);
      setSelectedPeople(new Set());
      setCalendarFilter("all");
      return;
    }
    setIncludeYou(false);
    setSelectedPeople(new Set([id]));
    setCalendarFilter("people");
  };
  const soleSelectedCoach = !includeYou && selectedPeople.size === 1
    ? coachOptions.find((coach) => selectedPeople.has(coach.id)) ?? null
    : null;
  const calendarCount = 1 + coachOptions.length + studioOptions.length + groupOptions.length;

  const selectedCalendar = useMemo(() => {
    if (calendarFilter === "all") return {
      name: "All",
      href: "/following",
      label: `${calendarCount} ${calendarCount === 1 ? "calendar" : "calendars"}`,
      action: "Manage",
    };
    if (calendarFilter === "you") return {
      name: "You",
      href: "/calendar",
      label: "Your calendar",
      action: "Manage",
    };
    if (calendarFilter === "following") return {
      name: "Following",
      href: "/following",
      label: "Following calendars",
      action: "Manage",
    };
    if (calendarFilter === "people") return {
      name: "People",
      href: "",
      label: `You + ${selectedPeople.size}`,
      action: "",
    };
    if (calendarFilter.startsWith("coach:")) {
      const coach = coachOptions.find((option) => option.id === calendarFilter.slice(6));
      return coach ? { name: coach.name, href: coach.handle ? `/${coach.handle}` : "", label: `${coach.name.split(/\s+/)[0]}’s calendar`, action: "View profile" } : null;
    }
    if (calendarFilter.startsWith("studio:")) {
      const studio = studioOptions.find((option) => option.id === calendarFilter.slice(7));
      return studio ? { name: studio.name, href: `/s/${studio.slug}`, label: `${studio.name}’s calendar`, action: "View profile" } : null;
    }
    const group = groupOptions.find((option) => option.id === calendarFilter.slice(6));
    return group ? { name: group.name, href: `/g/${group.slug}`, label: `${group.name}’s calendar`, action: "View profile" } : null;
  }, [calendarFilter, calendarCount, coachOptions, studioOptions, groupOptions, selectedPeople.size]);

  const shown = useMemo(() => {
    const studioHrefs = new Set(studioOptions.map((studio) => `/s/${studio.slug}`));
    const groupKeys = new Set(groupOptions.flatMap((group) => group.classKeys));
    return items.filter((item) => {
      if (!passes(item)) return false;
      if (!isHome) return true;
      if (calendarFilter === "you") return item.saved || item.shift || (!!meId && item.coachId === meId);
      if (calendarFilter === "people") return (includeYou && (item.saved || item.shift || (!!meId && item.coachId === meId))) || selectedPeople.has(item.coachId);
      if (calendarFilter === "following") {
        const fromPeople = favoriteIds.has(item.coachId);
        const fromStudios = Boolean(item.whereHref && studioHrefs.has(item.whereHref));
        const fromGroups = groupKeys.has(item.key);
        return fromPeople || fromStudios || fromGroups;
      }
      if (calendarFilter.startsWith("coach:")) return item.coachId === calendarFilter.slice(6);
      if (calendarFilter.startsWith("studio:")) {
        const studio = studioOptions.find((option) => option.id === calendarFilter.slice(7));
        return Boolean(studio && item.whereHref === `/s/${studio.slug}`);
      }
      if (calendarFilter.startsWith("group:")) {
        const group = groupOptions.find((option) => option.id === calendarFilter.slice(6));
        return Boolean(group?.classKeys.includes(item.key));
      }
      // The rail is presentation and may be progressively truncated. The
      // relationship itself is the source of truth for the combined view,
      // otherwise a class from followed person 17 can vanish on first paint.
      const fromPeople = item.saved || (!!meId && item.coachId === meId) || favoriteIds.has(item.coachId);
      const fromStudios = Boolean(item.whereHref && studioHrefs.has(item.whereHref));
      const fromGroups = groupKeys.has(item.key);
      return fromPeople || fromStudios || fromGroups;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, f, geo, isHome, meId, calendarFilter, coachOptions, studioOptions, groupOptions, favoriteIds, selectedPeople, includeYou]);

  // A brand-new account has no useful calendar identity to put in the rail
  // yet. Showing a lone “You” circle above an empty state makes the circle
  // look like content when it is really only a placeholder. Once they follow,
  // save, join, or add anything, the normal rail comes back.
  const firstRun = isHome
    && includeYou
    && (calendarFilter === "all" || calendarFilter === "you")
    && follows === 0
    && savedStudios.length === 0
    && socialGroups.length === 0
    && shown.length === 0;

  // The rail of days: as far ahead as the feed itself looks, every day
  // drawn whether or not it holds anything, because a gap in the dates
  // reads as a broken calendar rather than a quiet Tuesday.
  const dayTabs = useMemo(() => {
    let last = todayIso;
    for (const i of items) if (i.iso > last) last = i.iso;
    const out: { iso: string; label: string }[] = [];
    for (let iso = todayIso, n = 0; iso <= last || n < 14; iso = plusDays(iso, 1), n++) {
      out.push({ iso, label: n === 0 ? "Today" : tabLabel(iso) });
      if (n > 30) break;
    }
    return out;
  }, [items, todayIso]);

  // One row mapping. The compact feed keeps time, class, place and coach;
  // duration belongs in the class detail rather than every scanning row.
  const rowOf = (i: FeedItem): WeekRow & { item: FeedItem } => {
    const c = coachById.get(i.coachId);
    const coachName = i.assignedCoachName ?? (c && !sameCalendarIdentity(c, i.where) ? c.name : null);
    return {
      item: i,
      key: i.key,
      name: i.name,
      where: i.where,
      hm: i.hm,
      ap: i.ap,
      tag: meId && i.coachId === meId ? "You" : undefined,
      tagTone: meId && i.coachId === meId ? "coaching" : undefined,
      coach: coachName ? { id: c?.id ?? i.classId, name: coachName, color: c?.color ?? "var(--color-olive)", photo: i.assignedCoachName ? null : c?.photo ?? null } : null,
      onTap: () => setPeek(peekOf(i, c ?? null, favoriteIds.has(i.coachId))),
    };
  };

  // The selected day's rows.
  const dayRows: (WeekRow & { item: FeedItem })[] = useMemo(() => {
    const list = shown.filter((i) => i.iso === day).sort((a, b) => a.mins - b.mins);
    return list.map(rowOf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, day, coachById, favIds]);

  // Calendar is a rolling month: today plus the following thirty days. The
  // server expands that exact range, independent of where today lands in its
  // calendar week.
  const homeRows: FeedItem[] = useMemo(
    () => {
      const monthEnd = plusDays(todayIso, 30);
      return [...shown]
        .filter((item) => item.iso >= todayIso && item.iso <= monthEnd)
        .sort((a, b) => a.iso.localeCompare(b.iso) || a.mins - b.mins);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, todayIso],
  );
  const homeDays = useMemo(() => {
    const days = new Map<string, FeedItem[]>();
    for (const item of homeRows) {
      const rows = days.get(item.iso);
      if (rows) rows.push(item);
      else days.set(item.iso, [item]);
    }
    return [...days.entries()].map(([iso, rows]) => ({
      iso,
      label: daySectionLabel(iso, todayIso),
      today: iso === todayIso,
      rows,
    }));
  }, [homeRows, todayIso]);
  const visibleHomeDays = homeDays.slice(0, visibleHomeDayCount);
  const monthItems = useMemo(() => {
    const mapped = new Map<string, MonthCellItem[]>();
    for (const item of homeRows) {
      const relation = calendarRelation(item, meId);
      const next: MonthCellItem = {
        kind: relation.tone === "attending" ? "added" : relation.tone,
        name: item.name,
        at: item.mins,
      };
      const current = mapped.get(item.iso);
      if (current) current.push(next);
      else mapped.set(item.iso, [next]);
    }
    return mapped;
  }, [homeRows, meId]);

  const openMonthDay = (iso: string) => {
    setCalendarView("day");
    window.setTimeout(() => document.getElementById(`feed-day-${iso}`)?.scrollIntoView({ block: "start" }), 0);
  };
  useEffect(() => {
    if (!isHome || visibleHomeDayCount >= homeDays.length) return undefined;
    const target = homeMoreRef.current;
    if (!target) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setVisibleHomeDayCount(homeDays.length);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisibleHomeDayCount((count) => Math.min(homeDays.length, count + 4));
    }, { rootMargin: "800px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [homeDays.length, isHome, visibleHomeDayCount]);

  // The date rail only wears a ground once it is actually pinned: at rest
  // it sits on the page like the chips above it, and the solid appears
  // the moment rows would otherwise scroll through it.
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return undefined;
    let raf = 0;
    const check = () => {
      raf = 0;
      const top = parseFloat(getComputedStyle(el).top) || 0;
      el.classList.toggle("stuck", el.getBoundingClientRect().top <= top + 1);
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [items.length]);

  // Hide the rail rather than draw it dead: following nobody keeps the
  // teaching state (ghosts and one line), following only people with
  // nothing coming up hides the block entirely.

  const pickDist = (v: Filters["dist"], close: boolean) => {
    if (v !== "any" && !geo && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => toast("Distance needs your location. Everything shows meanwhile."),
      );
    }
    setF((cur) => ({ ...cur, dist: v }));
    if (close) setSheet(null);
  };

  const activeCount =
    (f.time !== "any" ? 1 : 0) +
    (f.dist !== "any" ? 1 : 0) +
    (f.cat !== "any" ? 1 : 0) +
    (f.place !== "any" ? 1 : 0);

  // The option rows, shared by the single-question sheets and the
  // everything sheet behind the leading chip: one renderer, so the two
  // can never offer different answers. `close` is the single-question
  // behavior; the everything sheet stays open while you set several.
  const timeOpts = (close: boolean) =>
    TIMES.map(([v, label]) => (
      <button
        key={v}
        className="fopt"
        aria-pressed={f.time === v}
        onClick={() => {
          setF((cur) => ({ ...cur, time: v }));
          if (close) setSheet(null);
        }}
      >
        {label}
        {f.time === v && <Icon name="check" size={19} />}
      </button>
    ));
  const distOpts = (close: boolean) =>
    DISTS.map(([v, label]) => (
      <button key={v} className="fopt" aria-pressed={f.dist === v} onClick={() => pickDist(v, close)}>
        {label}
        {f.dist === v && <Icon name="check" size={19} />}
      </button>
    ));
  const catOpts = (close: boolean) =>
    ["any", ...cats].map((v) => (
      <button
        key={v}
        className="fopt"
        aria-pressed={f.cat === v}
        onClick={() => {
          setF((cur) => ({ ...cur, cat: v }));
          if (close) setSheet(null);
        }}
      >
        {v === "any" ? "All types" : v}
        {f.cat === v && <Icon name="check" size={19} />}
      </button>
    ));
  const placeOpts = () => (
    <>
      <button
        className="fopt"
        aria-pressed={f.place === "any"}
        onClick={() => setF((cur) => ({ ...cur, place: "any" }))}
      >
        All places
        {f.place === "any" && <Icon name="check" size={19} />}
      </button>
      {placeNames.map((n) => {
        const on = f.place !== "any" && (f.place as string[]).includes(n);
        return (
          <button
            key={n}
            className="fopt"
            aria-pressed={on}
            onClick={() =>
              setF((cur) => {
                const sel = cur.place === "any" ? [] : [...(cur.place as string[])];
                const at = sel.indexOf(n);
                if (at > -1) sel.splice(at, 1);
                else sel.push(n);
                return { ...cur, place: sel.length ? sel : "any" };
              })
            }
          >
            {n}
            {on && <Icon name="check" size={19} />}
          </button>
        );
      })}
    </>
  );

  const chipLabel = (k: "time" | "dist" | "cat" | "place"): string => {
    if (k === "time") return TIMES.find(([v]) => v === f.time)![1].split(",")[0];
    if (k === "dist") return DISTS.find(([v]) => v === f.dist)![1];
    if (k === "cat") return f.cat === "any" ? "All types" : f.cat;
    if (f.place === "any") return "All places";
    const p = f.place as string[];
    return p.length === 1 ? p[0] : `${p.length} places`;
  };

  return (
    <>
      {!isHome && (
        <header className="upcoming-head">
          <Link className="upcoming-back" href="/feed">
            <Icon name="arrow_back" size={20} /> This Week
          </Link>
          <h1>Upcoming near you</h1>
          <p>Browse classes by day, time, distance, type, or place.</p>
        </header>
      )}
      {isHome && (
        <header className="calendar-tab-header">
          <h1>Calendar</h1>
          <div className="calendar-tab-actions">
            <button type="button" className="tab-page-notifications" aria-label="Open notifications" onClick={() => setNotificationsOpen(true)}><Icon name="notifications" size={22} /></button>
            <GlobalAdd
              classOnly
              triggerClassName="calendar-header-add"
              triggerIconSize={22}
              onCalendarChange={(focus) => {
                if (!focus) return;
                setIncludeYou(true);
                setSelectedPeople(new Set());
                setCalendarFilter("you");
                setCalendarView("day");
                setVisibleHomeDayCount(Number.MAX_SAFE_INTEGER);
                setAddedFocus(focus);
              }}
            />
          </div>
        </header>
      )}
      {isHome && !firstRun && (
        <header className="following-head">
          <div className="calendar-scope-row" aria-label="Calendar scope">
            <button type="button" className={`calendar-person-chip${calendarFilter === "all" ? " on" : ""}`} aria-pressed={calendarFilter === "all"} onClick={() => { setIncludeYou(true); setSelectedPeople(new Set()); setCalendarFilter("all"); }}><span className="calendar-person-face calendar-all-face"><Icon name="calendar_month" size={29} /></span><small>All</small></button>
            <button type="button" className={`calendar-person-chip${calendarFilter === "you" ? " on" : ""}`} aria-pressed={calendarFilter === "you"} onClick={() => { const selecting = calendarFilter !== "you"; setIncludeYou(selecting); setSelectedPeople(new Set()); setCalendarFilter(selecting ? "you" : "people"); }}><span className="calendar-person-face" style={{ background:meFace.color }}>{meFace.photo ? <img src={meFace.photo} alt="" /> : <span>{(meFace.name.trim().charAt(0) || "?").toUpperCase()}</span>}</span><small>You</small></button>
            {sortedCoachOptions.map((coach) => <button key={coach.id} type="button" className={`calendar-person-chip${selectedPeople.has(coach.id) ? " on" : ""}`} aria-pressed={selectedPeople.has(coach.id)} onClick={() => togglePerson(coach.id)}><span className="calendar-person-face" style={{ background:coach.color }}>{coach.photo ? <img src={coach.photo} alt="" loading="lazy" decoding="async" /> : <span>{(coach.name.trim().charAt(0) || "?").toUpperCase()}</span>}{pins.has(`person:${coach.id}`) && <Icon className="calendar-person-star" name="star_filled" size={26} />}</span><small>{coach.name.split(/\s+/)[0]}</small></button>)}
            <Link className="calendar-person-chip calendar-discover-chip" href="/discover?half=people" aria-label="Discover more people"><span className="calendar-person-face"><Icon name="search" size={25} /></span><small>Discover</small></Link>
          </div>
        </header>
      )}
      {isHome && selectedCalendar && calendarFilter !== "all" && calendarFilter !== "following" && calendarFilter !== "people" && (
        <div className="feedfilterbar following-coach-context">
          <span className="feedfilter-txt">{selectedCalendar.label}</span>
          {calendarFilter === "you" ? <PersonalCalendarSheetTrigger className="feedfilter-link" ariaLabel="Manage calendar">{selectedCalendar.action} <Icon name="chevron_right" size={17} /></PersonalCalendarSheetTrigger> : selectedCalendar.href && <Link href={`${selectedCalendar.href}?from=feed`} className="feedfilter-link">{selectedCalendar.action} <Icon name="chevron_right" size={17} /></Link>}
        </div>
      )}
      {isHome && !firstRun && calendarFilter === "all" && (
        <div className="feedfilterbar following-coach-context">
          <span className="feedfilter-txt calendar-following-summary">Following {calendarCount} {calendarCount === 1 ? "calendar" : "calendars"}</span>
          <button type="button" className="feedfilter-link" onClick={() => { setCalendarDirectoryQuery(""); setCalendarDirectoryTab("people"); setCalendarDirectoryOpen(true); }}>View all <Icon name="chevron_right" size={17} /></button>
        </div>
      )}
      {isHome && calendarFilter === "people" && selectedPeople.size > 0 && (
        <div className="feedfilterbar following-coach-context">
          <span className="feedfilter-txt">{soleSelectedCoach ? `${soleSelectedCoach.name.split(/\s+/)[0]}’s calendar` : `${selectedPeople.size + Number(includeYou)} calendars selected`}</span>
          {soleSelectedCoach?.handle
            ? <Link className="feedfilter-link" href={`/${soleSelectedCoach.handle}?from=feed`}>See profile <Icon name="chevron_right" size={17} /></Link>
            : <button type="button" className="feedfilter-link" onClick={() => { setIncludeYou(true); setSelectedPeople(new Set()); setCalendarFilter("all"); }}>Reset</button>}
        </div>
      )}
      {isHome && calendarFilter === "people" && !includeYou && selectedPeople.size === 0 ? (
        <div className="calendar-selection-empty"><h2>No calendars selected</h2><p>Tap a person above to see what’s on their calendar.</p></div>
      ) : isHome && shown.length === 0 && calendarPending ? (
        <div className="calendar-stream-loading" role="status">Loading your schedule</div>
      ) : (isHome ? shown.length === 0 : items.length === 0) ? (
        firstRun ? (
          <section className="calendar-onboarding-empty" aria-labelledby="calendar-empty-title">
            <div className="calendar-onboarding-hero">
              <h2 id="calendar-empty-title">{meKind === "member" ? "Find something worth showing up for" : "Your schedule starts here"}</h2>
            </div>
            <div className="calendar-onboarding-body">
              <ol className="calendar-onboarding-steps">
                {(meKind === "member" ? [
                  ["Follow your favorites", "Follow coaches, studios, and groups you care about."],
                  ["Build your week", "Save classes and add the ones you plan to attend."],
                  ["Bring people along", "Share your week and make plans with friends."],
                ] : [
                  ["Add your classes", "Add classes, shifts, and the studios where you teach."],
                  ["Build your week", "Keep your schedule organized in one calendar."],
                  ["Share everywhere", "Share your week so clients and friends know where to find you."],
                ]).map(([title, copy], index) => <li key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{copy}</p></div></li>)}
              </ol>
              {meKind === "member"
                ? <Link className="calendar-onboarding-cta" href="/discover">Discover calendars</Link>
                : <PersonalCalendarSheetTrigger className="calendar-onboarding-cta" ariaLabel="Add your first class" openAdder>Add your first class</PersonalCalendarSheetTrigger>}
            </div>
          </section>
        ) : <>
          <div className="wkempty">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="wkempty-fig"
              src="/illustrations/following-empty.png"
              alt=""
              width={356}
              height={600}
            />
            <h2 className="wkempty-t">{isHome ? "Nothing on your schedule yet" : "Nothing near you yet"}</h2>
            <p className="wkempty-b">
              {isHome
                ? firstRun
                  ? meKind === "member"
                    ? "Follow a calendar to start filling your schedule."
                    : "Add the first class you teach to start your schedule."
                  : "Save a class you want to remember, or add something of your own."
                : "Classes show up here as coaches list them. Try broadening your filters."}
            </p>
            {isHome && (firstRun ? (
              <div className="wkempty-actions single">
                {meKind === "member" ? (
                  <Link className="btn si" href="/discover">Find a calendar to follow</Link>
                ) : (
                  <Link className="btn si" href="/calendar?add=1">Add your first class</Link>
                )}
              </div>
            ) : (
              <div className="wkempty-actions">
                <Link className="btn si" href="/search">Find classes</Link>
                <button className="btn ghost" type="button" onClick={() => setFind(true)}>Find calendars</button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* The four chips say their current value, which is what lets one
              row replace five pills; the leading chip opens everything at
              once wearing the count of what is set. */}
          {!isHome && (
            <div className="catpills fchips upcoming-filters">
              <button
                className={`catpill fchip-lead${activeCount ? " on" : ""}`}
                aria-label={`Filters${activeCount ? `, ${activeCount} set` : ""}`}
                onClick={() => setSheet("all")}
              >
                <Icon name="tune" size={17} />
                {activeCount > 0 && <span>{activeCount}</span>}
              </button>
              {(
                [
                  ["time", f.time !== "any"],
                  ["dist", f.dist !== "any"],
                  ["cat", f.cat !== "any"],
                  ["place", f.place !== "any"],
                ] as const
              ).map(([k, on]) => (
                <button
                  key={k}
                  className={`catpill${on ? " on" : ""}`}
                  aria-pressed={on}
                  onClick={() => setSheet(k)}
                >
                  {chipLabel(k)} <Icon name="expand_more" size={16} />
                </button>
              ))}
              {anyFilter && (
                <button className="catpill fchip-clear" onClick={() => setF(NO_FILTERS)}>
                  Clear
                </button>
              )}
            </div>
          )}

          {/* The date rail and its rows share a containing block. Sticky
              therefore lasts exactly as long as the class list beneath it,
              and releases before the studio and people sections begin. */}
          <div className={`home-listregion${isHome ? "" : " upcoming-listregion"}`}>
            {!isHome && (
              <div ref={tabsRef} className="daytabs" role="tablist" aria-label="Day">
                {dayTabs.map((t) => (
                  <button
                    key={t.iso}
                    role="tab"
                    aria-selected={day === t.iso}
                    className={`daytab${day === t.iso ? " on" : ""}`}
                    onClick={() => setDay(t.iso)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

          <div className="cardwrap home-schedule">
            {isHome && calendarView === "month" ? (
              <>
                <MonthHeadRow />
                <MonthScroll todayIso={todayIso} items={monthItems} onDay={openMonthDay} onMonthInView={() => {}} monthsAhead={1} />
              </>
            ) : isHome ? (
                <div className="cash-activity-list">
                  {visibleHomeDays.map((section) => (
                    <section className="cash-day" id={`feed-day-${section.iso}`} key={section.iso}>
                      <h2>{section.label}</h2>
                      <div>
                        {section.rows.map((item) => {
                          const coach = coachById.get(item.coachId);
                          const studio = item.whereHref ? studioOptions.find((option) => `/s/${option.slug}` === item.whereHref) : null;
                          const coachName = item.assignedCoachName ?? (coach && !sameCalendarIdentity(coach, item.where) ? coach.name : null);
                          const sourceName = coachName ?? studio?.name ?? null;
                          const sourcePhoto = coach?.photo ?? studio?.photo ?? null;
                          const sourceColor = coach?.color ?? studio?.color ?? "var(--color-olive)";
                          const relation = calendarRelation(item, meId);
                          const ownedByYou = item.shift || (!!meId && item.coachId === meId);
                          const isYourItem = item.saved || item.shift || (!!meId && item.coachId === meId);
                          const displaySourceName = ownedByYou ? meFace.name : sourceName;
                          const displaySourcePhoto = ownedByYou ? meFace.photo : sourcePhoto;
                          const displaySourceColor = ownedByYou ? meFace.color : sourceColor;
                          const showSourceAvatar = Boolean(displaySourceName);
                          return <article className="cash-class-row" key={item.key} data-cid={item.classId} data-d={item.iso}>
                            <button type="button" className={`cash-class-main ${relation.tone}${showSourceAvatar ? " has-source-avatar" : ""}`} onClick={() => setPeek(peekOf(item, coach ?? null, favoriteIds.has(item.coachId)))}>
                              {showSourceAvatar && displaySourceName && <span className={`cash-class-avatar${!ownedByYou && !coach && studio ? " studio" : ""}`} style={{ background:displaySourceColor }}>{displaySourcePhoto ? <img src={displaySourcePhoto} alt="" /> : <span>{(displaySourceName.trim().charAt(0) || "?").toUpperCase()}</span>}</span>}
                              <span className="cash-class-copy">
                                {displaySourceName && <span className="cash-class-coachline"><small>{displaySourceName}</small>{ownedByYou && <span className="cash-you-tag">You</span>}{!ownedByYou && coachName && !item.assignedCoachName && pins.has(`person:${item.coachId}`) && <Icon name="star_filled" className="cash-class-favorite" size={15} />}{isYourItem && <span className={`cash-relation-tag ${relation.tone}`}>{relation.label}</span>}</span>}
                                <span className="cash-class-title-row"><strong>{item.name}</strong><strong className="cash-class-time">{item.hm}{item.ap.toLowerCase()}</strong></span>
                                <span className="cash-class-studio-row"><span className="cash-class-studio">{item.where || "Location to come"}</span><span className="cash-class-duration">{item.durationMin} min</span></span>
                              </span>
                            </button>
                          </article>;
                        })}
                      </div>
                    </section>
                  ))}
                  {visibleHomeDayCount < homeDays.length && <div className="cash-days-more" ref={homeMoreRef} aria-hidden="true" />}
                </div>
              ) : (
                <>
              {/* Why Today isn't the selected tab, said once: the landing
                  skipped ahead to the first day holding anything. */}
              {landed.current !== todayIso && day === landed.current && (
                <p className="daynote">
                  No classes today, showing{" "}
                  {landed.current === plusDays(todayIso, 1) ? "tomorrow" : tabLabel(landed.current)}
                </p>
              )}
              {dayRows.length === 0 ? (
                anyFilter ? (
                  // The empty state knows why it is empty: never "nobody has
                  // added classes" when the truth is the filter.
                  <p className="dayempty">
                    Nothing matches on {day === todayIso ? "today" : tabLabel(day)}. Try widening
                    the time or distance.
                  </p>
                ) : (
                  <p className="dayempty">Nothing on {day === todayIso ? "today" : tabLabel(day)}.</p>
                )
              ) : (
                <div className="disflat">{dayRows.map(renderRow())}</div>
              )}
                </>
              )}
          </div>
          </div>
        </>
      )}

      {/* Empty-state discovery stays in a sheet; normal discovery is the
          header search and the Discover classes link. */}
      {isHome && find && <DiscoverSheet onClose={closeFind} />}
      {isHome && notificationsOpen && <NotificationsSheet onClose={() => setNotificationsOpen(false)} />}
      {isHome && calendarDirectoryOpen && <BodyPortal><div className="calendar-directory-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCalendarDirectory(); }}><section className={`calendar-directory-sheet${calendarDirectoryDragging ? " is-pulling" : ""}`} style={{ transform:`translateY(${calendarDirectoryDragY}px)` }} role="dialog" aria-modal="true" aria-labelledby="calendar-directory-title" onMouseDown={(event) => event.stopPropagation()} onTouchStart={startCalendarDirectoryPull} onTouchMove={moveCalendarDirectoryPull} onTouchEnd={endCalendarDirectoryPull} onTouchCancel={endCalendarDirectoryPull}><div className="calendar-directory-head"><h2 id="calendar-directory-title">Following</h2><button type="button" aria-label="Close calendars" onClick={closeCalendarDirectory}><Icon name="close" size={21} /></button></div><label className="calendar-directory-search"><Icon name="search" size={20} /><input type="search" value={calendarDirectoryQuery} onChange={(event) => setCalendarDirectoryQuery(event.target.value)} placeholder={`Search ${calendarDirectoryTab}`} /></label><div className="calendar-directory-tabs" role="tablist" aria-label="Calendar type">{(["people","studios","groups"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={calendarDirectoryTab === tab} className={calendarDirectoryTab === tab ? "on" : ""} onClick={() => setCalendarDirectoryTab(tab)}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>)}</div><div className="calendar-directory-list" ref={calendarDirectoryListRef}>{calendarDirectoryItems.map((item) => { const key=`${item.kind}:${item.id}`; const following=calendarDirectoryFollowing[key] ?? true; return <div className="calendar-directory-row" key={key}><Link href={item.href} onClick={closeCalendarDirectory}><span style={{ background:item.color }}>{item.photo ? <img src={item.photo} alt="" /> : (item.name.trim().charAt(0) || "?").toUpperCase()}</span><strong>{item.name}</strong></Link><button type="button" className={following ? "on" : ""} disabled={calendarDirectoryBusy === key} onClick={() => void toggleDirectoryFollow(item)}>{following ? "Following" : "Follow"}</button></div>})}{calendarDirectoryItems.length === 0 && <p>No {calendarDirectoryTab} found.</p>}</div></section></div></BodyPortal>}

      {/* The filter sheets. The places one stays open while you tick,
          because multi-select through a closing sheet is miserable. */}
      {sheet && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSheet(null);
          }}
        >
          <div className="sheet fsheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setSheet(null)}>
              <Icon name="close" size={18} />
            </button>
            <h2>
              {sheet === "all"
                ? "Filters"
                : sheet === "time"
                  ? "Time of day"
                  : sheet === "dist"
                    ? "Distance"
                    : sheet === "cat"
                      ? "Type"
                      : "Places"}
            </h2>
            <div className="fopts">
              {sheet === "time" && timeOpts(true)}
              {sheet === "dist" && distOpts(true)}
              {sheet === "cat" && catOpts(true)}
              {sheet === "place" && placeOpts()}
              {sheet === "all" && (
                <>
                  <p className="fsec-h">Time of day</p>
                  {timeOpts(false)}
                  <p className="fsec-h">Distance</p>
                  {distOpts(false)}
                  {cats.length > 0 && (
                    <>
                      <p className="fsec-h">Type</p>
                      {catOpts(false)}
                    </>
                  )}
                  {placeNames.length > 0 && (
                    <>
                      <p className="fsec-h">Places</p>
                      {placeOpts()}
                    </>
                  )}
                </>
              )}
            </div>
            {/* Every filter sheet ends the same way, and the footer is
                sticky so Done and the way out of every filter are on
                screen the whole scroll, by Matt's call. */}
            <div className="publishwrap fsheet-foot">
              <button className="btn si" onClick={() => setSheet(null)}>
                Done
              </button>
              {anyFilter && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    setF(NO_FILTERS);
                    setSheet(null);
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {peek && (
        <ClassPeek
          cls={peek}
          onClose={() => setPeek(null)}
          onToast={notify}
          onChanged={() => {}}
        />
      )}
      {personPeekOpen && (
        <CoachPeek
          id={personPeekOpen.id}
          name={personPeekOpen.name}
          photo={personPeekOpen.photo}
          color={personPeekOpen.color}
          self={personPeekOpen.self}
          pinned={!personPeekOpen.self && pins.has(`person:${personPeekOpen.id}`)}
          onPinChange={!personPeekOpen.self ? (pinned) => setPins((current) => { const next=new Set(current); const key=`person:${personPeekOpen.id}`; if(pinned)next.add(key);else next.delete(key); return next; }) : undefined}
          onClose={() => setPersonPeekOpen(null)}
        />
      )}
      {entityPeekOpen && <EntityCalendarPeek entity={entityPeekOpen} coaches={coachById} meId={meId} pinned={entityPeekOpen.type==="studio" && pins.has(`studio:${entityPeekOpen.id}`)} onPinned={(pinned)=>setPins((current)=>{const next=new Set(current);const key=`studio:${entityPeekOpen.id}`;if(pinned)next.add(key);else next.delete(key);return next;})} onClose={()=>setEntityPeekOpen(null)} />}
      <Toast msg={toastMsg} on={toastOn} action={toastAction} />
    </>
  );
}

function EntityCalendarPeek({ entity, coaches, meId, pinned, onPinned, onClose }: {
  entity: { type: "studio" | "group"; id: string; name: string; photo: string | null; color: string; href: string; items: FeedItem[] };
  coaches: Map<string, FeedCoach>;
  meId?: string;
  pinned: boolean;
  onPinned: (pinned: boolean) => void;
  onClose: () => void;
}) {
  const [busy, start] = useTransition();
  const sorted = entity.items.slice().sort((a, b) => a.iso.localeCompare(b.iso) || a.mins - b.mins);
  return (
    <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="sheet sheet-full peeksheet entity-peeksheet">
        <div className="peekcontrols">
          <button className="iconbtn sheetclose peekclose" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
          {entity.type === "studio" && (
            <button className={`iconbtn peekpin${pinned ? " on" : ""}`} disabled={busy} aria-label={pinned ? "Remove favorite" : "Favorite"} onClick={() => {
              const next = !pinned;
              onPinned(next);
              start(async () => {
                const result = await toggleCalendarPin("studio", entity.id);
                if (!result.ok) {
                  onPinned(!next);
                  return;
                }
                onPinned(result.pinned);
                window.dispatchEvent(new Event("calendar-pins-changed"));
              });
            }}><Icon name={pinned ? "star_filled" : "star"} size={23} /></button>
          )}
        </div>
        <div className="peekhead peekhead-stack">
          <span className="peekav">{entity.photo ? <img src={entity.photo} alt="" /> : <span className="peekav-ini" style={{ background: entity.color }}><Icon name={entity.type === "studio" ? "storefront" : "groups"} size={25} /></span>}</span>
          <h2 className="peekhead-nm">{entity.name}</h2>
          <div className="peekacts"><Link className="peekfollow peekaction" href={entity.href}><Icon name={entity.type === "studio" ? "storefront" : "groups"} size={18} /><span>View profile</span></Link></div>
        </div>
        {sorted.length ? (
          <div className="cash-activity-list entity-peek-list">
            {sorted.map((item) => {
              const coach = coaches.get(item.coachId);
              const coachName = item.assignedCoachName ?? (coach && !sameCalendarIdentity(coach, item.where) ? coach.name : null);
              return <Link className={`cash-class-main${item.shift ? " shift" : item.coachId === meId ? " coaching" : item.saved ? " saved" : ""}`} href={`/${item.base}/${item.classId}?d=${item.iso}`} key={item.key}>
                <span className="cash-class-copy">
                  {(coachName || item.shift) && <span className="cash-class-coachline">{coachName && <small>{coachName}</small>}{item.shift && <span className="cash-shift-tag">Shift</span>}</span>}
                  <span className="cash-class-title-row"><strong>{item.name}</strong><strong className="cash-class-time">{item.hm}{item.ap.toLowerCase()}</strong></span>
                  <span className="cash-class-studio-row"><span className="cash-class-studio">{tabLabel(item.iso)} · {item.where || entity.name}</span><span className="cash-class-duration">{item.durationMin} min</span></span>
                </span>
              </Link>;
            })}
          </div>
        ) : <p className="peekempty">Nothing coming up right now.</p>}
      </div>
    </div>
  );
}

/** One chronological class row. Following and discovery are reading surfaces;
 * booking and RSVP live in the class detail rather than a calendar toggle. */
const renderRow =
  (labelFrom?: string) =>
  // eslint-disable-next-line react/display-name
  (r: WeekRow & { item: FeedItem }) => (
    <div key={r.key} className="clrow">
      {labelFrom && (
        <span className={`home-classdate${r.item.iso === labelFrom ? " today" : ""}`}>
          {r.item.iso === labelFrom ? "Today" : tabLabel(r.item.iso)}
        </span>
      )}
      <ClassLine row={r} />
      {r.corner}
    </div>
  );

const plusDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** "Mon 10": the weekday and the date, the way a booking rail says a day. */
function tabLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${d.getUTCDate()}`;
}

function daySectionLabel(iso: string, today: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const date = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  if (iso === today) return "Today";
  if (iso === plusDays(today, 1)) return "Tomorrow";
  return date;
}

function calendarRelation(item: FeedItem, meId?: string): {
  label: "Following" | "Coaching" | "Saved" | "Shift";
  tone: "following" | "coaching" | "attending" | "shift";
} {
  if (item.shift) return { label: "Shift", tone: "shift" };
  if (meId && item.coachId === meId) return { label: "Coaching", tone: "coaching" };
  if (item.saved) return { label: "Saved", tone: "attending" };
  return { label: "Following", tone: "following" };
}

/** A studio-owned occurrence uses a studio-shaped identity so open classes
 * still have artwork and a valid profile destination. That identity is the
 * same fact as the place line, not a second coach line. The name comparison
 * also covers older rows created before studio identities had `s/` handles. */
function sameCalendarIdentity(coach: FeedCoach | null | undefined, where: string | null): boolean {
  if (!coach) return false;
  if (coach.handle.startsWith("s/")) return true;
  const clean = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return !!where && clean(coach.name) === clean(where);
}

/** Miles between two pins, the haversine way, close enough for a rail. */
function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** The tapped occurrence, as the sheet wants it. Somebody else's class names
 *  the coach and offers Save; a studio shift assigned to the viewer is theirs
 *  to manage even though the studio owns the underlying class. */
function peekOf(i: FeedItem, coach: FeedCoach | null, following?: boolean): PeekClass {
  const d = new Date(`${i.iso}T00:00:00Z`);
  // Title case, because it is a value in the facts list now and reads beside
  // "6:00 pm" and "Ironbound Performance Athletics", not above them.
  const dow = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return {
    id: i.classId,
    iso: i.iso,
    name: i.name,
    when: `${dow}, ${md}`,
    time: `${i.hm} ${i.ap.toLowerCase()}`,
    studio: i.where,
    studioHref: i.whereHref,
    coach: i.assignedCoachName
      ? { name: i.assignedCoachName, handle: null }
      : coach && !sameCalendarIdentity(coach, i.where)
      ? { name: coach.name, handle: coach.handle, photo: coach.photo, color: coach.color, favorited: following }
      : null,
    // Where the depth is loaded from: a handle, or `s/{slug}` for a gym's
    // class, which is why the row carries it rather than the coach doing.
    base: i.base,
    shift: i.shift,
    mine: i.shift,
    preview: {
      description: i.about,
      classType: i.classType,
      links: i.links,
      studioAddress: i.studioAddress,
    },
  };
}
