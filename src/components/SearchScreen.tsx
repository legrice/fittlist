"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { searchAll, searchBrowse } from "@/app/actions/search";
import { PersonRow, StudioRow, type DirPerson, type DirStudio } from "@/components/DirectoryRows";
import { ClassResults } from "@/components/ClassResults";
import { useBandTop } from "@/components/CalendarBits";
import type { DirClass } from "@/lib/discoverclasses";
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
// Every row is the directory's own row, not a copy: same badge, same
// availability dot, same corner Follow.

// The same floor the action holds. It lives twice because a "use server" file
// can only export async functions.
const MIN = 2;

// What you found before, on this device and nowhere else. Recent holds the
// rows you tapped, not the strings you typed: "iron" was only ever a way of
// reaching Ironbound, and offering the half-typed guess back is offering the
// work instead of the answer. Each entry is the place or person itself, and
// tapping it goes straight there.
const RECENT_KEY = "fl-recent-searches";
const RECENT_MAX = 8;

type RecentHit = {
  /** Person or studio: which icon the row wears. */
  t: "p" | "s";
  name: string;
  /** The URL base: a handle, or `s/{slug}` for a place. */
  base: string;
};

function readRecents(): RecentHit[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(v)) return [];
    // Older entries were plain strings (the typed query); they don't lead
    // anywhere on their own, so they just fall out here.
    return v
      .filter(
        (x): x is RecentHit =>
          !!x &&
          typeof x === "object" &&
          (x.t === "p" || x.t === "s") &&
          typeof x.name === "string" &&
          typeof x.base === "string",
      )
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function writeRecent(hit: RecentHit): RecentHit[] {
  const next = [hit, ...readRecents().filter((r) => r.base !== hit.base)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private mode: the search still works, it just isn't remembered.
  }
  return next;
}

export function SearchScreen({ todayIso }: { todayIso: string }) {
  // The classes draw the app's day bands, and they pin under the header.
  // Every list that wears .callist has to say where that is or it guesses.
  useBandTop();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<DirPerson[]>([]);
  const [studios, setStudios] = useState<DirStudio[]>([]);
  const [classes, setClasses] = useState<DirClass[]>([]);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState("");
  const [recent, setRecent] = useState<RecentHit[]>([]);
  // The idle screen's Nearby lists, behind the People / Studios / Classes
  // segment: the box is for a question, and before one is typed the screen
  // browses, by Matt's call. Loaded once on arrival.
  const [near, setNear] = useState<{
    people: DirPerson[];
    studios: DirStudio[];
    classes: DirClass[];
  } | null>(null);
  const [nearSeg, setNearSeg] = useState<"people" | "studios" | "classes">("people");
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
    setRecent(readRecents());
    searchBrowse().then(setNear);
    try {
      // The place field is gone for now, and its recents with it.
      localStorage.removeItem("fl-recent-locations");
    } catch {
      // Nothing stored is fine.
    }
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < MIN) {
      setPeople([]);
      setStudios([]);
      setClasses([]);
      setBusy(false);
      setAsked("");
      run.current++;
      return;
    }
    const mine = ++run.current;
    setBusy(true);
    // Long enough that typing a name is one request rather than six.
    const t = setTimeout(async () => {
      const res = await searchAll(needle, "");
      if (run.current !== mine) return;
      setPeople(res.people);
      setStudios(res.studios);
      setClasses(res.classes);
      setAsked(needle);
      setBusy(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const short = q.trim().length < MIN;
  const nothing =
    !short && !busy && asked === q.trim() && !people.length && !studios.length && !classes.length;

  // A tap on any row is what writes Recent: not the string in the box, the
  // row it led to. The anchor's own href says which one, and the browse
  // lists remember the same way the results do.
  const remember =
    (ppl: DirPerson[], sts: DirStudio[]) => (e: MouseEvent<HTMLDivElement>) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a) return;
      const m = (a.getAttribute("href") ?? "").match(/^\/(s\/[^/?]+|[^/?]+)(?:\?|$)/);
      if (!m) return;
      const base = m[1];
      if (base.startsWith("s/")) {
        const st = sts.find((x) => `s/${x.slug}` === base);
        if (st) setRecent(writeRecent({ t: "s", name: st.name, base }));
      } else {
        const p = ppl.find((x) => x.handle === base);
        if (p) setRecent(writeRecent({ t: "p", name: p.name, base }));
      }
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
            onChange={(e) => setQ(e.target.value)}
            // The same words as Discover's door: the door and this field
            // have to agree or they are two doors, and the idle screen now
            // browses all three kinds under the Nearby segment.
            placeholder="Search coaches, classes, studios"
            aria-label="Search fittlist"
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
        // Nothing typed yet: what you found before, then the neighborhood.
        // Recent first because it is yours; Nearby below it as a triple
        // segment (People, Studios, Classes) with that kind's list under
        // it, by Matt's call, so the screen browses before it is asked
        // anything.
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
                      // Nothing to clear is the state they asked for anyway.
                    }
                  }}
                >
                  Clear
                </button>
              </h2>
              {recent.map((r) => (
                <Link key={r.base} className="recentrow" href={`/${r.base}?from=search`}>
                  <Icon name={r.t === "s" ? "place" : "account_circle"} size={19} />
                  {r.name}
                </Link>
              ))}
            </div>
          )}
          <div
            className="srchsec"
            onClickCapture={remember(near?.people ?? [], near?.studios ?? [])}
          >
            <h2 className="srchhead">Nearby</h2>
            <div className="modetoggle srchseg">
              <button
                type="button"
                className={nearSeg === "people" ? "sel" : ""}
                onClick={() => setNearSeg("people")}
              >
                People
              </button>
              <button
                type="button"
                className={nearSeg === "studios" ? "sel" : ""}
                onClick={() => setNearSeg("studios")}
              >
                Studios
              </button>
              <button
                type="button"
                className={nearSeg === "classes" ? "sel" : ""}
                onClick={() => setNearSeg("classes")}
              >
                Classes
              </button>
            </div>
            {!near ? (
              <p className="peekempty">Looking around&hellip;</p>
            ) : nearSeg === "people" ? (
              near.people.length ? (
                <div className="dislist dislist-bare">
                  {near.people.map((p) => (
                    <PersonRow key={p.id} person={p} from="search" />
                  ))}
                </div>
              ) : (
                <p className="peekempty">Nobody listed near you yet.</p>
              )
            ) : nearSeg === "studios" ? (
              near.studios.length ? (
                <div className="dislist dislist-bare">
                  {near.studios.map((st) => (
                    <StudioRow key={st.id} studio={st} from="search" />
                  ))}
                </div>
              ) : (
                <p className="peekempty">No studios listed yet.</p>
              )
            ) : near.classes.length ? (
              <ClassResults classes={near.classes} todayIso={todayIso} from="search" />
            ) : (
              <p className="peekempty">Nothing listed for the next couple of weeks yet.</p>
            )}
          </div>
        </>
      ) : nothing ? (
        <div className="empty-block">
          <h2>Nothing matches that</h2>
          <p>Try another name, a town, or the link somebody gave you.</p>
        </div>
      ) : (
        <div onClickCapture={remember(people, studios)}>
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
          {/* The classes last, because the first two answer "who" and "where"
              and this one answers "what is on". A heading only exists when
              its section has something in it, the same as the other two: a
              search that finds only classes says Classes once and nothing
              about people. */}
          {classes.length > 0 && (
            <div className="srchsec">
              <h2 className="srchhead">
                Classes <span>{classes.length}</span>
              </h2>
              <ClassResults classes={classes} todayIso={todayIso} from="search" />
            </div>
          )}
        </div>
      )}
    </>
  );
}
