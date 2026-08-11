"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { browseCoaches, searchCoaches } from "@/app/actions/search";
import { PersonRow, type DirPerson } from "@/components/DirectoryRows";
import { Icon } from "@/components/Icon";

// Two characters keeps a stray keystroke from asking for the directory.
// The server action holds the same floor.
const MIN = 2;
const RECENT_KEY = "fl-recent-searches";
const RECENT_MAX = 8;

type RecentHit = {
  t: "p";
  name: string;
  /** Person recents have always stored the handle in `base`. Keeping that
   *  shape means an older cached bundle can still read them after a rollback. */
  base: string;
};

function readRecents(): RecentHit[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    // Older search builds also stored studios. Search is coaches-only now, so
    // those entries quietly fall out rather than preserving a hidden studio
    // door in Recent.
    const recents: RecentHit[] = [];
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const stored = item as Record<string, unknown>;
      const base = stored.base ?? stored.handle;
      if (stored.t !== "p" || typeof stored.name !== "string" || typeof base !== "string") {
        continue;
      }
      recents.push({ t: "p", name: stored.name, base });
      if (recents.length === RECENT_MAX) break;
    }
    return recents;
  } catch {
    return [];
  }
}

function writeRecent(hit: RecentHit): RecentHit[] {
  const next = [hit, ...readRecents().filter((item) => item.base !== hit.base)].slice(
    0,
    RECENT_MAX,
  );
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private mode: search still works, it just is not remembered.
  }
  return next;
}

export function SearchScreen() {
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<DirPerson[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [asked, setAsked] = useState("");
  const [recent, setRecent] = useState<RecentHit[]>([]);
  const [browse, setBrowse] = useState<DirPerson[] | null>(null);
  const box = useRef<HTMLInputElement>(null);
  // Only the newest request may paint, or a slow short query can replace the
  // answer to the longer name somebody has already finished typing.
  const run = useRef(0);

  useEffect(() => {
    box.current?.focus();
    const timer = setTimeout(() => box.current?.focus(), 300);
    setRecent(readRecents());
    try {
      localStorage.removeItem("fl-recent-locations");
    } catch {
      // Nothing stored is a valid starting state.
    }
    let live = true;
    browseCoaches()
      .then((rows) => {
        if (live) setBrowse(rows);
      })
      .catch(() => {
        if (live) setBrowse([]);
      });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < MIN) {
      setPeople([]);
      setBusy(false);
      setFailed(false);
      setAsked("");
      run.current++;
      return;
    }
    const mine = ++run.current;
    setBusy(true);
    setFailed(false);
    const timer = setTimeout(async () => {
      try {
        const result = await searchCoaches(needle);
        if (run.current !== mine) return;
        setPeople(result);
        setAsked(needle);
      } catch {
        if (run.current !== mine) return;
        setPeople([]);
        setAsked(needle);
        setFailed(true);
      } finally {
        if (run.current === mine) setBusy(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [q]);

  const short = q.trim().length < MIN;
  const nothing = !short && !busy && asked === q.trim() && people.length === 0;

  const remember =
    (rows: DirPerson[]) => (event: MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor) return;
      const handle = (anchor.getAttribute("href") ?? "").match(/^\/([^/?]+)(?:\?|$)/)?.[1];
      const person = rows.find((row) => row.handle === handle);
      if (person) setRecent(writeRecent({ t: "p", name: person.name, base: person.handle }));
    };

  return (
    <>
      <div className="dissearchrow">
        <div className="dissearch">
          <Icon name="search" size={21} className="dissearch-ic" />
          <input
            ref={box}
            className="dissearch-in"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search coaches"
            aria-label="Search coaches"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          {q && (
            <button type="button" className="dissearch-x" onClick={() => setQ("")} aria-label="Clear">
              <Icon name="close" size={19} />
            </button>
          )}
        </div>
      </div>

      {short ? (
        <>
          {recent.length > 0 && (
            <div className="srchsec">
              <h2 className="srchhead">
                Recent
                <button
                  type="button"
                  className="srchclear"
                  onClick={() => {
                    setRecent([]);
                    try {
                      localStorage.removeItem(RECENT_KEY);
                    } catch {
                      // The visible state is already clear.
                    }
                  }}
                >
                  Clear
                </button>
              </h2>
              {recent.map((item) => (
                <Link key={item.base} className="recentrow" href={`/${item.base}?from=search`}>
                  <Icon name="account_circle" size={19} />
                  {item.name}
                </Link>
              ))}
            </div>
          )}
          <div className="srchsec" onClickCapture={remember(browse ?? [])}>
            <h2 className="srchhead">Coaches</h2>
            {!browse ? (
              <p className="peekempty">Looking around&hellip;</p>
            ) : browse.length ? (
              <div className="dislist dislist-bare">
                {browse.map((person) => (
                  <PersonRow key={person.id} person={person} from="search" kindTag={false} />
                ))}
              </div>
            ) : (
              <p className="peekempty">No coaches to show yet.</p>
            )}
          </div>
        </>
      ) : busy ? (
        <div className="empty-block" role="status" aria-live="polite">
          <p>Searching coaches&hellip;</p>
        </div>
      ) : failed ? (
        <div className="empty-block" role="status" aria-live="polite">
          <h2>Search is unavailable</h2>
          <p>Try again in a moment.</p>
        </div>
      ) : nothing ? (
        <div className="empty-block">
          <h2>No coaches match that</h2>
          <p>Try another name, location, specialty, or handle.</p>
        </div>
      ) : (
        <div className="srchsec" onClickCapture={remember(people)}>
          <h2 className="srchhead">
            Coaches <span>{people.length}</span>
          </h2>
          <div className="dislist dislist-bare">
            {people.map((person) => (
              <PersonRow key={person.id} person={person} from="search" kindTag={false} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
