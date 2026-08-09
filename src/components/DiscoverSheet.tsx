"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { discoverPeople, type DiscoverData } from "@/app/actions/discover";
import { searchAll } from "@/app/actions/search";
import { ClassResults } from "@/components/ClassResults";
import { DiscoverList } from "@/components/DiscoverList";
import { PersonRow, StudioRow, type DirPerson, type DirStudio } from "@/components/DirectoryRows";
import { Icon } from "@/components/Icon";
import type { DirClass } from "@/lib/discoverclasses";
import { todayIso } from "@/lib/format";

// The same floor /search holds; it lives in three files because a
// "use server" module can only export async functions.
const MIN = 2;

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
export function DiscoverSheet({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<DiscoverData | null>(null);
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<DirPerson[]>([]);
  const [studios, setStudios] = useState<DirStudio[]>([]);
  const [classes, setClasses] = useState<DirClass[]>([]);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState("");
  // Only the newest request may paint, or a slow "st" lands after "stacey"
  // and the results go backwards while you type.
  const run = useRef(0);
  const today = todayIso();
  // Portaled to the body (see InviteFriends): the header's magnifier renders
  // this from inside the sticky brandbar, and sticky makes a stacking
  // context in every mobile browser, so left in place the sheet's z-46
  // painted under the content card that slides over the header.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let live = true;
    discoverPeople().then((d) => live && setData(d));
    return () => {
      live = false;
    };
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

  if (!mounted) return null;
  const searching = q.trim().length >= MIN;
  const nothing =
    searching && !busy && asked === q.trim() && !people.length && !studios.length && !classes.length;

  return createPortal(
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet sheet-full dissheet">
        <div className="adderhead">
          <h2>Discover</h2>
          <button className="iconbtn sheetclose adderclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="dissearchrow">
          <div className="dissearch">
            <Icon name="search" size={21} className="dissearch-ic" />
            <input
              className="dissearch-in"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search coaches, studios, or classes"
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
          nothing ? (
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
                    People <span>{people.length}</span>
                  </h2>
                  <div className="dislist dislist-bare">
                    {people.map((p) => (
                      <PersonRow key={p.id} person={p} from="following" />
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
              {classes.length > 0 && (
                <div className="srchsec">
                  <h2 className="srchhead">
                    Classes <span>{classes.length}</span>
                  </h2>
                  <ClassResults classes={classes} todayIso={today} from="discover" />
                </div>
              )}
            </div>
          )
        ) : data ? (
          <DiscoverList
            people={data.people}
            cities={data.cities}
            myCity={data.myCity}
            backHref="/feed"
            hideBack
            hideSearch
          />
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
