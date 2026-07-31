"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { ClassSheet } from "@/components/ClassSheet";
import { EventComposer } from "@/components/EventComposer";
import { EventSheet } from "@/components/EventSheet";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { Toast, useToast } from "@/components/Toast";

// The poster tints for events with no flyer: warm paper colours the ink
// stays readable on, in either theme. Keyed on the id so a card doesn't
// change clothes between visits.
const POSTER_TINTS = ["#f2e3cf", "#dfe8d4", "#e6e0f0", "#f6ded6", "#dbe8ec", "#f0e0e8"];
const posterTint = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return POSTER_TINTS[h % POSTER_TINTS.length];
};

export type DiscoverCoach = {
  id: string;
  handle: string;
  name: string;
  /** Members list here too now; the badge is what tells them apart. */
  kind: "coach" | "member";
  photo: string | null;
  title: string;
  location: string;
  classesThisWeek: number;
  following: boolean;
  /** A pending ask at a coach who approves their followers. */
  requested: boolean;
  /** Worn as a dot on the avatar, same as the profile photo. Coaches only. */
  availability: string | null;
  color: string;
};

/** One entry in the Events view. Two things wear this shape: a coach's
 *  one-off dated class (a lens over the class row, linking to the class page
 *  where Going and share already work) and a posted community event (an expo,
 *  a competition, a meetup), which links to its own page and may carry a
 *  flyer. The photo is what decides row versus card. */
export type DiscoverEvent = {
  id: string;
  href: string;
  name: string;
  wd: string;
  mon: string;
  day: number;
  /** The when-and-where line, built server-side: "Sat · 6:00a · Ironbound". */
  sub: string;
  /** "with Matt" for a class, "Hosted by Hudson Fit Expo" for an event. */
  by: string;
  city: string;
  photo: string | null;
  sort: string;
};

// The row's corner control: a small Follow that flips green when it's a yes,
// so following someone doesn't require the round trip through their page.
// Same tri-state as the profile pill (a gated coach's tap reads Requested,
// tapping again withdraws it), scoped to its own row.
function FollowMini({
  handle,
  following,
  requested,
}: {
  handle: string;
  following: boolean;
  requested: boolean;
}) {
  const [state, setState] = useState<"off" | "asked" | "on">(
    following ? "on" : requested ? "asked" : "off",
  );
  // True only for a yes born of a tap, so the spring plays once at the moment
  // it means something and a page of already-green pills loads still.
  const [pop, setPop] = useState(false);
  const [pending, start] = useTransition();
  const tap = () =>
    start(async () => {
      if (state === "off") {
        const res = await followTrainer(handle);
        if (res.ok) {
          setState(res.requested ? "asked" : "on");
          setPop(!res.requested);
        }
      } else {
        const res = await unfollowTrainer(handle);
        if (res.ok) {
          setState("off");
          setPop(false);
        }
      }
    });
  return (
    <button
      className={`disfol${state === "on" ? " on" : ""}${pop ? " pop" : ""}`}
      disabled={pending}
      aria-pressed={state === "on"}
      onClick={tap}
    >
      {state === "on" && <Icon name="check" size={13} />}
      {state === "on" ? "Following" : state === "asked" ? "Requested" : "Follow"}
    </button>
  );
}

// Search + city filter over the directory. The corner control follows from
// the row now; the row's main job is still to get you to a person, and the
// Coach badge across from the name is what tells you who you're looking at,
// which is the distinction that matters once members can appear in a list.
export function DiscoverList({
  coaches,
  events = [],
  cities,
  myCity = null,
  canPost = false,
  backHref,
  hideBack = false,
}: {
  coaches: DiscoverCoach[];
  events?: DiscoverEvent[];
  cities: string[];
  /** The viewer's own city, which is what "near you" means for now. */
  myCity?: string | null;
  /** Coaches can post a community event; members read the board. */
  canPost?: boolean;
  backHref: string;
  hideBack?: boolean;
}) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"people" | "events">("people");
  const [coachesOnly, setCoachesOnly] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();
  // A tap on the board opens the thing as an overlay, so the board stays
  // behind it; the hrefs stay real for a new-tab click and for anyone the
  // link gets sent to. The href itself says which kind of thing it is.
  const [openEv, setOpenEv] = useState<string | null>(null);
  const [openCls, setOpenCls] = useState<{ handle: string; classId: string; iso?: string } | null>(
    null,
  );
  const openFromHref = (e: React.MouseEvent, href: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const asEvent = href.match(/^\/e\/([0-9a-f-]{36})$/i);
    if (asEvent) {
      e.preventDefault();
      setOpenEv(asEvent[1]);
      return;
    }
    const asClass = href.match(/^\/([a-z0-9-]+)\/([0-9a-f-]{36})(?:\?d=(\d{4}-\d{2}-\d{2}))?/i);
    if (asClass) {
      e.preventDefault();
      setOpenCls({ handle: asClass[1], classId: asClass[2], iso: asClass[3] });
    }
  };
  // Near you is the default view when it would show anything: someone opening
  // Discover is asking "who's around here", not "who is on fittlist".
  const nearCity = myCity && cities.includes(myCity) ? myCity : null;
  const [city, setCity] = useState<string | null>(nearCity);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return coaches.filter((c) => {
      if (coachesOnly && c.kind !== "coach") return false;
      if (city && c.location !== city) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        c.title.toLowerCase().includes(needle) ||
        c.location.toLowerCase().includes(needle)
      );
    });
  }, [coaches, q, city, coachesOnly]);

  const shownEvents = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter((e) => {
      if (city && e.city !== city) return false;
      if (!needle) return true;
      return (
        e.name.toLowerCase().includes(needle) ||
        e.sub.toLowerCase().includes(needle) ||
        e.by.toLowerCase().includes(needle)
      );
    });
  }, [events, q, city]);

  return (
    <>
      {/* No page title: the People/Events switch says where you are, and the
          word Discover was spending a headline on something the tab bar
          already said. Two lenses on the same directory: who's here, and
          what's coming up. */}
      <div className="seg disseg">
        <button className={view === "people" ? "sel" : ""} onClick={() => setView("people")}>
          People
        </button>
        <button className={view === "events" ? "sel" : ""} onClick={() => setView("events")}>
          Events
        </button>
      </div>
      <div className="dissearch">
        <Icon name="search" size={19} className="dissearch-ic" />
        <input
          className="dissearch-in"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          aria-label="Search"
        />
        {q && (
          <button type="button" className="dissearch-x" onClick={() => setQ("")} aria-label="Clear">
            <Icon name="close" size={17} />
          </button>
        )}
      </div>

      {/* Near you, then everywhere else. A row of city chips was fine at six
          cities and unreadable at sixty, so the long list moved into a picker
          and the one city that matters most got its own button. Coaches only
          lives here too now, as a chip: the title that used to hold it is
          gone, and a filter belongs with the filters. */}
      {(cities.length > 1 || (view === "people" && coaches.some((c) => c.kind !== "coach"))) && (
        <div className="disfilter">
          {cities.length > 1 && nearCity && (
            <button
              type="button"
              className={`disnear${city === nearCity ? " on" : ""}`}
              onClick={() => setCity(city === nearCity ? null : nearCity)}
            >
              <Icon name="place" size={17} /> Near you
            </button>
          )}
          {cities.length > 1 && (
            <div className="discitysel">
              <Icon name="expand_more" size={18} className="discitysel-ic" />
              <select
                className="discitysel-in"
                aria-label="Filter by city"
                value={city ?? ""}
                onChange={(e) => setCity(e.target.value || null)}
              >
                <option value="">All cities</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
          {view === "people" && coaches.some((c) => c.kind !== "coach") && (
            <button
              type="button"
              className={`dischip${coachesOnly ? " on" : ""}`}
              role="switch"
              aria-checked={coachesOnly}
              onClick={() => setCoachesOnly((v) => !v)}
            >
              Coaches only
            </button>
          )}
        </div>
      )}


      {/* Coaches seed the board; it shows above the empty state on purpose,
          because the empty board is exactly when posting matters most. */}
      {view === "events" && canPost && (
        <button className="evpost" onClick={() => setPostOpen(true)}>
          <Icon name="add" size={18} /> Post an event
        </button>
      )}

      {view === "events" ? (
        shownEvents.length === 0 ? (
          <div className="empty-block">
            <h2>{city && !q ? `Nothing coming up in ${city}` : "Nothing coming up"}</h2>
            <p>
              {q
                ? "Nothing matches that. Try another name, coach, or place."
                : "One-time classes and events land here as coaches post them."}
            </p>
            {city && !q && (
              <button className="btn ghost" onClick={() => setCity(null)}>
                Show all cities
              </button>
            )}
          </div>
        ) : (
          <div className="dislist dislist-bare">
            {shownEvents.map((e) =>
              e.photo ? (
                // A flyer makes it a card: the image the host already made
                // for Instagram carries the row, date tile riding its corner.
                <Link
                  key={e.id}
                  className="discard"
                  href={e.href}
                  onClick={(ev) => openFromHref(ev, e.href)}
                >
                  <span className="discard-imgwrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="discard-img" src={e.photo} alt="" />
                    <span className="disev-date discard-date" aria-hidden="true">
                      <span className="mo">{e.mon}</span>
                      <span className="dy">{e.day}</span>
                    </span>
                  </span>
                  <span className="discard-body">
                    <span className="nm">{e.name}</span>
                    <span className="sub">{e.sub}</span>
                    {e.by && <span className="wk">{e.by}</span>}
                  </span>
                </Link>
              ) : (
                // No flyer? Make one. A tinted card with the date riding the
                // corner, so the board reads as a wall of posters rather than
                // a calendar. The tint is picked by the event's id, so a card
                // keeps its colour for life.
                <Link
                  key={e.id}
                  className="disposter"
                  href={e.href}
                  style={{ background: posterTint(e.id) }}
                  onClick={(ev) => openFromHref(ev, e.href)}
                >
                  <span className="disev-date disposter-date" aria-hidden="true">
                    <span className="mo">{e.mon}</span>
                    <span className="dy">{e.day}</span>
                  </span>
                  <span className="disposter-nm">{e.name}</span>
                  <span className="disposter-sub">{e.sub}</span>
                  {e.by && <span className="disposter-by">{e.by}</span>}
                </Link>
              ),
            )}
          </div>
        )
      ) : shown.length === 0 ? (
        <div className="empty-block">
          <h2>{city && !q ? `Nobody in ${city} yet` : "Nobody here yet"}</h2>
          <p>
            {q
              ? "Nothing matches that. Try another name or city."
              : city
                ? "Nobody is listed there. Switch to All cities to see everyone."
                : "The list fills up as people join and coaches publish their schedules."}
          </p>
          {city && !q && (
            <button className="btn ghost" onClick={() => setCity(null)}>
              Show all cities
            </button>
          )}
        </div>
      ) : (
        <div className="dislist dislist-bare">
          {shown.map((c) => (
            <div key={c.id} className="disrow">
              <Link className="disrow-main" href={`/${c.handle}?from=discover`}>
                <span className="disrow-avwrap">
                  {c.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="disrow-av" src={c.photo} alt="" />
                  ) : (
                    <span
                      className="disrow-av disrow-av-empty"
                      style={{ background: c.color }}
                      aria-hidden="true"
                    >
                      {(c.name.trim().charAt(0) || "?").toUpperCase()}
                    </span>
                  )}
                  {c.availability && (
                    <span className={`avphotodot avphotodot-${c.availability}`} aria-hidden="true" />
                  )}
                </span>
                <span className="disrow-txt">
                  {/* The tag rides right beside the name; the Follow pill
                      is the row's corner control, pinned top-right. */}
                  <span className="disrow-nmline">
                    <span className="nm">{c.name}</span>
                    {c.kind === "coach" && <span className="kindtag kindtag-sm">Coach</span>}
                  </span>
                  {/* The tagline only. The city came off the line: the filter
                      above already speaks location, and the repeated city name
                      crowded out the taglines it sat beside. */}
                  <span className="sub">{c.title || `fittlist.co/${c.handle}`}</span>
                  {c.kind === "coach" && (
                    <span className="wk">
                      {c.classesThisWeek
                        ? `${c.classesThisWeek} ${c.classesThisWeek === 1 ? "class" : "classes"} this week`
                        : "No classes posted yet"}
                    </span>
                  )}
                </span>
                <LinkPending />
              </Link>
              <FollowMini handle={c.handle} following={c.following} requested={c.requested} />
            </div>
          ))}
        </div>
      )}

      {/* Coaches have the bottom nav; fans need a way back. */}
      {!hideBack && (
        <Link className="logoutbtn" href={backHref}>
          Back to your week
        </Link>
      )}

      <EventComposer open={postOpen} myCity={myCity} onClose={() => setPostOpen(false)} onDone={toast} />
      {openEv && <EventSheet id={openEv} onClose={() => setOpenEv(null)} />}
      {openCls && (
        <ClassSheet
          handle={openCls.handle}
          classId={openCls.classId}
          iso={openCls.iso}
          onClose={() => setOpenCls(null)}
        />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
