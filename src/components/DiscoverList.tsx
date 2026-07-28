"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { Icon } from "@/components/Icon";
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
  backHref,
  hideBack = false,
}: {
  coaches: DiscoverCoach[];
  cities: string[];
  backHref: string;
  hideBack?: boolean;
}) {
  const [q, setQ] = useState("");
  const [city, setCity] = useState<string | null>(null);
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

      {cities.length > 1 && (
        <div className="discities">
          <button
            type="button"
            className={`discity${city === null ? " on" : ""}`}
            onClick={() => setCity(null)}
          >
            All cities
          </button>
          {cities.map((c) => (
            <button
              key={c}
              type="button"
              className={`discity${city === c ? " on" : ""}`}
              onClick={() => setCity(city === c ? null : c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty-block">
          <h2>No coaches yet</h2>
          <p>
            {q || city
              ? "Nothing matches that. Try another name or city."
              : "The directory fills up as coaches publish their schedules."}
          </p>
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
