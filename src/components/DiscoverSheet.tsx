"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { discoverPeople, type DiscoverData } from "@/app/actions/discover";
import { searchDirectory, type SearchGroup } from "@/app/actions/search";
import { PersonRow, StudioRow, type DirPerson, type DirStudio } from "@/components/DirectoryRows";
import { DiscoverList } from "@/components/DiscoverList";
import { Icon } from "@/components/Icon";
import { initials } from "@/components/WeekView";
import {
  invalidateClientMemory,
  invalidateClientMemoryPrefix,
  loadClientMemory,
  readClientMemory,
} from "@/lib/client-memory";

// The same floor /search holds; it lives in three files because a
// "use server" module can only export async functions.
const MIN = 2;
const DISCOVER_PEOPLE_MEMORY_KEY = "sheet:discover:people";
const DIRECTORY_SEARCH_MEMORY_PREFIX = "directory-search:";
const SHARE_PEOPLE_MEMORY_KEY = "sheet:share:people";
type DiscoverSearchData = Awaited<ReturnType<typeof searchDirectory>>;

/**
 * The directory, pulled up over Following.
 *
 * Finding somebody is the one act this screen offers, and it is the same kind
 * of act adding a class is on the calendar: a thing you do to the week in
 * front of you rather than somewhere else you go. So it wears the adder's
 * furniture exactly, a full-height sheet sliding up with its title and its
 * close in the corner, and it comes back down onto the list you were reading
 * instead of onto a back button and a page transition.
 *
 * The box is a live search now, not a door: tapping /search from inside a
 * sheet was a page navigation wearing a field's clothes, and the caret never
 * made it to the far side on a phone. Tap, type, and the three sections
 * (people, studios, classes) replace the browse list while there is text;
 * clearing the box brings the coaches back. The input is 16px exactly, or
 * iOS zooms the whole page into the field on focus.
 *
 * The rows load on open rather than riding along with the week. The whole
 * directory is a lot to send to a device on the chance somebody taps a
 * button, and this way Following costs what Following costs.
 */
export function DiscoverSheet({ onClose, full = false }: { onClose: () => void; full?: boolean }) {
  const [data, setData] = useState<DiscoverData | null>(() =>
    readClientMemory<DiscoverData>(DISCOVER_PEOPLE_MEMORY_KEY),
  );
  const [dataFailed, setDataFailed] = useState(false);
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<DirPerson[]>([]);
  const [studios, setStudios] = useState<DirStudio[]>([]);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [asked, setAsked] = useState("");
  // Only the newest request may paint, or a slow "st" lands after "stacey"
  // and the results go backwards while you type.
  const run = useRef(0);
  // Portaled to the body (see InviteFriends): the header's magnifier renders
  // this from inside the sticky brandbar, and sticky makes a stacking
  // context in every mobile browser, so left in place the sheet's z-46
  // painted under the content card that slides over the header.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let live = true;
    void loadClientMemory(DISCOVER_PEOPLE_MEMORY_KEY, discoverPeople)
      .then((next) => {
        if (live && next !== null) {
          setData(next);
          setDataFailed(false);
        }
      })
      .catch(() => {
        // A stale value remains useful; without one, keep the existing loader.
        if (live && data === null) setDataFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < MIN) {
      setPeople([]);
      setStudios([]);
      setGroups([]);
      setBusy(false);
      setFailed(false);
      setAsked("");
      run.current++;
      return;
    }
    const mine = ++run.current;
    const key = `${DIRECTORY_SEARCH_MEMORY_PREFIX}${needle.toLocaleLowerCase()}`;
    const cached = readClientMemory<DiscoverSearchData>(key);
    if (cached) {
      setPeople(cached.people);
      setStudios(cached.studios);
      setGroups(cached.groups);
      setAsked(needle);
      setBusy(false);
    } else {
      setBusy(true);
    }
    setFailed(false);
    const t = setTimeout(async () => {
      try {
        const res = await loadClientMemory<DiscoverSearchData>(key, () => searchDirectory(needle));
        if (run.current !== mine || res === null) return;
        setPeople(res.people);
        setStudios(res.studios);
        setGroups(res.groups);
        setAsked(needle);
      } catch {
        // Do not turn a failed request into an empty result or discard cache.
        if (run.current === mine && !cached) {
          setPeople([]);
          setStudios([]);
          setGroups([]);
          setAsked(needle);
          setFailed(true);
        }
      } finally {
        if (run.current === mine) setBusy(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  if (!mounted) return null;
  const searching = q.trim().length >= MIN;
  const nothing =
    searching && !busy && !failed && asked === q.trim() && !people.length && !studios.length && !groups.length;

  if (full) return createPortal(
    <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="sheet sheet-full dissheet discover-full-sheet" role="dialog" aria-modal="true" aria-labelledby="discover-sheet-title">
        <div className="adderhead">
          <h2 id="discover-sheet-title">Discover</h2>
          <button className="iconbtn sheetclose adderclose sheet-dismiss" aria-label="Close" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        {data ? <DiscoverList people={data.people} studios={[]} cities={data.cities} myCity={data.myCity} myLat={data.myLat} myLng={data.myLng} groups={[]} upcoming={[]} backHref="/calendar" hideBack /> : <p className="dissheet-wait">Loading Discover…</p>}
      </section>
    </div>,
    document.body,
  );

  return createPortal(
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet sheet-full dissheet">
        <div className="adderhead">
          <h2>Find profiles</h2>
          <button className="iconbtn sheetclose adderclose sheet-dismiss" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="dissearchrow">
          <div className="dissearch">
            <Icon name="search" size={21} className="dissearch-ic" />
            <input
              className="dissearch-in"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people, studios, or groups"
              aria-label="Search fittlist"
              autoComplete="off"
            />
            {q && (
              <button
                type="button"
                className="dissearch-x"
                onClick={() => setQ("")}
                aria-label="Clear"
              >
                <Icon name="close" size={19} />
              </button>
            )}
          </div>
        </div>
        {searching ? (
          failed ? (
            <div className="empty-block">
              <h2>Couldn&rsquo;t search right now</h2>
              <p>Try that search again in a moment.</p>
            </div>
          ) : nothing ? (
            <div className="empty-block">
              <h2>Nothing matches that</h2>
              <p>Try another name, a town, or the link somebody gave you.</p>
            </div>
          ) : (
            // The classes' day bands pin inside the sheet's own scroller, so
            // their top is the sheet's, not whatever chrome the page beneath
            // published.
            <div style={{ "--dayband-top": "0px" } as React.CSSProperties}>
              {people.length > 0 && (
                <div className="srchsec">
                  <h2 className="srchhead">
                    Coaches <span>{people.length}</span>
                  </h2>
                  <div className="dislist dislist-bare">
                    {people.map((p) => (
                      <PersonRow key={p.id} person={p} from="following" follow calendarLanguage />
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
                      <StudioRow key={st.id} studio={st} from="following" />
                    ))}
                  </div>
                </div>
              )}
              {groups.length > 0 && (
                <div className="srchsec">
                  <h2 className="srchhead">
                    Groups <span>{groups.length}</span>
                  </h2>
                  <div className="dislist dislist-bare">
                    {groups.map((group) => (
                      <Link className="disrow disrow-studio" href={`/g/${group.slug}?from=following`} key={group.id}>
                        <span className="disrow-avwrap">
                          {group.photo ? <img className="disrow-av" src={group.photo} alt="" loading="lazy" decoding="async" /> : (
                            <span className="disrow-av disrow-av-empty" aria-hidden="true">
                              {initials(group.name)}
                            </span>
                          )}
                        </span>
                        <span className="disrow-txt">
                          <span className="disrow-nmline"><span className="nm">{group.name}</span></span>
                          <span className="disrow-sub">{group.description || "Fitness group"}</span>
                        </span>
                        <span className="disrow-chev"><Icon name="chevron_right" size={20} /></span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        ) : data ? (
          <>
            <p className="whoseg-sub">
              Save useful calendars here. You can also save individual classes to your schedule.
            </p>
            <div className="nearlist">
              {data.people.map((p) => (
                  <PeopleRow key={p.id} p={p} />
                ))}
              {data.people.length === 0 && (
                <p className="dissheet-wait">No coaches listed near you yet.</p>
              )}
            </div>
          </>
        ) : dataFailed ? (
          <p className="dissheet-wait">Couldn&rsquo;t load coaches. Try again in a moment.</p>
        ) : (
          // Nothing dramatic while it loads: the sheet is already up and the
          // list is the only thing in it, so a spinner would be a second
          // thing on a screen with one.
          <p className="dissheet-wait">Loading coaches…</p>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** One person: the row opens their page, the pill follows them without
 *  leaving the list. Siblings, never nested, because a button inside a
 *  link is not a thing. */
function PeopleRow({ p }: { p: DirPerson }) {
  const [state, setState] = useState<"off" | "following" | "requested">(
    p.following ? "following" : p.requested ? "requested" : "off",
  );
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const { followTrainer, unfollowTrainer } = await import("@/app/actions/subscribe");
    if (state === "off") {
      const res = await followTrainer(p.handle);
      if (res.ok) {
        setState(res.requested ? "requested" : "following");
        invalidateClientMemory(DISCOVER_PEOPLE_MEMORY_KEY);
        invalidateClientMemoryPrefix(DIRECTORY_SEARCH_MEMORY_PREFIX);
        invalidateClientMemory(SHARE_PEOPLE_MEMORY_KEY);
      }
    } else {
      // Unfollow also withdraws a pending ask, so Requested is the cancel.
      const res = await unfollowTrainer(p.handle);
      if (res.ok) {
        setState("off");
        invalidateClientMemory(DISCOVER_PEOPLE_MEMORY_KEY);
        invalidateClientMemoryPrefix(DIRECTORY_SEARCH_MEMORY_PREFIX);
        invalidateClientMemory(SHARE_PEOPLE_MEMORY_KEY);
        window.dispatchEvent(new Event("calendar-pins-changed"));
      }
    }
    setBusy(false);
  };
  return (
    <div className="nearrow">
      <Link className="nearrow-go" href={`/${p.handle}?from=following`}>
        <span className="nearrow-av">
          {p.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photo} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="nearrow-ini" style={{ background: p.color }}>
              {initials(p.name)}
            </span>
          )}
        </span>
        <span className="nearrow-txt">
          <span className="nearrow-nm">
            {p.name}
            {p.kind === "coach" && <span className="nearrow-tag">Coach</span>}
          </span>
          <span className="nearrow-sub">
            {[
              p.kind === "coach" ? p.title || p.location : p.location,
              p.kind === "coach" && p.next ? `next ${p.next}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      </Link>
      <button
        className={`peekfollow save-ribbon-only${state !== "off" ? " on" : ""}`}
        aria-pressed={state !== "off"}
        aria-label={state === "following" ? "Remove saved calendar" : state === "requested" ? "Cancel calendar request" : "Save calendar"}
        disabled={busy}
        onClick={toggle}
      >
        <Icon name={state === "following" ? "bookmark_added" : state === "requested" ? "schedule" : "bookmark"} size={20} />
      </button>
    </div>
  );
}
