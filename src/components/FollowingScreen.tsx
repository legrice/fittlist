"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setGoing } from "@/app/actions/going";
import { useBandTop } from "@/components/CalendarBits";
import { ClassPeek, type PeekClass } from "@/components/ClassPeek";
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

/** When the date rail earns its place: the busiest day holding more than
 *  this many classes. Under it the whole horizon scrolls as one list. */
const DENSE_DAY = 10;

/**
 * Discover: the search door, the This week rail, and Upcoming near you.
 *
 * The rail is the people you follow who actually have something coming up,
 * soonest first, each circle a name and a ring: solid orange when their
 * week changed since you last opened it, grey once seen. The list below is
 * every listable coach's classes, one day at a time behind the date rail,
 * whether or not you follow anybody: a follow is how you see someone's
 * week, never what fills this feed.
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
}) {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [sheet, setSheet] = useState<null | "all" | "time" | "dist" | "cat" | "place">(null);
  // One day at a time, back by Matt's call: the date tabs run left to
  // right and the list under them is that day alone. Lands on today, or
  // the first day that holds anything when today is quiet.
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
  // The viewer's pin, asked for the first time a distance is picked and
  // never before: a screen that asks for location on arrival is a screen
  // people say no to.
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [toastMsg, toastOn, toast] = useToast();
  // The save toast carries "See it": the calendar the class landed on is a
  // tab away, and the link points at the exact occurrence (?hl lights it).
  const [toastGo, setToastGo] = useState<string | null>(null);
  const calHref = meKind === "coach" ? "/calendar" : "/week";
  const notify = (msg: string, hlKey?: string) => {
    setToastGo(hlKey ? `${calHref}?hl=${encodeURIComponent(hlKey)}` : null);
    toast(msg);
  };
  const router = useRouter();

  // The date tabs pin under the app header. `--dayband-top` lives on
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

  // One row mapping for both list modes. No duration on this list, by
  // Matt's call: the length is the class page's fact, and the left column
  // is the clock alone.
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

  // Two list modes, decided by density, by Matt's call: while no day holds
  // more than about ten classes, the whole horizon scrolls as one banded
  // list, because tabs over a thin inventory are doors to near-empty
  // rooms. The date rail takes over the day a single day outgrows a
  // screen.
  const dense = useMemo(() => {
    const per = new Map<string, number>();
    for (const i of items) per.set(i.iso, (per.get(i.iso) ?? 0) + 1);
    return Math.max(0, ...per.values()) > DENSE_DAY;
  }, [items]);

  // The selected day's rows, for the date-rail mode.
  const dayRows: (WeekRow & { item: FeedItem })[] = useMemo(() => {
    const list = shown.filter((i) => i.iso === day).sort((a, b) => a.mins - b.mins);
    return list.map(rowOf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, day, coachById, favIds]);

  // Every day at once, banded, for the scroll mode.
  const dayGroups = useMemo(() => {
    const kept = [...shown].sort((a, b) =>
      a.iso === b.iso ? a.mins - b.mins : a.iso < b.iso ? -1 : 1,
    );
    const byIso = new Map<string, FeedItem[]>();
    for (const i of kept) byIso.set(i.iso, [...(byIso.get(i.iso) ?? []), i]);
    return [...byIso.entries()].map(([iso, list]) => ({
      iso,
      label: bandLabel(iso, todayIso),
      rows: list.map(rowOf),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, coachById, favIds, todayIso]);

  // Hide the rail rather than draw it dead: following nobody keeps the
  // teaching state (ghosts and one line), following only people with
  // nothing coming up hides the block entirely.
  const railShows = follows === 0 || myRail.length >= RAIL_MIN_PEOPLE;

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
      {/* The search bar leads, back by Matt's call: Home is where the
          looking starts, and the bar is drawn as the field it opens. It is
          a door to the Search tab's own screen, not a second search. */}
      <div className="dissearchrow dishome-search">
        <Link className="dissearch dissearch-door" href="/search" aria-label="Search fittlist">
          <Icon name="search" size={21} className="dissearch-ic" />
          <span className="dissearch-ph">Search coaches, classes, studios</span>
        </Link>
      </div>

      {/* This week: the people you follow with something coming up, soonest
          first, no captions and no badges. A circle is a name and a ring,
          the ring is the freshness signal, and tapping one opens their
          week. You lead it, wearing your own face, and Add ends it. */}
      {railShows && (
        <div className="tray">
          <p className="nearlbl railbl">This week</p>
          <div className="tray-scroll">
            <Link className="trayitem" href={meKind === "coach" ? "/coachshare" : "/membershare"}>
              <span className="trayav trayav-you">
                {meFace.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={meFace.photo} alt="" />
                ) : (
                  <span className="trayav-ini" style={{ background: meFace.color }}>
                    {initials(meFace.name)}
                  </span>
                )}
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

      {/* Upcoming near you: every listable coach's classes, not only the
          people you follow. The four chips say their current value, which
          is what lets one row replace five pills. */}
      <div className="nearhead">
        <span className="nearlbl">Upcoming near you</span>
        <div className="catpills fchips">
          {/* The leading chip opens everything at once, wearing the count
              of what is set, by Matt's call: the single-question chips
              answer one ask each, and this is the door for somebody
              setting several. */}
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
      </div>

      {/* The dates, left to right, only once a single day is busy enough
          to need them: tabs over a thin inventory are doors to near-empty
          rooms, so the whole horizon scrolls until then, by Matt's call. */}
      {dense && (
        <div className="daytabs" role="tablist" aria-label="Day">
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

      <div className="cardwrap">
        {/* Why Today isn't the selected tab, said once: the landing skipped
            ahead to the first day holding anything. Tabs mode only; the
            scroll's first band already names its own date. */}
        {dense && landed.current !== todayIso && day === landed.current && (
          <p className="daynote">
            No classes today, showing{" "}
            {landed.current === plusDays(todayIso, 1) ? "tomorrow" : tabLabel(landed.current)}
          </p>
        )}

        {(dense ? dayRows.length === 0 : dayGroups.length === 0) ? (
          anyFilter ? (
            // The empty state knows why it is empty: never "nobody has
            // added classes" when the truth is the filter.
            <p className="dayempty">
              Nothing matches{dense ? ` on ${day === todayIso ? "today" : tabLabel(day)}` : ""}.
              Try widening the time or distance.
            </p>
          ) : items.length === 0 ? (
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
          ) : (
            <p className="dayempty">
              Nothing on {day === todayIso ? "today" : tabLabel(day)}.
            </p>
          )
        ) : dense ? (
          <div className="disflat">{dayRows.map(renderRow(meId, notify))}</div>
        ) : (
          dayGroups.map((d) => (
            <section key={d.iso} className="dayblock">
              <DayBand label={d.label} today={d.iso === todayIso} />
              <div className="disflat">{d.rows.map(renderRow(meId, notify))}</div>
            </section>
          ))
        )}
      </div>

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
                  {/* Everything at once, staying open while you set it:
                      the single chips answer one question each, this one
                      answers them all before the list redraws behind. */}
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
      <Toast
        msg={toastMsg}
        on={toastOn}
        action={toastGo ? { label: "See it", href: toastGo } : null}
      />
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
}: {
  classId: string;
  iso: string;
  name: string;
  initial: boolean;
  onToast: (msg: string, hlKey?: string) => void;
}) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`rowsave${on ? " on" : ""}`}
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
      <span>{on ? "Saved" : "Save"}</span>
    </button>
  );
}

/** One row, in either list mode: the flat line with Save across from the
 *  coach's own line. A sibling of the row, never a child. Your own class
 *  carries none, because setGoing would refuse it. */
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

/** "Today, Aug 9", then the date: the same words the calendars use. */
function bandLabel(iso: string, today: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (iso === today) return `Today, ${md}`;
  const wd = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${wd}, ${md}`;
}

const plusDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** "Mon 10": the weekday and the date, the way a booking rail says a day. */
function tabLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${d.getUTCDate()}`;
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
