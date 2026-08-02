"use client";

import { useEffect, useRef, useState } from "react";
import { searchAll } from "@/app/actions/search";
import { PersonRow, StudioRow, type DirPerson, type DirStudio } from "@/components/DirectoryRows";
import { Icon } from "@/components/Icon";

// One box, both halves of the directory underneath it.
//
// Discover is a segment: you are looking at people, or you are looking at
// studios, and the box searches whichever one you picked. That is right for
// browsing and wrong for searching, because you don't know which half the
// thing you're after is in. Type "Stacey" and you want Stacey, and Stacey's
// gym, on the same screen, told apart by a heading. So there is no segment
// here, and the two sections only appear when they have something in them.
//
// Under the box, a place. Its own field rather than words in the box, because
// "yoga in Montclair" is two questions sharing a string and neither matches
// anything whole. A location alone is a real search too: "who's here" is the
// question most worth asking in a new town.
//
// Every row is the directory's own row, not a copy: same badge, same
// availability dot, same corner Follow.

// The same floor the action holds. It lives twice because a "use server" file
// can only export async functions.
const MIN = 2;

// What you asked before, on this device and nowhere else. A question is only
// remembered once it worked: tapping a result is what writes it down, so the
// list holds names that led somewhere rather than every half-typed guess.
// Places keep their own list, with a pin, and tapping one fills the place
// field: a town you searched once is a town you'll search again.
const RECENT_KEY = "fl-recent-searches";
const RECENT_LOC_KEY = "fl-recent-locations";
const RECENT_MAX = 8;

function readList(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function writeList(key: string, needle: string): string[] {
  const next = [
    needle,
    ...readList(key).filter((r) => r.toLowerCase() !== needle.toLowerCase()),
  ].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Private mode: the search still works, it just isn't remembered.
  }
  return next;
}

export function SearchScreen() {
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("");
  const [people, setPeople] = useState<DirPerson[]>([]);
  const [studios, setStudios] = useState<DirStudio[]>([]);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [recentLoc, setRecentLoc] = useState<string[]>([]);
  const box = useRef<HTMLInputElement>(null);
  // Each keystroke starts a request; only the newest one is allowed to write
  // its answer to the screen, or a slow "st" lands after "stacey" and the
  // results go backwards while you type.
  const run = useRef(0);

  // The caret is already in the box on arrival: the door on Discover is drawn
  // as this field, so landing here should feel like tapping into it, not like
  // a page with a second tap owed. Once on mount and once a beat later,
  // because the tab transition can steal the first focus back.
  useEffect(() => {
    box.current?.focus();
    const t = setTimeout(() => box.current?.focus(), 300);
    setRecent(readList(RECENT_KEY));
    setRecentLoc(readList(RECENT_LOC_KEY));
    return () => clearTimeout(t);
  }, []);

  const remember = () => {
    if (asked.trim().length >= MIN) setRecent(writeList(RECENT_KEY, asked.trim()));
    if (loc.trim().length >= MIN) setRecentLoc(writeList(RECENT_LOC_KEY, loc.trim()));
  };

  useEffect(() => {
    const needle = q.trim();
    const place = loc.trim();
    if (needle.length < MIN && place.length < MIN) {
      setPeople([]);
      setStudios([]);
      setBusy(false);
      setAsked("");
      run.current++;
      return;
    }
    const mine = ++run.current;
    setBusy(true);
    // Long enough that typing a name is one request rather than six.
    const t = setTimeout(async () => {
      const res = await searchAll(needle, place);
      if (run.current !== mine) return;
      setPeople(res.people);
      setStudios(res.studios);
      setAsked(needle);
      setBusy(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q, loc]);

  const short = q.trim().length < MIN && loc.trim().length < MIN;
  const nothing = !short && !busy && asked === q.trim() && !people.length && !studios.length;

  return (
    <>
      <div className="dissearchrow">
        <div className="dissearch">
          <Icon name="search" size={19} className="dissearch-ic" />
          <input
            ref={box}
            className="dissearch-in"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Coaches, members, studios"
            aria-label="Search fittlist"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          {q && (
            <button type="button" className="dissearch-x" onClick={() => setQ("")} aria-label="Clear">
              <Icon name="close" size={17} />
            </button>
          )}
        </div>
      </div>
      <div className="dissearchrow srchlocrow">
        <div className="dissearch">
          <Icon name="place" size={19} className="dissearch-ic" />
          <input
            className="dissearch-in"
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
            placeholder="Location"
            aria-label="Filter by location"
          />
          {loc && (
            <button
              type="button"
              className="dissearch-x"
              onClick={() => setLoc("")}
              aria-label="Clear location"
            >
              <Icon name="close" size={17} />
            </button>
          )}
        </div>
      </div>

      {short ? (
        recent.length > 0 || recentLoc.length > 0 ? (
          <div className="srchsec">
            <h2 className="srchhead">
              Recent
              <button
                type="button"
                className="srchclear"
                onClick={() => {
                  setRecent([]);
                  setRecentLoc([]);
                  try {
                    localStorage.removeItem(RECENT_KEY);
                    localStorage.removeItem(RECENT_LOC_KEY);
                  } catch {
                    // Nothing to clear is the state they asked for anyway.
                  }
                }}
              >
                Clear
              </button>
            </h2>
            {recent.map((r) => (
              <button key={r} type="button" className="recentrow" onClick={() => setQ(r)}>
                <Icon name="search" size={17} />
                {r}
              </button>
            ))}
            {recentLoc.map((r) => (
              <button key={`loc-${r}`} type="button" className="recentrow" onClick={() => setLoc(r)}>
                <Icon name="place" size={17} />
                {r}
              </button>
            ))}
          </div>
        ) : (
          // No door back to Discover: the way in is Discover's own box now,
          // so offering to open it from here is a circle.
          <div className="empty-block">
            <h2>Search fittlist</h2>
            <p>Find a coach, a member or a studio by name. A city or a handle works too.</p>
          </div>
        )
      ) : nothing ? (
        <div className="empty-block">
          <h2>Nothing matches that</h2>
          <p>Try another name, a town, or the link somebody gave you.</p>
        </div>
      ) : (
        // A tap on any result is what writes the question down: it led
        // somewhere, so it earned a place in Recent.
        <div onClickCapture={(e) => { if ((e.target as HTMLElement).closest("a")) remember(); }}>
          {people.length > 0 && (
            <div className="srchsec">
              <h2 className="srchhead">
                People <span>{people.length}</span>
              </h2>
              <div className="dislist dislist-bare">
                {people.map((p) => (
                  <PersonRow key={p.id} person={p} from="search" />
                ))}
              </div>
            </div>
          )}
          {studios.length > 0 && (
            <div className="srchsec">
              <h2 className="srchhead">
                Studios <span>{studios.length}</span>
              </h2>
              <div className="dislist dislist-bare">
                {studios.map((st) => (
                  <StudioRow key={st.id} studio={st} from="search" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
