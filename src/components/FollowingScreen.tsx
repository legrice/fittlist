"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScrollHead, useBandTop, useTopDayLabel } from "@/components/CalendarBits";
import { ClassPeek, type PeekClass } from "@/components/ClassPeek";
import { DiscoverSheet } from "@/components/DiscoverSheet";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { fmtDayHeaderRel } from "@/lib/format";
import { DayList, WeekEmpty, initials, type WeekDayRows } from "@/components/WeekView";

export type FeedCoach = {
  id: string;
  name: string;
  handle: string;
  photo: string | null;
  color: string;
  /** When their next class is ("Today 6:00p"), under the face on the rail:
   *  the rail answers "who can I train with next" before a single tap. */
  next: string | null;
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
};

/**
 * Everyone you follow, as one week.
 *
 * The rail is the filter and the only one there is. Tapping a face narrows the
 * week to that coach; tapping it again, or All, gives everyone back. It is
 * single-select on purpose: a multi-select rail is a set of checkboxes wearing
 * photographs, and the question this screen answers is "what has Nadia got on",
 * which has one subject.
 *
 * There is nothing to save here. A member has no calendar of their own, so a
 * class opens to say when, where and whose, and offers the way to that coach's
 * page. The relationship is reading, not collecting.
 */
export function FollowingScreen({
  items,
  coaches,
  favIds,
  cats,
  follows,
  todayIso,
  meId,
}: {
  items: FeedItem[];
  coaches: FeedCoach[];
  /** Who the viewer favorited: the rail is these and only these. The feed
   *  underneath is everyone, which is what makes this screen Discover. */
  favIds: string[];
  /** The category pills, from what the list actually holds. */
  cats: string[];
  /** How many favorites: the rail's empty state forks on this. */
  follows: number;
  todayIso: string;
  /** The viewer: their own rows (a coach's own week rides this feed) skip
   *  the report row, which could only ever answer with an error. */
  meId?: string;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [peek, setPeek] = useState<PeekClass | null>(null);
  const [find, setFind] = useState(false);
  // The class sheet's copy fallback speaks through this: it was a no-op
  // for a while, so on a browser with no share tray the link was copied
  // and nothing said so, which reads as a dead button.
  const [toastMsg, toastOn, toast] = useToast();
  const router = useRouter();

  // The bands pin under the app header and nothing else: the coach rail above
  // them scrolls away. `--dayband-top` lives on documentElement, so a screen
  // that draws bands and forgets this inherits whatever the last screen set
  // and pins them halfway down the phone, through the middle of a row. That
  // has shipped once already, on Discover.
  useBandTop();

  // The overlay header's words: the day under the top of the viewport. At
  // rest no day has reached it, the label is empty, and the bar stays away.
  const topDay = useTopDayLabel();

  // Following somebody in the sheet is the whole reason the sheet exists, and
  // the week behind it is a server render: closing is where it catches up. The
  // action revalidates /feed, but nothing re-renders a page that is already on
  // screen, so without this you would follow three people, close, and find the
  // same empty rail you opened.
  // The tray pins under the header, part of the chrome the card slides over:
  // its sticky top is the pinned header's own height, which is a measured
  // number because the safe area moves it (a constant that has to track a
  // measured thing is a constant that will be wrong again).
  const trayRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = trayRef.current;
    const bar = document.querySelector<HTMLElement>(".brandbar");
    if (!el || !bar) return undefined;
    const set = () => el.style.setProperty("--tray-top", `${bar.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const closeFind = () => {
    setFind(false);
    router.refresh();
  };

  const coachById = useMemo(() => new Map(coaches.map((c) => [c.id, c])), [coaches]);

  // Only the people who actually have something in the range. The rail filters
  // the week, so a face with nothing behind it is a chip that can only ever
  // empty the screen. They stay followed; they are just not on the rail.
  //
  // Across all three weeks rather than the visible one, on purpose. Scoped to
  // the week the rail would rearrange itself every time you tapped an arrow,
  // and a face moving out from under a thumb between taps is worse than a face
  // that is quiet this week: the arrow is right there, and the empty state
  // says so.
  const rail = useMemo(() => {
    const fav = new Set(favIds);
    return coaches.filter((c) => fav.has(c.id));
  }, [coaches, favIds]);

  const shown = useMemo(
    () => items.filter((i) => (!focus || i.coachId === focus) && (!cat || i.classType === cat)),
    [items, focus, cat],
  );

  const days: WeekDayRows[] = useMemo(() => {
    const byIso = new Map<string, FeedItem[]>();
    for (const i of shown) {
      const list = byIso.get(i.iso) ?? [];
      list.push(i);
      byIso.set(i.iso, list);
    }
    return [...byIso.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, list]) => {
        return {
          iso,
          // "Today", "Tomorrow", then the date. The same words the rest of the
          // app uses for a day, so one day is never named two ways.
          label: fmtDayHeaderRel(iso, todayIso),
          today: iso === todayIso,
          rows: groupBusyPlaces(list.sort((a, b) => a.mins - b.mins), coachById, router).map((r) => {
            if (r.group) return r.row;
            const i = r.item;
            return ((i) => {
              const c = coachById.get(i.coachId);
              return {
                key: i.key,
                name: i.name,
                where: i.where,
                hm: i.hm,
                ap: i.ap,
                dur: `${i.durationMin} min`,
                coach: c
                  ? { id: c.id, name: c.name, color: c.color, photo: c.photo }
                  : null,
                onTap: () => setPeek(peekOf(i, c ?? null)),
                menu: {
                  classId: i.classId,
                  base: i.base,
                  iso: i.iso,
                  canReport: i.coachId !== meId,
                  onDetails: () => setPeek(peekOf(i, c ?? null)),
                  coach: c ? { name: c.name, href: `/${c.handle}` } : null,
                  studio: i.where && i.whereHref ? { name: i.where, href: i.whereHref } : null,
                },
              };
            })(i);
          }),
        };
      });
  }, [shown, coachById, todayIso, router]);

  // The feed is everyone now, so it is only ever empty when nothing is
  // listed near you at all: the one state a brand-new region sees. No
  // favorites is not an empty screen any more, because a favorite was never
  // what filled it.
  if (!items.length) {
    return (
      <>
        <div className="cardwrap">
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
              Classes show up here as coaches list them. Find a coach to favorite in the
              meantime; their next class will lead your Discover.
            </p>
            <button className="btn si wkempty-cta" onClick={() => setFind(true)}>
              Find coaches
            </button>
          </div>
        </div>
        <button className="wkfab wkfab-find" aria-label="Find coaches" onClick={() => setFind(true)}>
          <Icon name="search" size={26} />
        </button>
        {find && <DiscoverSheet onClose={closeFind} />}
      </>
    );
  }

  return (
    <>
      {/* The overlay header: nothing at rest, and the day under it once
          you're deep, so the scroll is never unlabelled. */}
      <ScrollHead on={!!topDay} label={topDay} />
      {/* The rail is chrome, and it scrolls away with the page now: the
          overlay header is what stays. */}
      <div className="tray" ref={trayRef}>
        {/* The rail is your favorites and only them, per the brief: a
            shortcut to the people you go to most, never what fills the list
            below. The caption under each face is when their next class is,
            so the rail answers "who can I train with next" unopened. */}
        <div className="traylbl">
          <span>Your coaches{rail.some((c) => c.next) ? " \u00b7 next up" : ""}</span>
          <button className="traylbl-all" onClick={() => setFind(true)}>
            See all
          </button>
        </div>
        <div className="tray-scroll">
          {rail.map((c) => {
            const on = focus === c.id;
            return (
              <button
                key={c.id}
                className={`trayitem${focus && !on ? " dim" : ""}`}
                aria-pressed={on}
                onClick={() => setFocus(on ? null : c.id)}
              >
                <span className={`trayav${on ? " sel" : ""}`}>
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
                {c.next && <span className="trayitem-next">{c.next}</span>}
              </button>
            );
          })}
          {/* The way to lengthen the rail, at the end of it, never one of
              the faces. With no favorites yet it gets two dashed
              placeholders for company and a line saying what the rail is
              for, per the brief: the shape of the thing sells the thing. */}
          <button className="trayitem" onClick={() => setFind(true)}>
            <span className="trayav trayav-add">
              <Icon name="add" size={28} />
            </span>
            <span className="trayitem-nm">Add</span>
          </button>
          {rail.length === 0 && (
            <>
              <span className="trayav trayav-ghost" aria-hidden="true" />
              <span className="trayav trayav-ghost" aria-hidden="true" />
            </>
          )}
        </div>
        {rail.length === 0 && (
          <p className="trayhint">
            Add the coaches you go to most. Their next class always shows here.
          </p>
        )}
      </div>

      {/* Near you, with the category pills: the one filter that helps you
          pick a class, from the words the list actually holds. Any pick
          takes All off; All is the way back. */}
      <div className="nearhead">
        <span className="nearlbl">Near you</span>
        {cats.length > 0 && (
          <div className="catpills">
            <button
              className={`catpill${cat === null ? " on" : ""}`}
              aria-pressed={cat === null}
              onClick={() => setCat(null)}
            >
              All
            </button>
            {cats.map((t) => (
              <button
                key={t}
                className={`catpill${cat === t ? " on" : ""}`}
                aria-pressed={cat === t}
                onClick={() => setCat(cat === t ? null : t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* The card starts under the faces: the rail is chrome, the week is
          content, and the card edge is what says so. */}
      <div className="cardwrap">
      {/* Who the rail has narrowed to, and the way to them.
          A filtered list looks exactly like a quiet week: five faces, one of
          them ringed, and a shorter list underneath. This says which coach in
          words, so the state is readable rather than inferred, and it carries
          the one thing you want next after "what has Emdilger got on", which
          is Emdilger. It is only drawn when a face is picked: with everyone
          showing there is nothing to name and no single profile to open. */}
      {focus &&
        (() => {
          const c = coachById.get(focus);
          if (!c) return null;
          return (
            <div className="focusbar">
              <span className="focusbar-t">Classes with {c.name.split(/\s+/)[0]}</span>
              <a className="focusbar-a" href={`/${c.handle}?from=following`}>
                View profile
                <Icon name="chevron_right" size={19} />
              </a>
            </div>
          );
        })()}

      {/* No week stepper here, on purpose. Your calendar is a week you flip
          through, because you are working on it; this is a list of what is
          coming, because you are reading it and "when can I train next" is not
          a question any week boundary answers.

          No heading either. "Coming up" was a 32px title saying what the date
          headings underneath it already say, and the line under it counted
          the classes and the coaches, which is arithmetic the list is doing
          at you: the rows are the answer and they are right there. Both came
          off, so the faces are followed by the first day rather than by two
          lines about the faces. */}
      {days.length === 0 ? (
        <WeekEmpty
          first
          title={focus ? "Nothing from them coming up" : "Nothing coming up"}
          body={
            focus
              ? "Tap All coaches to see the rest."
              : "The people you follow have not put anything up yet."
          }
        />
      ) : (
        <DayList days={days} />
      )}
      </div>

      {/* Discovery is this button and the plus on the rail, and they open the
          same sheet. The dock carried a search circle for a build and Matt
          reverted it after living with it: the floating orange circle over
          the one list the act is about is the shape that stays. */}
      <button className="wkfab wkfab-find" aria-label="Find coaches" onClick={() => setFind(true)}>
        <Icon name="search" size={26} />
      </button>

      {find && <DiscoverSheet onClose={closeFind} />}

      {peek && (
        <ClassPeek
          cls={peek}
          onClose={() => setPeek(null)}
          onToast={toast}
          onChanged={() => {}}
        />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

/** The tapped occurrence, as the sheet wants it. Somebody else's class, so it
 *  names the coach and offers their week rather than an edit. */
/**
 * A busy place folds into one row, per the brief: three or more classes at
 * one studio on one day become the place, the time range, the count and
 * the coaches, opening the studio's page. This is what stops an expo or a
 * loaded gym Monday from taking over the feed. Classes with no studio page
 * never group; there is nothing to open.
 */
function groupBusyPlaces(
  list: FeedItem[],
  coachById: Map<string, FeedCoach>,
  router: { push: (href: string) => void },
): ({ group: true; row: import("@/components/WeekView").WeekRow } | { group?: false; item: FeedItem })[] {
  const byPlace = new Map<string, FeedItem[]>();
  for (const i of list) {
    if (!i.whereHref) continue;
    byPlace.set(i.whereHref, [...(byPlace.get(i.whereHref) ?? []), i]);
  }
  const grouped = new Set<string>();
  for (const [href, items] of byPlace) if (items.length >= 3) grouped.add(href);
  const emitted = new Set<string>();
  const out: ({ group: true; row: import("@/components/WeekView").WeekRow } | { group?: false; item: FeedItem })[] = [];
  for (const i of list) {
    if (!i.whereHref || !grouped.has(i.whereHref)) {
      out.push({ item: i });
      continue;
    }
    if (emitted.has(i.whereHref)) continue;
    emitted.add(i.whereHref);
    const items = byPlace.get(i.whereHref)!;
    const first = items[0];
    const last = items[items.length - 1];
    const names = [
      ...new Set(
        items
          .map((x) => coachById.get(x.coachId)?.name.split(/\s+/)[0])
          .filter((n): n is string => !!n),
      ),
    ];
    const who = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
    const href = i.whereHref;
    out.push({
      group: true,
      row: {
        key: `grp|${first.iso}|${href}`,
        name: first.where ?? "A busy day",
        where: `${items.length} classes \u00b7 ${first.hm}${first.ap.toLowerCase()} to ${last.hm}${last.ap.toLowerCase()}${who ? ` \u00b7 ${who}` : ""}`,
        hm: first.hm,
        ap: first.ap,
        onTap: () => router.push(href),
      },
    });
  }
  return out;
}

function peekOf(i: FeedItem, coach: FeedCoach | null): PeekClass {
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
      ? { name: coach.name, handle: coach.handle, photo: coach.photo, color: coach.color }
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
