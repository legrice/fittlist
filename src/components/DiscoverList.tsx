"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";

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

/** A place in the directory. Not followable: you follow a person, and a gym
 *  is not a person. Its page is where its week lives. */
export type DiscoverStudio = {
  id: string;
  slug: string;
  name: string;
  address: string;
  photo: string | null;
  types: string[];
  /** It runs its schedule here, so there's a week to see. */
  hasSchedule: boolean;
};

// Search over the directory, which has two halves: the people and the places.
// One search box and one filter on a single row, and the tab above decides
// what they're searching. The corner control follows from the row; the row's
// main job is still to get you to a person, and the Coach badge across from
// the name is what tells you who you're looking at, which is the distinction
// that matters once members can appear in a list.
export function DiscoverList({
  coaches,
  studios = [],
  cities,
  myCity = null,
  backHref,
  hideBack = false,
}: {
  coaches: DiscoverCoach[];
  studios?: DiscoverStudio[];
  cities: string[];
  /** The viewer's own city, which is what "near you" means for now. */
  myCity?: string | null;
  backHref: string;
  hideBack?: boolean;
}) {
  const [tab, setTab] = useState<"people" | "studios">("people");
  const [q, setQ] = useState("");
  const [coachesOnly, setCoachesOnly] = useState(false);
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

  // Studios have no city column, only a free-text address, so there is nothing
  // honest to filter them by yet. The address carries the town, and searching
  // it finds them.
  const shownStudios = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return studios;
    return studios.filter(
      (st) =>
        st.name.toLowerCase().includes(needle) ||
        st.address.toLowerCase().includes(needle) ||
        st.types.some((t) => t.toLowerCase().includes(needle)),
    );
  }, [studios, q]);

  return (
    <>
      {/* The page title, with the coaches-only switch directly across from
          it. Only when the list mixes kinds; all coaches leaves the switch
          nothing to do. */}
      <div className="calbar-title distitle">
        Discover
        {tab === "people" && coaches.some((c) => c.kind !== "coach") && (
          <button
            type="button"
            className="disonly"
            role="switch"
            aria-checked={coachesOnly}
            onClick={() => setCoachesOnly((v) => !v)}
          >
            View coaches only
            <span className={`switch${coachesOnly ? " on" : ""}`} aria-hidden="true">
              <span className="switch-knob" />
            </span>
          </button>
        )}
      </div>

      {/* The directory has two halves. A studio is a place rather than a
          person, so it isn't followable and doesn't mix into the same list:
          the tab says which one you're looking at, and the search box below
          says so too. */}
      <div className="seg disseg">
        <button className={tab === "people" ? "sel" : ""} onClick={() => setTab("people")}>
          People
        </button>
        <button className={tab === "studios" ? "sel" : ""} onClick={() => setTab("studios")}>
          Studios
        </button>
      </div>

      {/* One row: the box, and the filter across from it. Two rows of chrome
          above a list is most of a phone screen spent on controls. */}
      <div className="dissearchrow">
        <div className="dissearch">
          <Icon name="search" size={19} className="dissearch-ic" />
          <input
            className="dissearch-in"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === "people" ? "Search people" : "Search studios"}
            aria-label={tab === "people" ? "Search people" : "Search studios"}
          />
          {q && (
            <button
              type="button"
              className="dissearch-x"
              onClick={() => setQ("")}
              aria-label="Clear"
            >
              <Icon name="close" size={17} />
            </button>
          )}
        </div>
        {/* People carry a city; a studio carries a free-text address and
            nothing to group by yet, so the filter isn't offered there. It
            opens on your own city, which is what Discover is for. */}
        {tab === "people" && cities.length > 1 && (
          <div className={`discitysel${city ? " on" : ""}`}>
            <Icon name="place" size={17} className="discitysel-ic" />
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
      </div>

      {tab === "studios" ? (
        shownStudios.length === 0 ? (
          <div className="empty-block">
            <h2>{q ? "No studios match that" : "No studios yet"}</h2>
            <p>
              {q
                ? "Try another name or town."
                : "Studios arrive as coaches add the places they teach."}
            </p>
          </div>
        ) : (
          <div className="dislist dislist-bare">
            {shownStudios.map((st) => (
              <Link key={st.id} className="disrow disrow-studio" href={`/s/${st.slug}`}>
                <span className="disrow-avwrap">
                  {st.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="disrow-av disrow-av-sq" src={st.photo} alt="" />
                  ) : (
                    <span className="disrow-av disrow-av-sq disrow-av-place" aria-hidden="true">
                      <Icon name="place" size={20} />
                    </span>
                  )}
                </span>
                <span className="disrow-txt">
                  <span className="disrow-nmline">
                    <span className="nm">{st.name}</span>
                    {st.hasSchedule && <span className="kindtag kindtag-sm">Schedule</span>}
                  </span>
                  <span className="disrow-sub">{st.address}</span>
                </span>
                <span className="disrow-chev">
                  <Icon name="chevron_right" size={18} />
                </span>
              </Link>
            ))}
          </div>
        )
      ) : (
      <>


      {shown.length === 0 ? (
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
      </>
      )}

      {/* Coaches have the bottom nav; fans need a way back. */}
      {!hideBack && (
        <Link className="logoutbtn" href={backHref}>
          Back to your week
        </Link>
      )}
    </>
  );
}
