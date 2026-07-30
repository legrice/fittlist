"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";

export type DiscoverCoach = {
  id: string;
  handle: string;
  name: string;
  photo: string | null;
  title: string;
  location: string;
  classesThisWeek: number;
  /** Display only: the green check that says "you already follow them".
   *  The follow itself lives on the profile. */
  following: boolean;
  color: string;
};

// Search + city filter over the directory. Following happens on the profile,
// not here: the row's one job is to get you to a person, and the Coach badge
// across from the name is what tells you who you're looking at, which is the
// distinction that matters once members can appear in a list.
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
  // Near you is the default view when it would show anything: someone opening
  // Discover is asking "who's around here", not "who is on fittlist".
  const nearCity = myCity && cities.includes(myCity) ? myCity : null;
  const [city, setCity] = useState<string | null>(nearCity);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return coaches.filter((c) => {
      if (city && c.location !== city) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        c.title.toLowerCase().includes(needle) ||
        c.location.toLowerCase().includes(needle)
      );
    });
  }, [coaches, q, city]);

  return (
    <>
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
          <h2>{city && !q ? `Nobody in ${city} yet` : "No coaches yet"}</h2>
          <p>
            {q
              ? "Nothing matches that. Try another name or city."
              : city
                ? "Nobody has published a schedule there. Switch to All cities to see everyone."
                : "The directory fills up as coaches publish their schedules."}
          </p>
          {city && !q && (
            <button className="btn ghost" onClick={() => setCity(null)}>
              Show all cities
            </button>
          )}
        </div>
      ) : (
        <div className="dislist">
          {shown.map((c) => (
            <div key={c.id} className="disrow">
              <Link className="disrow-main" href={`/${c.handle}?from=discover`}>
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
                <span className="disrow-txt">
                  <span className="nm">{c.name}</span>
                  <span className="sub">
                    {[c.title, c.location].filter(Boolean).join(" · ") || `fittlist.co/${c.handle}`}
                  </span>
                  <span className="wk">
                    {c.classesThisWeek
                      ? `${c.classesThisWeek} ${c.classesThisWeek === 1 ? "class" : "classes"} this week`
                      : "No classes posted yet"}
                  </span>
                </span>
                <span className="disrow-right">
                  <span className="kindtag">Coach</span>
                  {c.following && (
                    <span className="disrow-fol" aria-label="Following" title="Following">
                      <Icon name="check" size={13} />
                    </span>
                  )}
                </span>
                <LinkPending />
              </Link>
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
