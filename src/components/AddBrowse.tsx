"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { addBrowse, type BrowseDay } from "@/app/actions/discover";
import { setGoing } from "@/app/actions/going";
import { Icon } from "@/components/Icon";
import { announceSaved } from "@/components/SaveEducation";

// The Add screen's Discover half, per the brief: a browsable list of the
// classes near you with an inline Save on each row, and the way to add one
// that isn't here at the bottom. It wears the coach peek's own row grammar
// (peekday, peekrow, peekadd), because the two lists are one idea: a week
// you can save from.
export function AddBrowse({
  onAddNew,
  onEvent,
  onNotice,
  onClose,
}: {
  /** The class isn't listed: the ordinary adder, with everything typed
   *  landing in the catalog for the next person. */
  onAddNew: () => void;
  /** Not a class at all: the personal event form. */
  onEvent?: () => void;
  onNotice?: (message: string, highlight?: string) => void;
  onClose: () => void;
}) {
  const [days, setDays] = useState<BrowseDay[] | null>(null);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [removeConfirm, setRemoveConfirm] = useState<{ classId: string; iso: string; name: string } | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    addBrowse().then((d) => setDays(d ?? []));
  }, []);

  const save = (classId: string, iso: string, name: string, on: boolean) => {
    const key = `${classId}|${iso}`;
    setMarks((m) => ({ ...m, [key]: on }));
    start(async () => {
      const res = await setGoing(classId, iso, on);
      if (!res.ok) setMarks((m) => ({ ...m, [key]: !on }));
      else {
        if (on) announceSaved(classId, iso);
        onNotice?.(
          on ? `${name} was added to your calendar` : `${name} was removed from your calendar`,
          on ? `${classId}.${iso}` : undefined,
        );
      }
    });
  };

  const needle = query.trim().toLowerCase();
  const shownDays = (days ?? [])
    .map((day) => ({
      ...day,
      items: day.items.filter((it) =>
        !needle || [it.name, it.where, it.attributionName].some((value) => value?.toLowerCase().includes(needle)),
      ),
    }))
    .filter((day) => day.items.length > 0);

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
            <p className="addbrowse-intro">Discover classes from coaches near you.</p>
          </div>
          <button className="iconbtn sheetclose peekclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="addbrowse-search">
          <Icon name="search" size={20} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search classes, coaches, or studios"
            aria-label="Search the class catalog"
          />
        </div>

        {!days && <p className="peekempty">Looking at the week&hellip;</p>}
        {days && days.length === 0 && (
          <p className="peekempty">Nothing listed near you this week yet.</p>
        )}

        {days && needle && shownDays.length === 0 && (
          <p className="peekempty">No classes match &ldquo;{query.trim()}&rdquo;.</p>
        )}

        {shownDays.map((d) => (
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
                      <span className="peekrow-ap">{it.ap.toLowerCase()}</span>
                      {it.where ? ` · ${it.where}` : ""}
                    </span>
                    {it.attributionName && (
                      <span className="peekrow-by">
                        {it.attribution === "added" ? "Added by" : "Coached by"} {it.attributionName}
                      </span>
                    )}
                  </Link>
                  {!it.own && (
                    <button
                      className={`peekadd${on ? " on" : ""}`}
                      onClick={() => on ? setRemoveConfirm({ classId: it.classId, iso: it.iso, name: it.name }) : save(it.classId, it.iso, it.name, true)}
                      aria-label={on ? `Added to your week: ${it.name}` : `Add ${it.name} to your week`}
                    >
                      <Icon name={on ? "check" : "add_circle"} size={on ? 24 : 22} />
                      {!on && <span>Add</span>}
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
            <button className="btn si" onClick={onAddNew}>
              + Add a class that isn&rsquo;t here
            </button>
            {onEvent && (
              <button className="tertiary addbrowse-ev" onClick={onEvent}>
                Add a personal workout instead
              </button>
            )}
          </div>
        )}
      </div>
      {removeConfirm && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setRemoveConfirm(null); }}>
          <div className="sheet confirmsheet" role="dialog" aria-modal="true">
            <h2>Remove this from your calendar?</h2>
            <p className="lead">{removeConfirm.name} comes off your calendar. You can add it again any time.</p>
            <div className="publishwrap nostick">
              <button className="btn si" onClick={() => {
                save(removeConfirm.classId, removeConfirm.iso, removeConfirm.name, false);
                setRemoveConfirm(null);
              }}>Remove it</button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setRemoveConfirm(null)}>Keep it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
