"use client";

import Link from "next/link";
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
// Every row is the directory's own row, not a copy: same badge, same
// availability dot, same corner Follow.

// The same floor the action holds. It lives twice because a "use server" file
// can only export async functions.
const MIN = 2;

export function SearchScreen() {
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<DirPerson[]>([]);
  const [studios, setStudios] = useState<DirStudio[]>([]);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState("");
  const box = useRef<HTMLInputElement>(null);
  // Each keystroke starts a request; only the newest one is allowed to write
  // its answer to the screen, or a slow "st" lands after "stacey" and the
  // results go backwards while you type.
  const run = useRef(0);

  useEffect(() => {
    box.current?.focus();
  }, []);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < MIN) {
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
      const res = await searchAll(needle);
      if (run.current !== mine) return;
      setPeople(res.people);
      setStudios(res.studios);
      setAsked(needle);
      setBusy(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const short = q.trim().length < MIN;
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
          />
          {q && (
            <button type="button" className="dissearch-x" onClick={() => setQ("")} aria-label="Clear">
              <Icon name="close" size={17} />
            </button>
          )}
        </div>
      </div>

      {short ? (
        <div className="empty-block">
          <h2>Search fittlist</h2>
          <p>
            Find a coach, a member or a studio by name. A city or a handle works
            too. To browse instead, Discover has the whole list.
          </p>
          <Link className="btn ghost" href="/discover">
            Open Discover
          </Link>
        </div>
      ) : nothing ? (
        <div className="empty-block">
          <h2>Nothing matches that</h2>
          <p>Try another name, a town, or the link somebody gave you.</p>
        </div>
      ) : (
        <>
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
        </>
      )}
    </>
  );
}
