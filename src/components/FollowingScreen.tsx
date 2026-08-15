"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClassPeek, type PeekClass } from "@/components/ClassPeek";
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

export type FeedPerson = {
  id: string;
  name: string;
  handle: string | null;
  photo: string | null;
  color: string;
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
  /** People who publicly added this occurrence to their week. */
  goers: FeedPerson[];
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
const SELF_FILTER = "__your_week__";
const WEEK_INTRO_KEY = "fl-your-week-intro-seen";

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
  myRail,
  meKind,
  meFace,
  nearStudios,
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
  const [weekIntro, setWeekIntro] = useState(false);
  // Nothing selected is the combined week. A face is an explicit filter,
  // including your own face at the front of the rail.
  const [coachFilter, setCoachFilter] = useState<string | null>(null);
  const [toastMsg, toastOn, toast] = useToast();
  const [toastAction, setToastAction] = useState<{ label: string; href: string } | null>(null);
  const notify = (msg: string, highlight?: string) => {
    setToastAction(highlight ? { label: "Show it", href: `/calendar?hl=${encodeURIComponent(highlight)}` } : null);
    toast(msg);
  };
  const router = useRouter();

  const chooseSelf = () => {
    if (selectedSelf) {
      setCoachFilter(null);
      return;
    }
    setCoachFilter(SELF_FILTER);
    try {
      if (!localStorage.getItem(WEEK_INTRO_KEY)) {
        localStorage.setItem(WEEK_INTRO_KEY, "1");
        setWeekIntro(true);
      }
    } catch {
      // Storage can be unavailable in private browsing. The current session
      // still gets the explanation without blocking the week itself.
      setWeekIntro(true);
    }
  };

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

  const shown = useMemo(
    () =>
      items.filter(
        (item) =>
          passes(item) &&
          (!isHome ||
            coachFilter === null ||
            (coachFilter === SELF_FILTER
              ? item.saved || (!!meId && item.coachId === meId)
              : item.coachId === coachFilter)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, f, geo, isHome, coachFilter],
  );

  const coachOptions = useMemo(
    () => myRail.filter((person) => person.id !== meId),
    [myRail, meId],
  );
  const railById = useMemo(() => new Map(myRail.map((person) => [person.id, person])), [myRail]);
  const meProfileHref = meId && railById.get(meId)?.handle ? `/${railById.get(meId)!.handle}` : "/you";
  const selectedCoach = coachFilter && coachFilter !== SELF_FILTER ? railById.get(coachFilter) ?? null : null;
  const selectedSelf = coachFilter === SELF_FILTER;

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

  // Following is the complete rolling week: today through the same weekday
  // next week. The inclusive end is what makes Wednesday-to-Wednesday read as
  // a full visible week rather than mysteriously stopping on Tuesday.
  // It used to stop after twelve rows, which meant a busy Saturday could hide
  // Sunday entirely and made the page answer "the next twelve" rather than
  // the question people came with: what are my coaches doing this week?
  const homeRows: (WeekRow & { item: FeedItem })[] = useMemo(
    () => {
      const nextWeek = plusDays(todayIso, 7);
      return [...shown]
        .filter((item) => item.iso >= todayIso && item.iso <= nextWeek)
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
          <div className={`tray following-rail${coachFilter ? " has-context" : ""}`} role="group" aria-label="Filter by person">
            <div className="tray-scroll">
              <Link
                className="trayitem"
                href={meProfileHref}
              >
                <span
                  className="trayav trayav-you"
                  style={{ background: meFace.color }}
                >
                  {meFace.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={meFace.photo} alt="" />
                  ) : (
                    <span className="trayav-ini">{(meFace.name.trim().charAt(0) || "?").toUpperCase()}</span>
                  )}
                </span>
                <span className="trayitem-nm">Your week</span>
              </Link>
              {coachOptions.map((coach) => (
                <Link
                  key={coach.id}
                  className="trayitem"
                  href={coach.handle ? `/${coach.handle}` : "/discover?tab=coaches"}
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
                </Link>
              ))}
              <Link className="trayitem trayitem-more" href="/discover?half=coaches" aria-label="Discover more coaches">
                <span className="trayav trayav-add"><Icon name="add" size={28} /></span>
                <span className="trayitem-nm">More</span>
              </Link>
            </div>
          </div>
        </header>
      )}
      {isHome && (selectedCoach || selectedSelf) && (
        <div className="feedfilterbar following-coach-context">
          <span className="feedfilter-txt">
            {selectedSelf ? "Your classes this week" : `Classes with ${selectedCoach!.name.split(/\s+/)[0]}`}
          </span>
          <Link
            href={selectedSelf
              ? (meKind === "coach" ? "/coachshare" : "/membershare")
              : selectedCoach?.handle
                ? `/${selectedCoach.handle}?from=feed`
                : "/feed"}
            className="feedfilter-link"
          >
            {selectedSelf ? "Share your week" : "View profile"} <Icon name="chevron_right" size={17} />
          </Link>
        </div>
      )}
      {weekIntro && (
        <div
          className="sheet-scrim"
          onClick={(event) => {
            if (event.target === event.currentTarget) setWeekIntro(false);
          }}
        >
          <section className="sheet confirmsheet weekeducation" role="dialog" aria-modal="true" aria-labelledby="week-intro-title">
            <button className="peekclose sheetclose" type="button" onClick={() => setWeekIntro(false)} aria-label="Close">
              <Icon name="close" size={22} />
            </button>
            <span className="circleeducation-icon" aria-hidden="true">
              <Icon name="calendar_month" size={24} />
            </span>
            <h2 id="week-intro-title">Build your week</h2>
            <p className="lead">
              Your week is the fitness you plan to do. Add your own classes and workouts, or follow coaches and add something from their schedules.
            </p>
            <div className="publishwrap nostick saveeducation-actions">
              <Link className="btn si" href="/calendar?add=1" onClick={() => setWeekIntro(false)}>
                Build your schedule
              </Link>
              <Link className="btn ghost" href="/discover?half=coaches" onClick={() => setWeekIntro(false)}>
                Find coaches
              </Link>
            </div>
            <button className="confirm-keep" type="button" onClick={() => setWeekIntro(false)}>
              Keep browsing
            </button>
          </section>
        </div>
      )}
      {items.length === 0 ? (
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
            <h2 className="wkempty-t">{isHome ? "Your week is empty" : "Nothing near you yet"}</h2>
            <p className="wkempty-b">
              {isHome
                ? "Follow a coach or add a class to make this place less lonely."
                : "Classes show up here as coaches list them. Try broadening your filters."}
            </p>
            {isHome && (
              <div className="wkempty-actions">
                <button className="btn ghost" onClick={() => setFind(true)}>
                  Find a coach
                </button>
                <Link className="btn si" href="/calendar?add=1">
                  Add a class
                </Link>
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
                coachFilter ? (
                  <CalendarList days={homeDays} className="following-calendar-list" />
                ) : (
                  <WeekSocialFeed
                    items={homeRows.map((row) => row.item)}
                    coachById={coachById}
                    studios={nearStudios}
                    onOpen={(item) => {
                      const coach = coachById.get(item.coachId) ?? null;
                      setPeek(peekOf(item, coach, favIds.includes(item.coachId)));
                    }}
                    onNotice={notify}
                  />
                )
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

function WeekSocialFeed({
  items,
  coachById,
  studios,
  onOpen,
  onNotice,
}: {
  items: FeedItem[];
  coachById: Map<string, FeedCoach>;
  studios: NearStudio[];
  onOpen: (item: FeedItem) => void;
  onNotice: (message: string, highlight?: string) => void;
}) {
  const attendance = items.flatMap((item) => item.goers.map((person) => ({ item, person })));
  const visibleAttendance = attendance.slice(0, 3);
  const attendedKeys = new Set(attendance.map(({ item }) => item.key));
  const visibleCoaching = items.filter((item) => !attendedKeys.has(item.key)).slice(0, 4);
  const futurePosts = FUTURE_WEEK_POSTS.slice(0, 9);

  return (
    <div className="weekfeed">
      {visibleCoaching.slice(0, 2).map((item) => {
        const coach = coachById.get(item.coachId) ?? null;
        return coach ? (
          <ClassActivityPost key={`coaching-${item.key}`} item={item} coach={coach} onOpen={onOpen} onNotice={onNotice} />
        ) : null;
      })}

      {visibleAttendance.map(({ item, person }) => {
        const coach = coachById.get(item.coachId) ?? null;
        return (
          <article className="weekpost" key={`going-${person.id}-${item.key}`}>
            <header className="weekpost-person">
              {person.handle ? (
                <Link className="weekpost-avatar-link" href={`/${person.handle}`} aria-label={`View ${person.name}'s profile`}>
                  <span className="weekpost-avatar" style={{ background: person.color }}>
                    {person.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={person.photo} alt="" />
                    ) : person.name.charAt(0)}
                  </span>
                </Link>
              ) : (
                <span className="weekpost-avatar" style={{ background: person.color }}>
                  {person.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={person.photo} alt="" />
                  ) : person.name.charAt(0)}
                </span>
              )}
              <div>
                <strong>{person.handle ? <Link href={`/${person.handle}`}>{person.name}</Link> : person.name} added this</strong>
              </div>
            </header>
            <ActivityClassDetails item={item} coach={coach} onOpen={onOpen} />
            <GoingCluster item={item} onNotice={onNotice} />
          </article>
        );
      })}

      {futurePosts.map((post, index) => {
        const studio = studios.length ? studios[index % studios.length] : null;
        const classItem = items.length ? items[index % items.length] : null;

        if (post.kind === "event") {
          return (
            <article className="weekpost weekpost-event" key={post.key}>
              <header className="weekpost-person">
                <span className="weekpost-avatar weekpost-event-avatar" style={{ background: post.color }}>F</span>
                <div><strong>FittList local</strong><span>Featured event</span></div>
              </header>
              <div className="weekpost-eventart" style={{ background: post.color }}>
                <span>{post.month}</span>
                <strong>{post.day}</strong>
              </div>
              <div className="weekpost-eventcopy">
                <span>{post.eyebrow}</span>
                <h2>{post.title}</h2>
                <p>{post.copy}</p>
                <Link href="/discover?tab=classes">See what&apos;s happening <Icon name="arrow_forward" size={17} /></Link>
              </div>
            </article>
          );
        }

        if (post.kind === "studio") {
          const name = studio?.name ?? post.studio;
          return (
            <article className="weekpost weekpost-host" key={post.key}>
              <header className="weekpost-person">
                {studio ? (
                  <Link className="weekpost-avatar-link" href={`/s/${studio.slug}`} aria-label={`View ${name}`}>
                    <span className="weekpost-avatar weekpost-place-avatar" style={{ background: studio.color }}>
                      {studio.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={studio.photo} alt="" />
                      ) : name.charAt(0)}
                    </span>
                  </Link>
                ) : (
                  <span className="weekpost-avatar weekpost-place-avatar" style={{ background: post.color }}>{name.charAt(0)}</span>
                )}
                <div><strong>{studio ? <Link href={`/s/${studio.slug}`}>{name}</Link> : name}</strong><span>Studio</span></div>
              </header>
              <h2>{post.title}</h2>
              <p>{post.copy}</p>
              <div className="weekpost-hostmeta"><Icon name="calendar_today" size={18} /><span>{post.when}</span></div>
            </article>
          );
        }

        return (
          <article className="weekpost" key={post.key}>
            <header className="weekpost-person">
              <span className="weekpost-avatar" style={{ background: post.color }}>{post.person.charAt(0)}</span>
              <div><strong>{post.person}</strong><span>{post.city}</span></div>
            </header>
            {classItem ? (
              <>
                <ActivityClassDetails item={classItem} coach={coachById.get(classItem.coachId) ?? null} onOpen={onOpen} />
                <GoingCluster item={classItem} onNotice={onNotice} aspirational />
              </>
            ) : (
              <div className="weekpost-plan"><strong>{post.plan}</strong><span>{post.when}</span></div>
            )}
          </article>
        );
      })}

      {visibleCoaching.slice(2).map((item) => {
        const coach = coachById.get(item.coachId) ?? null;
        return coach ? (
          <ClassActivityPost key={`coaching-more-${item.key}`} item={item} coach={coach} onOpen={onOpen} onNotice={onNotice} />
        ) : null;
      })}

      {attendance.length === 0 && visibleCoaching.length === 0 && futurePosts.length === 0 && (
        <div className="weekpost weekfeed-empty">
          <h2>Nothing shared yet</h2>
          <p>Classes and plans from people in the community will show up here.</p>
        </div>
      )}
    </div>
  );
}

function ActivityClassDetails({
  item,
  coach,
  onOpen,
}: {
  item: FeedItem;
  coach: FeedCoach | null;
  onOpen: (item: FeedItem) => void;
}) {
  return (
    <button className="weekpost-activityclass" type="button" onClick={() => onOpen(item)}>
      <h2>{item.name}</h2>
      <p>{item.where ?? "Location to come"}</p>
      {coach && (
        <div className="weekpost-activitycoach">
          <span style={{ background: coach.color }}>
            {coach.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coach.photo} alt="" />
            ) : coach.name.charAt(0)}
          </span>
          <small>Coached by {coach.name}</small>
        </div>
      )}
      <div className="weekpost-activitymeta">
        <Icon name="calendar_today" size={18} />
        <span>{shortDay(item.iso)} · {item.hm}{item.ap}</span>
      </div>
    </button>
  );
}

function ClassActivityPost({
  coach,
  item,
  onOpen,
  onNotice,
}: {
  coach: FeedCoach;
  item: FeedItem;
  onOpen: (item: FeedItem) => void;
  onNotice: (message: string, highlight?: string) => void;
}) {
  return (
    <article className="weekpost weekpost-activity">
      <header className="weekpost-person">
        {coach.handle ? (
          <Link className="weekpost-avatar-link" href={`/${coach.handle}`} aria-label={`View ${coach.name}'s profile`}>
            <span className="weekpost-avatar" style={{ background: coach.color }}>
              {coach.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coach.photo} alt="" />
              ) : coach.name.charAt(0)}
            </span>
          </Link>
        ) : (
          <span className="weekpost-avatar" style={{ background: coach.color }}>{coach.name.charAt(0)}</span>
        )}
        <div>
          <strong>{coach.handle ? <Link href={`/${coach.handle}`}>{coach.name}</Link> : coach.name}</strong>
          <span>Coaching</span>
        </div>
      </header>
      <ActivityClassDetails item={item} coach={null} onOpen={onOpen} />
      <GoingCluster item={item} onNotice={onNotice} />
    </article>
  );
}

const ASPIRATIONAL_GOERS = [
  { id: "mock-jo", name: "Joanne", color: "#a44c78", photo: null, handle: null },
  { id: "mock-dev", name: "Devon", color: "#325d8a", photo: null, handle: null },
  { id: "mock-nia", name: "Nia", color: "#805f9c", photo: null, handle: null },
  { id: "mock-sam", name: "Sam", color: "#ba6a40", photo: null, handle: null },
] satisfies FeedPerson[];

function GoingCluster({
  item,
  onNotice,
  aspirational = false,
}: {
  item: FeedItem;
  onNotice: (message: string, highlight?: string) => void;
  aspirational?: boolean;
}) {
  const people = item.goers.length
    ? item.goers.slice(0, 4)
    : aspirational ? ASPIRATIONAL_GOERS : [];
  const count = item.goers.length || (aspirational ? people.length : 0);
  return (
    <div className="weekpost-going">
      {people.length > 0 && (
        <span className="weekpost-goingfaces" aria-hidden="true">
          {people.map((person) => (
            <span key={person.id} style={{ background: person.color }}>
              {person.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={person.photo} alt="" />
              ) : person.name.charAt(0)}
            </span>
          ))}
        </span>
      )}
      <span className="weekpost-goingcopy">
        {count ? `${count} ${count === 1 ? "person" : "people"} added this` : "Be the first to add this"}
      </span>
      <FollowingAdd
        classId={item.classId}
        iso={item.iso}
        name={item.name}
        initialOn={item.saved}
        onNotice={onNotice}
      />
      <span className="weekpost-goinglabel">{item.saved ? "Added to your week" : "Add to your week"}</span>
    </div>
  );
}

type FutureWeekPost =
  | { kind: "event"; key: string; month: string; day: string; eyebrow: string; title: string; copy: string; color: string }
  | { kind: "studio"; key: string; studio: string; title: string; copy: string; when: string; color: string }
  | { kind: "plan"; key: string; person: string; city: string; plan: string; when: string; color: string };

/** A deliberately aspirational layer for the branch prototype. It lets Home
 *  demonstrate the future mix before every city has enough live inventory;
 *  real attendance and coach schedules still lead the feed above it. */
const FUTURE_WEEK_POSTS: FutureWeekPost[] = [
  { kind: "event", key: "hudson-expo", month: "SEP", day: "12", eyebrow: "One-day event", title: "Hudson Fit Expo", copy: "Classes, coaches, recovery, and a whole day to try something new.", color: "#cf3f08" },
  { kind: "studio", key: "sound-social", studio: "Sound of Om", title: "Sound bath and tea after dark", copy: "A slower Friday night with room to stay and meet people after class.", when: "Friday · 7:30 PM", color: "#7155a6" },
  { kind: "plan", key: "joanne-yoga", person: "Joanne", city: "Jersey City", plan: "Morning flow", when: "Saturday · 9:00 AM", color: "#a44c78" },
  { kind: "event", key: "park-run", month: "AUG", day: "22", eyebrow: "Community workout", title: "Sunrise run through Hamilton Park", copy: "An easy three miles, coffee afterward, and nobody gets left behind.", color: "#266a54" },
  { kind: "studio", key: "ironbound-open", studio: "Ironbound Performance Athletics", title: "Community strength open house", copy: "Meet the coaches, try the room, and take a short strength class on the house.", when: "Sunday · 11:00 AM", color: "#1d1b15" },
  { kind: "plan", key: "maya-pilates", person: "Maya", city: "Hoboken", plan: "Intro to reformer", when: "Tuesday · 6:30 PM", color: "#cb6d79" },
  { kind: "event", key: "waterfront-yoga", month: "AUG", day: "29", eyebrow: "Outdoor class", title: "Yoga on the waterfront", copy: "Golden-hour movement with skyline views. Bring a mat and a friend.", color: "#e28b38" },
  { kind: "studio", key: "cult-boxing", studio: "CULTR Fit Club", title: "Boxing basics workshop", copy: "A beginner-friendly afternoon for learning stance, footwork, and combinations.", when: "Saturday · 2:00 PM", color: "#214a69" },
  { kind: "plan", key: "devon-lift", person: "Devon", city: "Montclair", plan: "Upper body strength", when: "Thursday · 6:15 AM", color: "#325d8a" },
  { kind: "event", key: "recovery-market", month: "SEP", day: "05", eyebrow: "Wellness pop-up", title: "Recovery market", copy: "Massage, mobility, cold plunge, and local wellness people in one place.", color: "#884b87" },
  { kind: "studio", key: "bodyby-community", studio: "BODYBY JC", title: "Pilates for a cause", copy: "A community mat class supporting the neighborhood food pantry.", when: "Wednesday · 6:00 PM", color: "#7a267e" },
  { kind: "plan", key: "sam-sound", person: "Sam", city: "Jersey City", plan: "Friday sound bath", when: "Friday · 8:00 PM", color: "#ba6a40" },
  { kind: "event", key: "dance-block", month: "SEP", day: "19", eyebrow: "Neighborhood event", title: "Dance on the block", copy: "Three local teachers, two hours of music, and every level welcome.", color: "#d64f64" },
  { kind: "studio", key: "asana-teacher", studio: "Asana Soul Practice", title: "Meet the teachers morning", copy: "Take three mini classes and find the teaching style that feels like yours.", when: "Sunday · 9:30 AM", color: "#d98542" },
  { kind: "plan", key: "alex-kb", person: "Alex", city: "Brooklyn", plan: "Kettlebell foundations", when: "Wednesday · 7:00 PM", color: "#497b66" },
  { kind: "event", key: "trail-day", month: "OCT", day: "03", eyebrow: "Day trip", title: "Fall trail day", copy: "A social hike with mobility before and lunch together afterward.", color: "#9b542e" },
  { kind: "studio", key: "arc-mobility", studio: "Studio Arc", title: "Mobility lab with Lydia", copy: "A practical workshop for shoulders, hips, and feeling better between workouts.", when: "Thursday · 7:00 PM", color: "#406b78" },
  { kind: "plan", key: "nia-run", person: "Nia", city: "Jersey City", plan: "Easy waterfront 5K", when: "Sunday · 8:30 AM", color: "#805f9c" },
  { kind: "event", key: "coach-summit", month: "OCT", day: "17", eyebrow: "For coaches", title: "Local coach meetup", copy: "Share ideas, meet studio owners, and build something better together.", color: "#315b91" },
  { kind: "studio", key: "retro-late", studio: "Retro Fitness", title: "Late-night lift", copy: "The lights go low, the playlist gets loud, and the floor stays open late.", when: "Friday · 9:00 PM", color: "#b53032" },
  { kind: "plan", key: "chris-swim", person: "Chris", city: "Portland", plan: "Lap swim", when: "Monday · 7:00 AM", color: "#3277a4" },
];

function shortDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

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
        next ? `${name} was added to your calendar` : `${name} was removed from your calendar`,
        next ? `${classId}.${iso}` : undefined,
      );
    });
  };
  return (
    <button
      className={`following-add${on ? " on" : ""}`}
      type="button"
      disabled={busy}
      aria-label={on ? `Remove ${name} from your calendar` : `Add ${name} to your calendar`}
      aria-pressed={on}
      onClick={toggle}
    >
      <Icon name={on ? "check" : "add_circle"} size={24} />
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
