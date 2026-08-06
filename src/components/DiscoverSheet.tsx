"use client";

import { useEffect, useState } from "react";
import { discoverPeople, type DiscoverData } from "@/app/actions/discover";
import { DiscoverList } from "@/components/DiscoverList";
import { Icon } from "@/components/Icon";

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
 * The rows load on open rather than riding along with the week. The whole
 * directory is a lot to send to a device on the chance somebody taps a
 * button, and this way Following costs what Following costs.
 */
export function DiscoverSheet({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<DiscoverData | null>(null);

  useEffect(() => {
    let live = true;
    discoverPeople().then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);

  return (
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
        {/* Nothing dramatic while it loads: the sheet is already up and the
            list is the only thing in it, so a spinner would be a second
            thing on a screen with one. */}
        {data ? (
          <DiscoverList
            people={data.people}
            cities={data.cities}
            myCity={data.myCity}
            backHref="/feed"
            hideBack
          />
        ) : (
          <p className="dissheet-wait">Loading coaches…</p>
        )}
      </div>
    </div>
  );
}
