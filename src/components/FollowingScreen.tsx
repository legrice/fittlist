"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClassPeek, type PeekClass } from "@/components/ClassPeek";
import { CoachPeek } from "@/components/CoachPeek";
import { DiscoverSheet } from "@/components/DiscoverSheet";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { CalendarList, ClassLine, type WeekRow } from "@/components/WeekView";
import { setGoing } from "@/app/actions/going";

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

/** A circle on the Coaches near you rail, the viewer's own follow state
 *  riding along so the pill under the face starts right. */
export type FeedItem = {
  key: string;
  /** Which of the three weeks it falls in, decided on the server. */
  week: number;
  iso: string;
  classId: string;
  /** The base its class page lives under: a handle, or `s/{slug}` for a gym. */
  base: string;
  coachId: string;
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
  items,
  coaches,
  favIds,
  cats,
  todayIso,
  meId,
  meKind,
  myRail,
  meFace,
  savedStudios = [],
  socialGroups = [],
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
  /** Following is the combined schedule; Upcoming is the filtered browser. */
  mode?: "home" | "upcoming";
}) {
  const isHome = mode === "home";
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
  const [calendarFilter, setCalendarFilter] = useState<"all" | "you" | `coach:${string}` | `studio:${string}` | `group:${string}`>("all");
  const [personPeekOpen, setPersonPeekOpen] = useState<null | { id: string; name: string; photo: string | null; color: string; self: boolean }>(null);
  const [toastMsg, toastOn, toast] = useToast();
  const [toastAction, setToastAction] = useState<{ label: string; href: string } | null>(null);
  const notify = (msg: string, highlight?: string) => {
    setToastAction(highlight ? { label: "Show it", href: `/calendar?hl=${encodeURIComponent(highlight)}` } : null);
    toast(msg);
  };
  const router = useRouter();

  const closeFind = () => {
    setFind(false);
    router.refresh();
  };

  const coachById = useMemo(() => new Map(coaches.map((c) => [c.id, c])), [coaches]);

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
    () => myRail.filter((person) => person.id !== meId && items.some((item) => item.coachId === person.id)),
    [myRail, meId, items],
  );
  const studioOptions = useMemo(
    () => savedStudios.filter((studio) => items.some((item) => item.whereHref === `/s/${studio.slug}`)),
    [savedStudios, items],
  );
  const groupOptions = useMemo(() => {
    const feedKeys = new Set(items.map((item) => item.key));
    return socialGroups.filter((group) => group.classKeys.some((key) => feedKeys.has(key)));
  }, [socialGroups, items]);
  const railCoachOptions = coachOptions.slice(0, 10);
  const railStudioOptions = studioOptions.slice(0, Math.max(0, 10 - railCoachOptions.length));
  const railGroupOptions = groupOptions.slice(0, Math.max(0, 10 - railCoachOptions.length - railStudioOptions.length));
  const railHasMore = coachOptions.length + studioOptions.length + groupOptions.length > 10;

  const selectedCalendar = useMemo(() => {
    if (calendarFilter === "all") return null;
    if (calendarFilter === "you") return {
      name: "You",
      href: meKind === "coach" ? "/coachshare" : "/membershare",
      label: "Your schedule",
      action: "Share schedule",
    };
    if (calendarFilter.startsWith("coach:")) {
      const coach = coachOptions.find((option) => option.id === calendarFilter.slice(6));
      return coach ? { name: coach.name, href: coach.handle ? `/${coach.handle}` : "", label: `${coach.name.split(/\s+/)[0]}’s schedule`, action: "View profile" } : null;
    }
    if (calendarFilter.startsWith("studio:")) {
      const studio = studioOptions.find((option) => option.id === calendarFilter.slice(7));
      return studio ? { name: studio.name, href: `/s/${studio.slug}`, label: `${studio.name}’s schedule`, action: "View profile" } : null;
    }
    const group = groupOptions.find((option) => option.id === calendarFilter.slice(6));
    return group ? { name: group.name, href: `/g/${group.slug}`, label: `${group.name}’s schedule`, action: "View profile" } : null;
  }, [calendarFilter, coachOptions, studioOptions, groupOptions, meKind]);

  const shown = useMemo(() => {
    const coachIds = new Set(coachOptions.map((person) => person.id));
    const studioHrefs = new Set(studioOptions.map((studio) => `/s/${studio.slug}`));
    const groupKeys = new Set(groupOptions.flatMap((group) => group.classKeys));
    return items.filter((item) => {
      if (!passes(item)) return false;
      if (!isHome) return true;
      if (calendarFilter === "you") return item.saved || (!!meId && item.coachId === meId);
      if (calendarFilter.startsWith("coach:")) return item.coachId === calendarFilter.slice(6);
      if (calendarFilter.startsWith("studio:")) {
        const studio = studioOptions.find((option) => option.id === calendarFilter.slice(7));
        return Boolean(studio && item.whereHref === `/s/${studio.slug}`);
      }
      if (calendarFilter.startsWith("group:")) {
        const group = groupOptions.find((option) => option.id === calendarFilter.slice(6));
        return Boolean(group?.classKeys.includes(item.key));
      }
      const fromPeople = item.saved || (!!meId && item.coachId === meId) || coachIds.has(item.coachId);
      const fromStudios = Boolean(item.whereHref && studioHrefs.has(item.whereHref));
      const fromGroups = groupKeys.has(item.key);
      return fromPeople || fromStudios || fromGroups;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, f, geo, isHome, meId, calendarFilter, coachOptions, studioOptions, groupOptions]);

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
    return {
      item: i,
      key: i.key,
      name: i.name,
      where: i.where,
      hm: i.hm,
      ap: i.ap,
      tag: meId && i.coachId === meId ? "You" : undefined,
      tagTone: meId && i.coachId === meId ? "coaching" : undefined,
      coach: c ? { id: c.id, name: c.name, color: c.color, photo: c.photo } : null,
      onTap: () => setPeek(peekOf(i, c ?? null, favIds.includes(i.coachId))),
      corner:
        meId && i.coachId !== meId ? (
          <FollowingAdd
            classId={i.classId}
            iso={i.iso}
            name={i.name}
            initialOn={i.saved}
            onNotice={notify}
          />
        ) : undefined,
    };
  };

  // The selected day's rows.
  const dayRows: (WeekRow & { item: FeedItem })[] = useMemo(() => {
    const list = shown.filter((i) => i.iso === day).sort((a, b) => a.mins - b.mins);
    return list.map(rowOf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, day, coachById, favIds]);

  // Calendar is a rolling month: today plus the following thirty days. The
  // server loads five calendar-week buckets so this remains complete even
  // when today lands near the end of a week.
  const homeRows: (WeekRow & { item: FeedItem })[] = useMemo(
    () => {
      const monthEnd = plusDays(todayIso, 30);
      return [...shown]
        .filter((item) => item.iso >= todayIso && item.iso <= monthEnd)
        .sort((a, b) => a.iso.localeCompare(b.iso) || a.mins - b.mins)
        .map(rowOf);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, todayIso, coachById, favIds],
  );
  const homeDays = useMemo(() => {
    const days = new Map<string, (WeekRow & { item: FeedItem })[]>();
    for (const row of homeRows) days.set(row.item.iso, [...(days.get(row.item.iso) ?? []), row]);
    return [...days.entries()].map(([iso, rows]) => ({
      iso,
      label: daySectionLabel(iso, todayIso),
      today: iso === todayIso,
      rows,
    }));
  }, [homeRows, todayIso]);

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
        <header className="following-head">
          <div className="tray following-rail" aria-label="Calendars">
            <div className="tray-scroll">
              <button className={`trayitem${calendarFilter !== "all" ? " dim" : ""}`} type="button" aria-pressed={calendarFilter === "all"} onClick={() => setCalendarFilter("all")}>
                <span className={`trayav trayav-all${calendarFilter === "all" ? " sel" : ""}`}><Icon name="calendar_month" size={25} /></span>
                <span className="trayitem-nm">All</span>
              </button>
              <button className="trayitem" type="button" onClick={() => { if (meId) setPersonPeekOpen({ id:meId, name:meFace.name, photo:meFace.photo, color:meFace.color, self:true }); }}>
                <span className="trayav" style={{ background: meFace.color }}>
                  {meFace.photo ? <img src={meFace.photo} alt="" /> : (
                    <span className="trayav-ini">{(meFace.name.trim().charAt(0) || "?").toUpperCase()}</span>
                  )}
                </span>
                <span className="trayitem-nm">You</span>
              </button>
              {railCoachOptions.map((coach) => {
                return (
                <button
                  key={coach.id}
                  type="button"
                  className="trayitem"
                  onClick={() => setPersonPeekOpen({ id:coach.id, name:coach.name, photo:coach.photo, color:coach.color, self:false })}
                >
                  <span
                    className="trayav"
                    style={{ background: coach.color }}
                  >
                    {coach.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coach.photo} alt="" />
                    ) : (
                      <span className="trayav-ini">{(coach.name.trim().charAt(0) || "?").toUpperCase()}</span>
                    )}
                  </span>
                  <span className="trayitem-nm">{coach.name.split(/\s+/)[0]}</span>
                </button>
              )})}
              {railStudioOptions.map((studio) => {
                const filter = `studio:${studio.id}` as const;
                return <button
                key={studio.id}
                type="button"
                className={`trayitem social-place-item${calendarFilter !== "all" && calendarFilter !== filter ? " dim" : ""}`}
                aria-pressed={calendarFilter === filter}
                onClick={() => setCalendarFilter(filter)}
              >
                <span className={`trayav social-place-av${calendarFilter === filter ? " sel" : ""}`} style={{ background: studio.color }}>
                  {studio.photo ? <img src={studio.photo} alt="" /> : <Icon name="storefront" size={25} />}
                </span>
                <span className="trayitem-nm">{studio.name}</span>
              </button>})}
              {railGroupOptions.map((group) => {
                const filter = `group:${group.id}` as const;
                return <button
                key={group.id}
                type="button"
                className={`trayitem${calendarFilter !== "all" && calendarFilter !== filter ? " dim" : ""}`}
                aria-pressed={calendarFilter === filter}
                onClick={() => setCalendarFilter(filter)}
              >
                <span className={`trayav${calendarFilter === filter ? " sel" : ""}`}>
                  {group.photo ? <img src={group.photo} alt="" /> : <Icon name="groups" size={25} />}
                </span>
                <span className="trayitem-nm">{group.name}</span>
              </button>})}
              {railHasMore && <Link className="trayitem" href="/saved"><span className="trayav trayav-add"><Icon name="more_horiz" size={28} /></span><span className="trayitem-nm">More</span></Link>}
            </div>
          </div>
        </header>
      )}
      {isHome && selectedCalendar && (
        <div className="feedfilterbar following-coach-context">
          <span className="feedfilter-txt">{selectedCalendar.label}</span>
          {selectedCalendar.href && <Link href={`${selectedCalendar.href}?from=feed`} className="feedfilter-link">
            {selectedCalendar.action} <Icon name="chevron_right" size={17} />
          </Link>}
        </div>
      )}
      {(isHome ? shown.length === 0 : items.length === 0) ? (
        <>
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
                ? "Save a class you want to remember, or add something of your own."
                : "Classes show up here as coaches list them. Try broadening your filters."}
            </p>
            {isHome && (
              <div className="wkempty-actions">
                <Link className="btn si" href="/search">Find classes</Link>
                <button className="btn ghost" type="button" onClick={() => setFind(true)}>Find calendars</button>
              </div>
            )}
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
              {isHome ? (
                <CalendarList days={homeDays} className="following-calendar-list" />
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
          allowWeekAdd={false}
        />
      )}
      {personPeekOpen && (
        <CoachPeek
          id={personPeekOpen.id}
          name={personPeekOpen.name}
          photo={personPeekOpen.photo}
          color={personPeekOpen.color}
          self={personPeekOpen.self}
          shareHref={personPeekOpen.self ? (meKind === "coach" ? "/coachshare" : "/membershare") : undefined}
          onClose={() => setPersonPeekOpen(null)}
        />
      )}
      <Toast msg={toastMsg} on={toastOn} action={toastAction} />
    </>
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

function FollowingAdd({
  classId,
  iso,
  name,
  initialOn,
  onNotice,
}: {
  classId: string;
  iso: string;
  name: string;
  initialOn: boolean;
  onNotice: (message: string, highlight?: string) => void;
}) {
  const [on, setOn] = useState(initialOn);
  const [busy, start] = useTransition();
  const toggle = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      const res = await setGoing(classId, iso, next);
      if (!res.ok) {
        setOn(!next);
        onNotice(res.error ?? "Couldn't update your calendar");
        return;
      }
      onNotice(
        next ? `${name} was saved to your calendar` : `${name} was removed from your calendar`,
        next ? `${classId}.${iso}` : undefined,
      );
    });
  };
  return (
    <button
      className={`calendar-save-action following-add${on ? " on" : ""}`}
      type="button"
      disabled={busy}
      aria-label={on ? `Remove ${name} from your calendar` : `Save ${name} to your calendar`}
      aria-pressed={on}
      onClick={toggle}
    >
      <Icon name={on ? "bookmark_added" : "bookmark"} size={24} />
    </button>
  );
}

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
  return iso === today ? `Today, ${date.split(", ")[1]}` : date;
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

/** The tapped occurrence, as the sheet wants it. Somebody else's class, so it
 *  names the coach and offers their week rather than an edit. */
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
    coach: coach
      ? { name: coach.name, handle: coach.handle, photo: coach.photo, color: coach.color, favorited: following }
      : null,
    // Where the depth is loaded from: a handle, or `s/{slug}` for a gym's
    // class, which is why the row carries it rather than the coach doing.
    base: i.base,
    mine: false,
    preview: {
      description: i.about,
      classType: i.classType,
      links: i.links,
      studioAddress: i.studioAddress,
    },
  };
}
