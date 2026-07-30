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
  const [pending, start] = useTransition();
  const tap = () =>
    start(async () => {
      if (state === "off") {
        const res = await followTrainer(handle);
        if (res.ok) setState(res.requested ? "asked" : "on");
      } else {
        const res = await unfollowTrainer(handle);
        if (res.ok) setState("off");
      }
    });
  return (
    <button
      className={`disfol${state === "on" ? " on" : ""}`}
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
  cities,
  myCity = null,
  backHref,
  hideBack = false,
}: {
  coaches: DiscoverCoach[];
  cities: string[];
  /** The viewer's own city, which is what "near you" means for now. */
  myCity?: string | null;
  backHref: string;
  hideBack?: boolean;
}) {
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

  return (
    <>
      {/* The page title, with the coaches-only switch directly across from
          it. Only when the list mixes kinds; all coaches leaves the switch
          nothing to do. */}
      <div className="calbar-title distitle">
        Discover
        {coaches.some((c) => c.kind !== "coach") && (
          <button
            type="button"
            className="disonly"
            role="switch"
            aria-checked={coachesOnly}
            onClick={() => setCoachesOnly((v) => !v)}
          >
            Search coaches only
            <span className={`switch${coachesOnly ? " on" : ""}`} aria-hidden="true">
              <span className="switch-knob" />
            </span>
          </button>
        )}
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
          and the one city that matters most got its own button. */}
      {cities.length > 1 && (
        <div className="disfilter">
          {nearCity && (
            <button
              type="button"
              className={`disnear${city === nearCity ? " on" : ""}`}
              onClick={() => setCity(city === nearCity ? null : nearCity)}
            >
              <Icon name="place" size={17} /> Near you
            </button>
          )}
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
        </div>
      )}


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
                  <span className="sub">
                    {[c.title, c.location].filter(Boolean).join(" · ") || `fittlist.co/${c.handle}`}
                  </span>
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
    </>
  );
}
