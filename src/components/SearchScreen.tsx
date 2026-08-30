"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { searchDirectory, type SearchGroup } from "@/app/actions/search";
import { ClassResults } from "@/components/ClassResults";
import { PersonRow, StudioRow, type DirPerson, type DirStudio } from "@/components/DirectoryRows";
import { Icon } from "@/components/Icon";
import type { DirClass } from "@/lib/discoverclasses";
import { loadClientMemory, readClientMemory } from "@/lib/client-memory";

// Two characters keeps a stray keystroke from asking for the directory.
// The server action holds the same floor.
const MIN = 2;
const RECENT_KEY = "fl-recent-searches";
const RECENT_MAX = 8;
const RECENT_PREVIEW = 3;

type RecentHit = {
  t: "p" | "s" | "c" | "g";
  name: string;
  href: string;
};

type SearchAnswer = Awaited<ReturnType<typeof searchDirectory>>;

function recentKey(userId: string) {
  return `${RECENT_KEY}:${userId}`;
}

function readRecents(userId: string): RecentHit[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(recentKey(userId)) ?? "[]");
    if (!Array.isArray(value)) return [];
    // Older search builds also stored studios. Search is coaches-only now, so
    // those entries quietly fall out rather than preserving a hidden studio
    // door in Recent.
    const recents: RecentHit[] = [];
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const stored = item as Record<string, unknown>;
      const legacyBase = stored.base ?? stored.handle;
      const href = typeof stored.href === "string"
        ? stored.href
        : stored.t === "p" && typeof legacyBase === "string"
          ? `/${legacyBase}?from=search`
          : null;
      if (
        !["p", "s", "c", "g"].includes(String(stored.t)) ||
        typeof stored.name !== "string" ||
        !href
      ) {
        continue;
      }
      recents.push({ t: stored.t as RecentHit["t"], name: stored.name, href });
      if (recents.length === RECENT_MAX) break;
    }
    return recents;
  } catch {
    return [];
  }
}

function writeRecent(userId: string, hit: RecentHit): RecentHit[] {
  const next = [hit, ...readRecents(userId).filter((item) => item.href !== hit.href)].slice(
    0,
    RECENT_MAX,
  );
  try {
    localStorage.setItem(recentKey(userId), JSON.stringify(next));
  } catch {
    // Private mode: search still works, it just is not remembered.
  }
  return next;
}

export function SearchScreen({ todayIso, userId }: { todayIso: string; userId: string }) {
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<DirPerson[]>([]);
  const [studios, setStudios] = useState<DirStudio[]>([]);
  const [classes, setClasses] = useState<DirClass[]>([]);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [asked, setAsked] = useState("");
  const [recent, setRecent] = useState<RecentHit[]>([]);
  const [recentExpanded, setRecentExpanded] = useState(false);
  // Only the newest request may paint, or a slow short query can replace the
  // answer to the longer name somebody has already finished typing.
  const run = useRef(0);

  useEffect(() => {
    setRecent(readRecents(userId));
    try {
      localStorage.removeItem("fl-recent-locations");
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // Nothing stored is a valid starting state.
    }
  }, [userId]);

  useEffect(() => {
    const receive = (event: Event) => setQ((event as CustomEvent<string>).detail ?? "");
    window.addEventListener("fittlist:search-query", receive);
    return () => window.removeEventListener("fittlist:search-query", receive);
  }, []);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < MIN) {
      setPeople([]);
      setStudios([]);
      setClasses([]);
      setGroups([]);
      setBusy(false);
      setFailed(false);
      setAsked("");
      run.current++;
      return;
    }
    const mine = ++run.current;
    const cacheKey = `directory-search:${needle.toLocaleLowerCase()}`;
    const remembered = readClientMemory<SearchAnswer>(cacheKey);
    if (remembered) {
      setPeople(remembered.people);
      setStudios(remembered.studios);
      setClasses(remembered.classes);
      setGroups(remembered.groups);
      setAsked(needle);
    }
    setBusy(!remembered);
    setFailed(false);
    const timer = setTimeout(async () => {
      try {
        const result = await loadClientMemory(cacheKey, () => searchDirectory(needle));
        if (!result) throw new Error("Search returned no result");
        if (run.current !== mine) return;
        setPeople(result.people);
        setStudios(result.studios);
        setClasses(result.classes);
        setGroups(result.groups);
        setAsked(needle);
      } catch {
        if (run.current !== mine) return;
        // A remembered answer stays useful if the quiet refresh fails. Only a
        // first visit needs to replace the screen with an error state.
        if (!remembered) {
          setPeople([]);
          setStudios([]);
          setClasses([]);
          setGroups([]);
          setAsked(needle);
          setFailed(true);
        }
      } finally {
        if (run.current === mine) setBusy(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [q]);

  const short = q.trim().length < MIN;
  const nothing = !short && !busy && asked === q.trim() && people.length + studios.length + classes.length + groups.length === 0;

  const rememberPerson =
    (rows: DirPerson[]) => (event: MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor) return;
      const handle = (anchor.getAttribute("href") ?? "").match(/^\/([^/?]+)(?:\?|$)/)?.[1];
      const person = rows.find((row) => row.handle === handle);
      if (person) setRecent(writeRecent(userId, { t: "p", name: person.name, href: `/${person.handle}?from=search` }));
    };

  const rememberStudio =
    (rows: DirStudio[]) => (event: MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement).closest("a");
      const href = anchor?.getAttribute("href") ?? "";
      const studio = rows.find((row) => href.startsWith(`/s/${row.slug}`));
      if (studio) setRecent(writeRecent(userId, { t: "s", name: studio.name, href: `/s/${studio.slug}?from=search` }));
    };

  const rememberClass = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href") ?? "";
    const cls = classes.find((row) => href.includes(`/${row.classId}?`));
    if (cls) setRecent(writeRecent(userId, { t: "c", name: cls.name, href }));
  };

  const rememberGroup = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href") ?? "";
    const group = groups.find((row) => href.startsWith(`/g/${row.slug}`));
    if (group) setRecent(writeRecent(userId, { t: "g", name: group.name, href: `/g/${group.slug}?from=search` }));
  };

  return (
    <>
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
                      localStorage.removeItem(recentKey(userId));
                    } catch {
                      // The visible state is already clear.
                    }
                  }}
                >
                  Clear
                </button>
              </h2>
              {recent.slice(0, recentExpanded ? RECENT_MAX : RECENT_PREVIEW).map((item) => (
                <Link key={item.href} className="recentrow" href={item.href}>
                  <Icon name={item.t === "p" ? "account_circle" : item.t === "s" ? "place" : item.t === "g" ? "groups" : "activity"} size={19} />
                  {item.name}
                </Link>
              ))}
              {recent.length > RECENT_PREVIEW && (
                <button
                  type="button"
                  className="recent-more"
                  onClick={() => setRecentExpanded((open) => !open)}
                  aria-expanded={recentExpanded}
                >
                  {recentExpanded ? "See less" : "See more"}
                </button>
              )}
            </div>
          )}
        </>
      ) : busy ? (
        <div className="empty-block" role="status" aria-live="polite">
          <p>Searching&hellip;</p>
        </div>
      ) : failed ? (
        <div className="empty-block" role="status" aria-live="polite">
          <h2>Search is unavailable</h2>
          <p>Try again in a moment.</p>
        </div>
      ) : nothing ? (
        <div className="empty-block">
          <h2>No results for that</h2>
          <p>Try another person, class, studio, or group name.</p>
        </div>
      ) : (
        <div>
          {studios.length > 0 && (
            <div className="srchsec" onClickCapture={rememberStudio(studios)}>
              <h2 className="srchhead">Gyms &amp; studios <span>{studios.length}</span></h2>
              <div className="dislist dislist-bare">
                {studios.map((studio) => <StudioRow key={studio.id} studio={studio} from="search" />)}
              </div>
            </div>
          )}
          {people.length > 0 && (
            <div className="srchsec" onClickCapture={rememberPerson(people)}>
              <h2 className="srchhead">People <span>{people.length}</span></h2>
              <div className="dislist dislist-bare">
                {people.map((person) => (
                  <PersonRow key={person.id} person={person} from="search" />
                ))}
              </div>
            </div>
          )}
          {classes.length > 0 && (
            <div className="srchsec" onClickCapture={rememberClass}>
              <h2 className="srchhead">Classes <span>{classes.length}</span></h2>
              <ClassResults classes={classes} todayIso={todayIso} from="search" />
            </div>
          )}
          {groups.length > 0 && (
            <div className="srchsec" onClickCapture={rememberGroup}>
              <h2 className="srchhead">Groups <span>{groups.length}</span></h2>
              <div className="search-group-list">
                {groups.map((group) => (
                  <Link className="search-group-row" href={`/g/${group.slug}?from=search`} key={group.id}>
                    {group.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={group.photo} alt="" />
                    ) : (
                      <span><Icon name="groups" size={22} /></span>
                    )}
                    <span><strong>{group.name}</strong>{group.description && <small>{group.description}</small>}</span>
                    <Icon name="chevron_right" size={19} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
