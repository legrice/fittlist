"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setGoing } from "@/app/actions/going";
import { ClassPeek, type PeekClass } from "@/components/ClassPeek";
import { CoachPeek } from "@/components/CoachPeek";
import { DiscoverSheet } from "@/components/DiscoverSheet";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { ClassLine, initials, type WeekRow } from "@/components/WeekView";
import { announceSaved } from "@/components/SaveEducation";

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
  nextAt: string;
};

export type YourWeekPreview = {
  key: string;
  iso: string;
  name: string;
  hm: string;
  ap: string;
  where: string | null;
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
 * Home: the people you keep up with, your week, and classes you can add.
 *
 * The faces are the people you follow who actually have something coming
 * up, soonest first, each circle a name and a ring: solid orange when
 * their week changed since you last opened it, bare once seen. Under them
 * The class preview includes every listable coach, whether or not you follow
 * them, and opens the complete filtered class browser. Home deliberately
 * stops there: its job is to help someone build and share a week.
 */
export function FollowingScreen({
  items,
  coaches,
  favIds,
  cats,
  follows,
  todayIso,
  meId,
  myRail,
  weekPreview = [],
  meKind,
  meFace,
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
  /** Saved and personal calendar entries; coaching entries already live in items. */
  weekPreview?: YourWeekPreview[];
  /** Where the You circle points: the hub is per kind. */
  meKind: "coach" | "member";
  /** The viewer's own face, leading the rail: your circle is you, not a
   *  glyph, by Matt's call. */
  meFace: { photo: string | null; name: string; color: string };
  /** The rails under the schedule, by Matt's call: the places and the
   *  people around you, with Follow one tap deep. */
  nearStudios: NearStudio[];
  /** Home is a single-day preview; Upcoming is the dedicated filtered browser. */
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
  const [peekPerson, setPeekPerson] = useState<RailPerson | null>(null);
  const [find, setFind] = useState(false);
  const [findIntro, setFindIntro] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();
  // Optimistic membership for this visit. Adding from the catalog should
  // visibly move the occurrence into Your week without a route refresh.
  const [goingOverrides, setGoingOverrides] = useState<Record<string, boolean>>({});
  const isAdded = (item: FeedItem) => goingOverrides[item.key] ?? item.saved;
  const changeGoing = (key: string, on: boolean) =>
    setGoingOverrides((current) => ({ ...current, [key]: on }));
  // A save lights your own circle rather than toasting, by Matt's call:
  // the ring goes brand and a New badge rides your face, the same signal a
  // followed person's fresh week sends. Tapping it lands on the Share
  // screen, where the saved class now lives. localStorage carries it
  // across navigations; the Share screen clears it on arrival.
  const [youFresh, setYouFresh] = useState(false);
  useEffect(() => {
    try {
      setYouFresh(!!localStorage.getItem("fl-you-new"));
    } catch {
      // Private mode: the ring just doesn't persist.
    }
  }, []);
  const notify = (msg: string, hlKey?: string) => {
    if (hlKey) {
      try {
        localStorage.setItem("fl-you-new", "1");
      } catch {
        // Private mode: the ring still lights for this visit.
      }
      setYouFresh(true);
      return;
    }
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

  const shown = useMemo(
    () => items.filter(passes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, f, geo],
  );

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

  // One row mapping. Duration sits beneath the time on the same grid row as
  // the studio, so both secondary facts can be compared without another line.
  const rowOf = (i: FeedItem): WeekRow & { item: FeedItem } => {
    const c = coachById.get(i.coachId);
    return {
      item: i,
      key: i.key,
      name: i.name,
      where: i.where,
      hm: i.hm,
      ap: i.ap,
      dur: `${i.durationMin} min`,
      coach: c ? { id: c.id, name: c.name, color: c.color, photo: c.photo } : null,
      onTap: () => setPeek(peekOf(i, c ?? null, favIds.includes(i.coachId))),
    };
  };

  // The selected day's rows.
  const dayRows: (WeekRow & { item: FeedItem })[] = useMemo(() => {
    const list = shown.filter((i) => i.iso === day).sort((a, b) => a.mins - b.mins);
    return list.map(rowOf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, day, coachById, favIds]);

  // Home's catalog is the next six occurrences across the week.
  const homeRows: (WeekRow & { item: FeedItem })[] = useMemo(
    () =>
      [...shown]
        .sort((a, b) => a.iso.localeCompare(b.iso) || a.mins - b.mins)
        .slice(0, 6)
        .map(rowOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, coachById, favIds],
  );

  const yourWeek = useMemo(() => {
    const own =
      meKind === "coach"
        ? items
            .filter((i) => i.coachId === meId)
            .map((i) => ({ key: i.key, iso: i.iso, name: i.name, hm: i.hm, ap: i.ap, where: i.where }))
        : [];
    const seen = new Set<string>();
    const newlyAdded = items
      .filter((i) => i.coachId !== meId && isAdded(i))
      .map((i) => ({ key: i.key, iso: i.iso, name: i.name, hm: i.hm, ap: i.ap, where: i.where }));
    return [
      ...weekPreview.filter((i) => goingOverrides[i.key] !== false),
      ...newlyAdded,
      ...own,
    ]
      .sort((a, b) => a.iso.localeCompare(b.iso) || a.hm.localeCompare(b.hm))
      .filter((i) => {
        const key = `${i.iso}|${i.name}|${i.hm}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3);
  }, [items, meId, meKind, weekPreview, goingOverrides]);

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
            <Icon name="arrow_back" size={20} /> Home
          </Link>
          <h1>Upcoming near you</h1>
          <p>Browse classes by day, time, distance, type, or place.</p>
        </header>
      )}
      {/* No search bar up here any more, by Matt's call: the magnifier
          lives in the header's corner, right of the bell, and the rail
          leads the screen. */}
      {/* This week: the people you follow with something coming up, soonest
          first, no captions and no badges. A circle is a name and a ring,
          the ring is the freshness signal, and tapping one opens their
          week. You lead it, wearing your own face, and Add ends it. */}
      {isHome && (
        <div className="tray">
          <div className="tray-scroll">
            {meKind === "coach" && <button
              className="trayitem"
              onClick={() => {
                if (!meId) return;
                setPeekPerson({
                  id: meId,
                  name: meFace.name,
                  handle: null,
                  photo: meFace.photo,
                  color: meFace.color,
                  fresh: youFresh,
                  nextAt: todayIso,
                });
              }}
            >
              <span className="youwrap">
                <span className={`trayav trayav-you${youFresh ? " trayav-ring" : ""}`}>
                  {meFace.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={meFace.photo} alt="" />
                  ) : (
                    <span className="trayav-ini" style={{ background: meFace.color }}>
                      {initials(meFace.name)}
                    </span>
                  )}
                </span>
              </span>
              <span className="trayitem-nm">You</span>
            </button>}
            {myRail.map((p) => (
              <button key={p.id} className="trayitem" onClick={() => setPeekPerson(p)}>
                <span className={`trayav trayav-ring${p.fresh ? "" : " seen"}`}>
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt="" />
                  ) : (
                    <span className="trayav-ini" style={{ background: p.color }}>
                      {initials(p.name)}
                    </span>
                  )}
                </span>
                <span className="trayitem-nm">{p.name.split(/\s+/)[0]}</span>
              </button>
            ))}
            <button
              className="trayitem"
              onClick={() => {
                try {
                  if (localStorage.getItem("fl-circle-intro-seen")) setFind(true);
                  else setFindIntro(true);
                } catch {
                  setFindIntro(true);
                }
              }}
            >
              <span className="trayav trayav-add">
                <Icon name="add" size={28} />
              </span>
              <span className="trayitem-nm">Add</span>
            </button>
            {follows === 0 && (
              <>
                <span className="trayav trayav-ghost" aria-hidden="true" />
                <span className="trayav trayav-ghost" aria-hidden="true" />
              </>
            )}
          </div>
          {follows === 0 && (
            <p className="trayhint">
              Follow the coaches you go to most. Their upcoming classes show up here.
            </p>
          )}
        </div>
      )}

      {isHome && (
        <section className="home-yourweek">
          <div className="nearhead nearhead-row">
            <span className="nearlbl">Your week</span>
            {yourWeek.length > 0 && (
              <Link className="nearhead-go home-seeall" href="/calendar">View calendar</Link>
            )}
          </div>
          {yourWeek.length > 0 ? (
            <>
              <div className="yourweek-list">
                {yourWeek.map((item) => (
                  <div key={item.key} className="yourweek-row">
                    <span className="yourweek-when">
                      <span className={`yourweek-date${item.iso === todayIso ? " today" : ""}`}>
                        {item.iso === todayIso ? "Today" : tabLabel(item.iso)}
                      </span>
                      <span className="yourweek-time">{item.hm}{item.ap.toLowerCase()}</span>
                    </span>
                    <span className="yourweek-copy"><strong>{item.name}</strong><small>{item.where}</small></span>
                    <span className="yourweek-check" aria-label="Added to your week">
                      <Icon name="check" size={18} />
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="yourweek-empty">
              <span className="yourweek-empty-icon"><Icon name="add_circle" size={22} /></span>
              <span><strong>Start building your week</strong><small>Add any class below to create a calendar you can share.</small></span>
            </div>
          )}
        </section>
      )}

      {/* Home previews the next classes across days. The full page owns the
          date rail and filters, where those controls have enough inventory
          to narrow rather than making Home look quiet. */}
      {isHome && (
        <div className="week-schedule-head">
          <span className="nearlbl">Add to your week</span>
          <Link className="nearhead-go home-seeall" href="/upcoming">
            Discover all
          </Link>
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
            <h2 className="wkempty-t">Nothing near you yet</h2>
            <p className="wkempty-b">
              Classes show up here as coaches list them. Find people to follow in the
              meantime; their week shows up at the top.
            </p>
            {isHome && (
              <button className="btn si wkempty-cta" onClick={() => setFind(true)}>
                Find people
              </button>
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
                <div className="disflat home-next">
                  {homeRows.map(renderRow(meId, notify, isAdded, changeGoing, todayIso))}
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
                <div className="disflat">{dayRows.map(renderRow(meId, notify, isAdded, changeGoing))}</div>
              )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {isHome && yourWeek.length > 0 && (
        <Link
          className="home-shareprompt home-shareprompt-bottom"
          href={meKind === "coach" ? "/coachshare" : "/membershare"}
        >
          <span className="home-shareprompt-copy">
            <strong>Your week, ready to share</strong>
            <span>Post your calendar to Instagram or save it as a photo.</span>
            <span className="home-shareprompt-action">
              Share your week <Icon name="arrow_forward" size={17} />
            </span>
          </span>
          <span className="home-shareprompt-visual" aria-hidden="true">
            <span className="home-shareprompt-story">
              <i /><b>MY WEEK</b><em /><em /><em />
            </span>
            <span className="home-shareprompt-instagram"><i /></span>
          </span>
        </Link>
      )}

      {/* No floating search circle either: the Search tab took the act.
          People near you stays one tap away behind the rail's Add. */}
      {isHome && find && <DiscoverSheet onClose={closeFind} />}

      {isHome && findIntro && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFindIntro(false);
          }}
        >
          <div className="sheet confirmsheet circleeducation">
            <span className="circleeducation-icon" aria-hidden="true">
              <Icon name="group" size={24} />
            </span>
            <h2>Keep up with your coaches</h2>
            <p className="lead">
              Follow coaches to keep their upcoming classes at the top of Home.
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                onClick={() => {
                  try {
                    localStorage.setItem("fl-circle-intro-seen", "1");
                  } catch {
                    // The explanation simply returns next time in private mode.
                  }
                  setFindIntro(false);
                  setFind(true);
                }}
              >
                Find people
              </button>
            </div>
            <button className="confirm-keep" onClick={() => setFindIntro(false)}>
              Not now
            </button>
          </div>
        </div>
      )}

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

      {peekPerson && (
        <CoachPeek
          id={peekPerson.id}
          name={peekPerson.name}
          photo={peekPerson.photo}
          color={peekPerson.color}
          self={peekPerson.id === meId}
          shareHref={meKind === "coach" ? "/coachshare" : "/membershare"}
          onClose={() => {
            setPeekPerson(null);
            // The ring went out and follows may have flipped behind the
            // sheet; closing is where the rail catches up.
            router.refresh();
          }}
        />
      )}

      {peek && (
        <ClassPeek cls={peek} onClose={() => setPeek(null)} onToast={notify} onChanged={() => {}} />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

/** The corner ribbon: the one act this list turns on. Optimistic, so the
 *  ribbon fills on the tap rather than the round trip; the toast says
 *  where the class went, because the calendar is another tab away. */
function SaveCorner({
  classId,
  iso,
  name,
  on,
  onToast,
  onChange,
  bare = false,
}: {
  classId: string;
  iso: string;
  name: string;
  on: boolean;
  onToast: (msg: string, hlKey?: string) => void;
  onChange: (on: boolean) => void;
  /** The glyph alone, for the rail's compact card: the aria-label still
   *  says the word. */
  bare?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`rowsave${on ? " on" : ""}${bare ? " bare" : ""}`}
      aria-pressed={on}
      aria-label={on ? `Added to your week: ${name}` : `Add ${name} to your week`}
      disabled={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        onChange(!on);
        const res = await setGoing(classId, iso, !on);
        if (!res.ok) onChange(on);
        else if (!on) {
          announceSaved(classId, iso);
          onToast("Added to your week", `${classId}.${iso}`);
        }
        setBusy(false);
      }}
    >
      <Icon name={on ? "check" : "add_circle"} size={20} />
      {!bare && <span>{on ? "Added" : "Add"}</span>}
    </button>
  );
}

/** One row: the flat containerless line with Save across from the coach's
 *  own line. A sibling of the row, never a child. Your own class carries
 *  none, because setGoing would refuse it. */
const renderRow =
  (
    meId: string | undefined,
    notify: (msg: string, hlKey?: string) => void,
    isAdded: (item: FeedItem) => boolean,
    changeGoing: (key: string, on: boolean) => void,
    labelFrom?: string,
  ) =>
  // eslint-disable-next-line react/display-name
  (r: WeekRow & { item: FeedItem }) => (
    <div key={r.key} className="clrow">
      {labelFrom && (
        <span className={`home-classdate${r.item.iso === labelFrom ? " today" : ""}`}>
          {r.item.iso === labelFrom ? "Today" : tabLabel(r.item.iso)}
        </span>
      )}
      <ClassLine row={r} />
      {r.item.coachId !== meId && (
        <SaveCorner
          classId={r.item.classId}
          iso={r.item.iso}
          name={r.item.name}
          on={isAdded(r.item)}
          onToast={notify}
          onChange={(on) => changeGoing(r.item.key, on)}
          bare
        />
      )}
    </div>
  );

const plusDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** "Mon 10": the weekday and the date, the way a booking rail says a day. */
function tabLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${d.getUTCDate()}`;
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
