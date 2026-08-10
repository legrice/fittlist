"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { addBrowse, type BrowseDay } from "@/app/actions/discover";
import { setGoing } from "@/app/actions/going";
import { Icon } from "@/components/Icon";

// The Add screen's Discover half, per the brief: a browsable list of the
// classes near you with an inline Save on each row, and the way to add one
// that isn't here at the bottom. It wears the coach peek's own row grammar
// (peekday, peekrow, peekadd), because the two lists are one idea: a week
// you can save from.
export function AddBrowse({
  coachSeg,
  onCoaching,
  onAddNew,
  onEvent,
  onClose,
}: {
  /** A coach picks a hat first: Discover, or I'm coaching. A member never
   *  sees the segments, because one answer is not a question. */
  coachSeg?: boolean;
  onCoaching?: () => void;
  /** The class isn't listed: the ordinary adder, with everything typed
   *  landing in the catalog for the next person. */
  onAddNew: () => void;
  /** Not a class at all: the personal event form. */
  onEvent?: () => void;
  onClose: () => void;
}) {
  const [days, setDays] = useState<BrowseDay[] | null>(null);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [, start] = useTransition();

  useEffect(() => {
    addBrowse().then((d) => setDays(d ?? []));
  }, []);

  const save = (classId: string, iso: string, on: boolean) => {
    const key = `${classId}|${iso}`;
    setMarks((m) => ({ ...m, [key]: on }));
    start(async () => {
      const res = await setGoing(classId, iso, on);
      if (!res.ok) setMarks((m) => ({ ...m, [key]: !on }));
    });
  };

  return (
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet sheet-full peeksheet addbrowse">
        <div className="peekhead">
          <div className="peekhead-txt">
            <h2 className="peekhead-nm">Add a class</h2>
          </div>
          <button className="iconbtn sheetclose peekclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>

        {coachSeg && (
          <div className="modetoggle addseg">
            <button className="sel" type="button">
              Discover
            </button>
            <button type="button" onClick={onCoaching}>
              I&rsquo;m coaching
            </button>
          </div>
        )}

        {!days && <p className="peekempty">Looking at the week&hellip;</p>}
        {days && days.length === 0 && (
          <p className="peekempty">Nothing listed near you this week yet.</p>
        )}

        {days?.map((d) => (
          <div key={d.iso} className="peekday">
            <p className="peekday-h">{d.label}</p>
            {d.items.map((it) => {
              const key = `${it.classId}|${it.iso}`;
              const on = marks[key] ?? it.saved;
              return (
                <div key={key} className="peekrow">
                  <Link className="peekrow-go" href={`/${it.base}/${it.classId}?d=${it.iso}`}>
                    <span className="peekrow-nm">{it.name}</span>
                    <span className="peekrow-sub">
                      {it.hm}
                      <span className="peekrow-ap">{it.ap.toLowerCase()}</span> &middot;{" "}
                      {it.durationMin} min
                      {it.coachName ? ` · ${it.coachName.split(/\s+/)[0]}` : ""}
                      {it.where ? ` · ${it.where}` : ""}
                    </span>
                  </Link>
                  {!it.own && (
                    <button
                      className={`peekadd${on ? " on" : ""}`}
                      onClick={() => save(it.classId, it.iso, !on)}
                      aria-label={on ? `Saved: ${it.name}` : `Save ${it.name}`}
                    >
                      <Icon name={on ? "bookmark_added" : "bookmark"} size={22} />
                      <span>{on ? "Saved" : "Save"}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {days && (
          // publishwrap: the sheet's own sticky footer, so the way to add
          // what isn't listed is never a full scroll away, by Matt's call.
          <div className="addbrowse-foot publishwrap">
            <p className="durnote">
              Can&rsquo;t find it? Add it and it shows up here for everyone else too.
            </p>
            <button className="btn ghost" onClick={onAddNew}>
              + Add a class that isn&rsquo;t here
            </button>
            {onEvent && (
              <button className="tertiary addbrowse-ev" onClick={onEvent}>
                Something else, not a class
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
