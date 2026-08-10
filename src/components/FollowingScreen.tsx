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
import { initialOf } from "@/lib/avatar";

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
  lat: number | null;
  lng: number | null;
  local: boolean;
};

/** A circle on the Coaches near you rail, the viewer's own follow state
 *  riding along so the pill under the face starts right. */
export type LocalCoach = {
  id: string;
  handle: string;
  name: string;
  photo: string | null;
  color: string;
  following: boolean;
  requested: boolean;
  local: boolean;
};

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

/** The brief says hide the rail below about three people; the floor here is
 *  one, because three hides the rail for nearly every account at current
 *  density and takes the peek with it. Raise it when density does. */
const RAIL_MIN_PEOPLE = 1;

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
 * Home: the This week rail, then three rails of what's around you.
 *
 * The faces are the people you follow who actually have something coming
 * up, soonest first, each circle a name and a ring: solid orange when
 * their week changed since you last opened it, bare once seen. Under them
 * Upcoming near you is a rail of event cards (every listable coach's
 * classes, whether or not you follow anybody), then the studios and the
 * coaches around you. Each head's arrow opens Search on that kind's
 * segment; the full browsable list lives there now.
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
  meKind,
  meFace,
  nearStudios,
  localCoaches,
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
  localCoaches: LocalCoach[];
}) {
  // The containerless list with the date rail and the filters, back by
  // Matt's call: one day at a time behind the tabs, landing on today or
  // the first day that holds anything, four value-showing chips over it.
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
  const [toastMsg, toastOn, toast] = useToast();
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

  // One row mapping. No duration on this list, by Matt's call: the length
  // is the class page's fact, and the left column is the clock alone.
  const rowOf = (i: FeedItem): WeekRow & { item: FeedItem } => {
    const c = coachById.get(i.coachId);
    return {
      item: i,
      key: i.key,
      name: i.name,
      where: i.where,
      hm: i.hm,
      ap: i.ap,
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
  const railShows = follows === 0 || myRail.length >= RAIL_MIN_PEOPLE;

  const milesTo = (s: NearStudio): number | null =>
    geo && s.lat != null && s.lng != null
      ? milesBetween(geo, { lat: s.lat, lng: s.lng })
      : null;
  const studiosNear = useMemo(() => {
    if (!geo) return nearStudios;
    const d = (s: NearStudio) =>
      s.lat != null && s.lng != null ? milesBetween(geo, { lat: s.lat, lng: s.lng }) : Infinity;
    return [...nearStudios].sort((a, b) => d(a) - d(b));
  }, [nearStudios, geo]);

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
      {/* No search bar up here any more, by Matt's call: the magnifier
          lives in the header's corner, right of the bell, and the rail
          leads the screen. */}
      {/* This week: the people you follow with something coming up, soonest
          first, no captions and no badges. A circle is a name and a ring,
          the ring is the freshness signal, and tapping one opens their
          week. You lead it, wearing your own face, and Add ends it. */}
      {railShows && (
        <div className="tray">
          <p className="nearlbl railbl">This week</p>
          <div className="tray-scroll">
            <Link className="trayitem" href={meKind === "coach" ? "/coachshare" : "/membershare"}>
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
                {youFresh && <span className="younew">New</span>}
              </span>
              <span className="trayitem-nm">You</span>
            </Link>
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
            <button className="trayitem" onClick={() => setFind(true)}>
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
              Follow the coaches you go to most and the friends you train with. Their week
              shows up here.
            </p>
          )}
        </div>
      )}

      {/* Upcoming near you is a rail of event cards now, by Matt's call:
          the date as a leaf on the left, the class beside it, the arrow in
          the head the door to the full browsable list (Search's Classes
          segment). The filters and the date tabs went with the vertical
          list; both live in git at the commit that replaced them. */}
      {items.length === 0 ? (
        <>
          <div className="nearhead nearhead-row">
            <span className="nearlbl">Upcoming near you</span>
          </div>
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
            <button className="btn si wkempty-cta" onClick={() => setFind(true)}>
              Find people
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="nearhead nearhead-row">
            <span className="nearlbl">Upcoming near you</span>
            <Link className="nearhead-go" href="/search?seg=classes" aria-label="All upcoming classes">
              <Icon name="arrow_forward" size={22} />
            </Link>
          </div>
          {/* The four chips say their current value, which is what lets one
              row replace five pills; the leading chip opens everything at
              once wearing the count of what is set. */}
          <div className="catpills fchips">
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

          {/* The dates, left to right: one day at a time, the list under
              them that day alone. */}
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

          <div className="cardwrap">
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
              <div className="disflat">{dayRows.map(renderRow(meId, notify))}</div>
            )}
          </div>
        </>
      )}

      {/* Under the schedule, the places and the people, by Matt's call:
          the studios closest to you as rectangles on a rail, then the
          coaches around you with Follow one tap deep. Your own city leads
          both. Each head's arrow opens Search on that kind's segment. */}
      {nearStudios.length > 0 && (
        <section className="nearrail">
          <div className="nearhead nearhead-row">
            <span className="nearlbl">Local studios</span>
            <Link className="nearhead-go" href="/search?seg=studios" aria-label="All studios">
              <Icon name="arrow_forward" size={22} />
            </Link>
          </div>
          <div className="strail">
            {studiosNear.map((s) => {
              const mi = milesTo(s);
              return (
                <Link key={s.id} className="strail-item" href={`/s/${s.slug}?from=discover`}>
                  <span className="strail-ph">
                    {s.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.photo} alt="" />
                    ) : (
                      <span className="strail-ini" style={{ background: s.color }}>
                        {initialOf(s.name)}
                      </span>
                    )}
                  </span>
                  <span className="strail-nm">{s.name}</span>
                  {mi !== null && (
                    <span className="strail-mi">
                      {mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi away
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}
      {localCoaches.length > 0 && (
        <section className="nearrail">
          <div className="nearhead nearhead-row">
            {/* Find friends, by Matt's call: the rail is coaches, and the
                word is the act it invites. */}
            <span className="nearlbl">Find friends</span>
            <Link className="nearhead-go" href="/search?seg=people" aria-label="All coaches and members">
              <Icon name="arrow_forward" size={22} />
            </Link>
          </div>
          <div className="ctrail">
            {localCoaches.map((c) => (
              <CoachNear key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      {/* What this is, at the end of the scroll: one paragraph and the
          door to the whole story, with the Contribute ask behind it. */}
      <section className="abouthome">
        <h2 className="nearlbl">One place where all of it lives</h2>
        <p className="abouthome-p">
          FittList is a public record of what&rsquo;s happening in local fitness:
          the classes, the places they happen, and the people leading them.
        </p>
        <Link className="abouthome-go" href="/about">
          About FittList
          <Icon name="chevron_right" size={18} />
        </Link>
      </section>

      {/* No floating search circle either: the Search tab took the act.
          People near you stays one tap away behind the rail's Add. */}
      {find && <DiscoverSheet onClose={closeFind} />}

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
  initial,
  onToast,
  bare = false,
}: {
  classId: string;
  iso: string;
  name: string;
  initial: boolean;
  onToast: (msg: string, hlKey?: string) => void;
  /** The glyph alone, for the rail's compact card: the aria-label still
   *  says the word. */
  bare?: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`rowsave${on ? " on" : ""}${bare ? " bare" : ""}`}
      aria-pressed={on}
      aria-label={on ? `Saved: ${name}` : `Save ${name}`}
      disabled={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        setOn(!on);
        const res = await setGoing(classId, iso, !on);
        if (!res.ok) setOn(on);
        else if (!on) onToast("Saved to your calendar", `${classId}.${iso}`);
        setBusy(false);
      }}
    >
      <Icon name={on ? "bookmark_added" : "bookmark"} size={20} />
      {!bare && <span>{on ? "Saved" : "Save"}</span>}
    </button>
  );
}

/** One row: the flat containerless line with Save across from the coach's
 *  own line. A sibling of the row, never a child. Your own class carries
 *  none, because setGoing would refuse it. */
const renderRow =
  (meId: string | undefined, notify: (msg: string, hlKey?: string) => void) =>
  // eslint-disable-next-line react/display-name
  (r: WeekRow & { item: FeedItem }) => (
    <div key={r.key} className="clrow">
      <ClassLine row={r} />
      {r.item.coachId !== meId && (
        <SaveCorner
          classId={r.item.classId}
          iso={r.item.iso}
          name={r.item.name}
          initial={r.item.saved}
          onToast={notify}
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

/** One circle on the Coaches near you rail: the face opens their page, and
 *  the pill under it follows without leaving the list. The pill only draws
 *  while there is something to do: followed means no pill, and Requested is
 *  the cancel, the way it is everywhere else. */
function CoachNear({ c }: { c: LocalCoach }) {
  const [state, setState] = useState<"off" | "following" | "requested">(
    c.following ? "following" : c.requested ? "requested" : "off",
  );
  const [busy, setBusy] = useState(false);
  const tap = async () => {
    if (busy || state === "following") return;
    setBusy(true);
    if (state === "off") {
      const { followTrainer } = await import("@/app/actions/subscribe");
      const res = await followTrainer(c.handle);
      if (res.ok) setState(res.requested ? "requested" : "following");
    } else {
      const { unfollowTrainer } = await import("@/app/actions/subscribe");
      const res = await unfollowTrainer(c.handle);
      if (res.ok) setState("off");
    }
    setBusy(false);
  };
  return (
    <div className="ctrail-item">
      <Link className="ctrail-go" href={`/${c.handle}?from=discover`}>
        <span className="trayav ctrail-av">
          {c.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.photo} alt="" />
          ) : (
            <span className="trayav-ini" style={{ background: c.color }}>
              {initials(c.name)}
            </span>
          )}
        </span>
        <span className="trayitem-nm">{c.name.split(/\s+/)[0]}</span>
      </Link>
      {state !== "following" && (
        <button
          className={`peekfollow ctrail-fl${state === "requested" ? " on" : ""}`}
          disabled={busy}
          onClick={tap}
        >
          {state === "requested" ? "Requested" : "Follow"}
        </button>
      )}
    </div>
  );
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
