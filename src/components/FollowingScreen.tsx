"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBandTop } from "@/components/CalendarBits";
import { ClassPeek, type PeekClass } from "@/components/ClassPeek";
import { ClassRowMenu } from "@/components/ClassRowMenu";
import { CoachPeek } from "@/components/CoachPeek";
import { DiscoverSheet } from "@/components/DiscoverSheet";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { ClassLine, DayBand, initials, type WeekRow } from "@/components/WeekView";

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

/** One circle on the This week rail: somebody you follow whose week was
 *  touched in the last seven days. The ring is the freshness signal and the
 *  circle is a name and a ring, nothing else, per the updates brief. */
export type RailPerson = {
  id: string;
  name: string;
  handle: string | null;
  photo: string | null;
  color: string;
  /** Their week changed since you last opened it: the ring is orange. */
  fresh: boolean;
  /** When their week was last touched, for the order behind the fresh ones. */
  activityAt: number;
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
};

/** The brief says hide the rail below about three people with fresh weeks,
 *  because an empty story rail reads as a dead app. A fresh week is one
 *  touched inside the seven-day window (the rail's own membership rule); a
 *  seen week stays on the rail with a grey ring. Three hides the rail for
 *  nearly every account at current density and takes the peek with it, so
 *  the floor here is one; raise it when density does. */
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
 * Discover: the search door, the This week rail, and Upcoming near you.
 *
 * The rail is the people you follow, coaches and members mixed, each circle
 * a name and a ring: solid orange when their week changed since you last
 * opened it, grey once seen. Tapping one opens their week as a live
 * calendar (CoachPeek) with working ribbons. The list below is everyone
 * near you whether you follow anybody or not; a follow is how you see
 * someone's week, never what fills a calendar or this feed.
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
  /** The viewer: their own rows (a coach's own week rides this feed) skip
   *  the report row, which could only ever answer with an error. */
  meId?: string;
  myRail: RailPerson[];
  /** Where the Your week circle points: the hub is per kind. */
  meKind: "coach" | "member";
}) {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [sheet, setSheet] = useState<null | "time" | "dist" | "cat" | "place">(null);
  const [peek, setPeek] = useState<PeekClass | null>(null);
  const [peekPerson, setPeekPerson] = useState<RailPerson | null>(null);
  const [find, setFind] = useState(false);
  // The viewer's pin, asked for the first time a distance is picked and
  // never before: a screen that asks for location on arrival is a screen
  // people say no to.
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [toastMsg, toastOn, toast] = useToast();
  const router = useRouter();

  // The day bands pin under the app header. `--dayband-top` lives on
  // documentElement, so a screen that pins and forgets this inherits
  // whatever the last screen set. That has shipped once already.
  useBandTop();

  const closeFind = () => {
    setFind(false);
    router.refresh();
  };

  const coachById = useMemo(() => new Map(coaches.map((c) => [c.id, c])), [coaches]);

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

  // Filter, then collapse: a recurring class appears once, at its next
  // occurrence, marked Weekly. Collapse after the filters so an evening
  // pick lands on the series' next evening date rather than losing the
  // whole series to a hidden morning one. Without the collapse an
  // open-ended list is the same class repeating down the feed forever.
  const days = useMemo(() => {
    const kept = items.filter(passes).sort((a, b) =>
      a.iso === b.iso ? a.mins - b.mins : a.iso < b.iso ? -1 : 1,
    );
    const count = new Map<string, number>();
    for (const i of kept) {
      const k = `${i.name.trim().toLowerCase()}|${i.where ?? ""}|${i.mins}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    const seen = new Set<string>();
    const rows: (WeekRow & { iso: string })[] = [];
    for (const i of kept) {
      const k = `${i.name.trim().toLowerCase()}|${i.where ?? ""}|${i.mins}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const weekly = (count.get(k) ?? 0) > 1;
      const c = coachById.get(i.coachId);
      rows.push({
        iso: i.iso,
        key: i.key,
        name: i.name,
        where: i.where ? `${i.where}${weekly ? " · Weekly" : ""}` : weekly ? "Weekly" : null,
        hm: i.hm,
        ap: i.ap,
        dur: `${i.durationMin} min`,
        coach: c ? { id: c.id, name: c.name, color: c.color, photo: c.photo } : null,
        onTap: () => setPeek(peekOf(i, c ?? null, favIds.includes(i.coachId))),
        menu: {
          classId: i.classId,
          base: i.base,
          iso: i.iso,
          canReport: i.coachId !== meId,
          onDetails: () => setPeek(peekOf(i, c ?? null, favIds.includes(i.coachId))),
          coach: c ? { name: c.name, href: `/${c.handle}` } : null,
          studio: i.where && i.whereHref ? { name: i.where, href: i.whereHref } : null,
        },
      });
    }
    const byIso = new Map<string, WeekRow[]>();
    for (const r of rows) byIso.set(r.iso, [...(byIso.get(r.iso) ?? []), r]);
    return [...byIso.entries()].map(([iso, list]) => ({
      iso,
      label: bandLabel(iso, todayIso),
      rows: list,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, f, geo, coachById, favIds, meId, todayIso]);

  // Hide the rail rather than draw it dead, per the brief: following nobody
  // keeps the teaching state (ghosts and one line), following only people
  // whose weeks have gone quiet hides the block entirely.
  const railShows = follows === 0 || myRail.length >= RAIL_MIN_PEOPLE;

  const pickDist = (v: Filters["dist"]) => {
    if (v !== "any" && !geo && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => toast("Distance needs your location. Everything shows meanwhile."),
      );
    }
    setF((cur) => ({ ...cur, dist: v }));
    setSheet(null);
  };

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
      {/* The search bar leads, drawn as the field it opens: the one door to
          /search, which covers people, studios and classes at once. */}
      <div className="dissearchrow dishome-search">
        <Link className="dissearch dissearch-door" href="/search" aria-label="Search fittlist">
          <Icon name="search" size={21} className="dissearch-ic" />
          <span className="dissearch-ph">Search coaches, classes, studios</span>
        </Link>
      </div>

      {/* This week: the people you follow, coaches and members mixed, no
          captions and no badges. A circle is a name and a ring, the ring is
          the freshness signal, and tapping one opens their week. Your week
          leads it (the door to the Share tab) and Add ends it. */}
      {railShows && (
        <div className="tray">
          <p className="nearlbl railbl">This week</p>
          <div className="tray-scroll">
            <Link className="trayitem" href={meKind === "coach" ? "/coachshare" : "/membershare"}>
              <span className="trayav trayav-you">
                <Icon name="arrow_outward" size={22} />
              </span>
              <span className="trayitem-nm">Your week</span>
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

      {/* Upcoming near you: open-ended, as far forward as there is data,
          because coverage is thin and an expo three weeks out is exactly
          what somebody wants to find. The four chips say their current
          value, which is what lets one row replace five pills. */}
      <div className="nearhead">
        <span className="nearlbl">Upcoming near you</span>
        <div className="catpills fchips">
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
      </div>

      <div className="cardwrap">
        {days.length === 0 ? (
          anyFilter ? (
            // The empty state knows why it is empty: never "nobody has
            // added classes" when the truth is the filter.
            <div className="wkempty">
              <h2 className="wkempty-t">Nothing matches</h2>
              <p className="wkempty-b">Try widening the time or distance.</p>
              <button className="btn si wkempty-cta" onClick={() => setF(NO_FILTERS)}>
                Clear filters
              </button>
            </div>
          ) : (
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
                meantime; their week will lead your Discover.
              </p>
              <button className="btn si wkempty-cta" onClick={() => setFind(true)}>
                Find people
              </button>
            </div>
          )
        ) : (
          days.map((d) => (
            <section key={d.iso} className="dayblock">
              <DayBand label={d.label} today={d.iso === todayIso} />
              <div className="disflat">
                {d.rows.map((r) =>
                  r.menu ? (
                    <div key={r.key} className="clrow">
                      <ClassLine row={r} />
                      <ClassRowMenu {...r.menu} name={r.name} />
                    </div>
                  ) : (
                    <ClassLine key={r.key} row={r} />
                  ),
                )}
              </div>
            </section>
          ))
        )}
      </div>

      {/* Finding people is this button and the rail's Add, and they open
          the same screen. */}
      <button className="wkfab wkfab-find" aria-label="Find people" onClick={() => setFind(true)}>
        <Icon name="search" size={26} />
      </button>

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
              {sheet === "time"
                ? "Time of day"
                : sheet === "dist"
                  ? "Distance"
                  : sheet === "cat"
                    ? "Type"
                    : "Places"}
            </h2>
            <div className="fopts">
              {sheet === "time" &&
                TIMES.map(([v, label]) => (
                  <button
                    key={v}
                    className="fopt"
                    aria-pressed={f.time === v}
                    onClick={() => {
                      setF((cur) => ({ ...cur, time: v }));
                      setSheet(null);
                    }}
                  >
                    {label}
                    {f.time === v && <Icon name="check" size={19} />}
                  </button>
                ))}
              {sheet === "dist" &&
                DISTS.map(([v, label]) => (
                  <button
                    key={v}
                    className="fopt"
                    aria-pressed={f.dist === v}
                    onClick={() => pickDist(v)}
                  >
                    {label}
                    {f.dist === v && <Icon name="check" size={19} />}
                  </button>
                ))}
              {sheet === "cat" &&
                ["any", ...cats].map((v) => (
                  <button
                    key={v}
                    className="fopt"
                    aria-pressed={f.cat === v}
                    onClick={() => {
                      setF((cur) => ({ ...cur, cat: v }));
                      setSheet(null);
                    }}
                  >
                    {v === "any" ? "All types" : v}
                    {f.cat === v && <Icon name="check" size={19} />}
                  </button>
                ))}
              {sheet === "place" && (
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
              )}
            </div>
            {sheet === "place" && (
              <div className="publishwrap nostick">
                <button className="btn si" onClick={() => setSheet(null)}>
                  Done
                </button>
              </div>
            )}
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
        <ClassPeek cls={peek} onClose={() => setPeek(null)} onToast={toast} onChanged={() => {}} />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

/** "Today, Aug 9", then the date: the same words the calendars use. */
function bandLabel(iso: string, today: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (iso === today) return `Today, ${md}`;
  const wd = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${wd}, ${md}`;
}

/** Miles between two pins, the haversine way, close enough for a filter. */
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
