"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { useToast, Toast } from "@/components/Toast";

export type DiscoverCoach = {
  id: string;
  handle: string;
  name: string;
  photo: string | null;
  title: string;
  location: string;
  classesThisWeek: number;
  following: boolean;
  color: string;
};

// Search + city filter over the directory, with Follow inline on every row —
// finding someone and following them shouldn't take a round trip through their
// page.
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
  const [follows, setFollows] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(coaches.map((c) => [c.id, c.following])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

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

  const toggle = (c: DiscoverCoach) => {
    const next = !follows[c.id];
    setFollows((f) => ({ ...f, [c.id]: next })); // optimistic: the tap must feel instant
    setBusy(c.id);
    startTransition(async () => {
      const res = next ? await followTrainer(c.handle) : await unfollowTrainer(c.handle);
      setBusy(null);
      if (!res.ok) {
        setFollows((f) => ({ ...f, [c.id]: !next }));
        toast(res.error ?? "Something went wrong.");
        return;
      }
      toast(next ? `Following ${c.name.trim().split(/\s+/)[0]}` : "Unfollowed");
    });
  };

  return (
    <>
      <div className="dissearch">
        <Icon name="search" size={19} className="dissearch-ic" />
        <input
          className="dissearch-in"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search coaches"
          aria-label="Search coaches"
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
                <LinkPending />
              </Link>
              <button
                type="button"
                className={`disfollow${follows[c.id] ? " on" : ""}`}
                disabled={busy === c.id}
                onClick={() => toggle(c)}
              >
                {follows[c.id] ? "Following" : "Follow"}
              </button>
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
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
