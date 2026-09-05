"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { addBrowse, type AddBrowseData } from "@/app/actions/discover";
import { setGoing } from "@/app/actions/going";
import { Icon } from "@/components/Icon";
import { announceSaved } from "@/components/SaveEducation";
import {
  invalidateClientMemory,
  loadClientMemory,
  readClientMemory,
  writeClientMemory,
} from "@/lib/client-memory";

const ADD_BROWSE_MEMORY_KEY = "sheet:add-browse";

function withSavedMarks(data: AddBrowseData, marks: Record<string, boolean>): AddBrowseData {
  let changed = false;
  const days = data.days.map((day) => ({
    ...day,
    items: day.items.map((item) => {
      const saved = marks[`${item.classId}|${item.iso}`];
      if (saved === undefined || saved === item.saved) return item;
      changed = true;
      return { ...item, saved };
    }),
  }));
  return changed ? { ...data, days } : data;
}

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
  const [browse, setBrowse] = useState<AddBrowseData | null>(() =>
    readClientMemory<AddBrowseData>(ADD_BROWSE_MEMORY_KEY),
  );
  const [loadFailed, setLoadFailed] = useState(false);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const marksRef = useRef<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [classType, setClassType] = useState("");
  const [distance, setDistance] = useState("");
  const [removeConfirm, setRemoveConfirm] = useState<{ classId: string; iso: string; name: string } | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    let live = true;
    void loadClientMemory(ADD_BROWSE_MEMORY_KEY, addBrowse)
      .then((data) => {
        if (data === null) {
          invalidateClientMemory(ADD_BROWSE_MEMORY_KEY);
          if (live) {
            setBrowse({ days: [], myLat: null, myLng: null });
            setLoadFailed(false);
          }
          return;
        }
        const next = withSavedMarks(data, marksRef.current);
        writeClientMemory(ADD_BROWSE_MEMORY_KEY, next);
        if (live) {
          setBrowse(next);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        // Preserve cached results; without cache, retain the existing loader.
        if (live && browse === null) setLoadFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    document.body.classList.add("sheet-open");
    return () => document.body.classList.remove("sheet-open");
  }, []);

  const days = browse?.days ?? null;

  const save = (classId: string, iso: string, name: string, on: boolean) => {
    const key = `${classId}|${iso}`;
    marksRef.current = { ...marksRef.current, [key]: on };
    setMarks((m) => ({ ...m, [key]: on }));
    start(async () => {
      const rollBack = () => {
        marksRef.current = { ...marksRef.current, [key]: !on };
        setMarks((m) => ({ ...m, [key]: !on }));
      };
      try {
        const res = await setGoing(classId, iso, on);
        if (!res.ok) {
          rollBack();
          return;
        }
        setBrowse((current) => {
          if (!current) return current;
          const next = withSavedMarks(current, { [key]: on });
          writeClientMemory(ADD_BROWSE_MEMORY_KEY, next);
          return next;
        });
        if (on) announceSaved(classId, iso);
        onNotice?.(
          on ? `${name} was saved to your calendar` : `${name} was removed from your calendar`,
          on ? `${classId}.${iso}` : undefined,
        );
      } catch {
        rollBack();
      }
    });
  };

  const needle = query.trim().toLowerCase();
  const classTypes = [...new Set((days ?? []).flatMap((day) =>
    day.items.map((item) => item.classType).filter((value): value is string => !!value),
  ))].sort();
  const shownDays = (days ?? [])
    .map((day) => ({
      ...day,
      items: day.items.filter((it) => {
        if (needle && ![it.name, it.where, it.attributionName].some((value) => value?.toLowerCase().includes(needle))) return false;
        if (classType && it.classType !== classType) return false;
        if (distance) {
          if (browse?.myLat == null || browse.myLng == null || it.lat == null || it.lng == null) return false;
          if (milesBetween(browse.myLat, browse.myLng, it.lat, it.lng) > Number(distance)) return false;
        }
        return true;
      }),
    }))
    .filter((day) => day.items.length > 0);

  return (
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet peeksheet addbrowse" role="dialog" aria-modal="true" aria-labelledby="addbrowse-title">
        <div className="peekhead">
          <div className="peekhead-txt">
            <h2 className="peekhead-nm" id="addbrowse-title">Add a class</h2>
            <p className="addbrowse-intro">Discover classes from coaches near you.</p>
          </div>
          <button className="iconbtn sheetclose peekclose sheet-dismiss" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={20} />
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

        <div className="discover-class-filters addbrowse-filters" aria-label="Class filters">
          <label>
            <span>Type</span>
            <select value={classType} onChange={(event) => setClassType(event.target.value)}>
              <option value="">All types</option>
              {classTypes.map((type) => <option value={type} key={type}>{type}</option>)}
            </select>
          </label>
          <label>
            <span>Distance</span>
            <select value={distance} onChange={(event) => setDistance(event.target.value)} disabled={browse?.myLat == null || browse.myLng == null}>
              <option value="">Any distance</option>
              <option value="1">Within 1 mile</option>
              <option value="5">Within 5 miles</option>
              <option value="10">Within 10 miles</option>
              <option value="25">Within 25 miles</option>
            </select>
          </label>
        </div>

        <div className="addbrowse-results">
          {!days && loadFailed && <p className="peekempty">Couldn&rsquo;t load classes. Try again in a moment.</p>}
          {!days && !loadFailed && <p className="peekempty">Looking at the week&hellip;</p>}
          {days && days.length === 0 && (
            <p className="peekempty">Nothing listed near you this week yet.</p>
          )}

          {days && days.length > 0 && shownDays.length === 0 && (
            <p className="peekempty">No classes match these filters.</p>
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
                        aria-label={on ? `Saved to your week: ${it.name}` : `Save ${it.name} to your week`}
                      >
                        <Icon name={on ? "bookmark_added" : "bookmark"} size={22} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {days && (
          // publishwrap: the sheet's own sticky footer, so the way to add
          // what isn't listed is never a full scroll away, by Matt's call.
          <div className="addbrowse-foot publishwrap">
            <p className="durnote">
              Can&rsquo;t find it? Save it to your calendar yourself.
            </p>
            <button className="btn si" onClick={onAddNew}>
              Add a class that isn&rsquo;t listed
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
            <p className="lead">{removeConfirm.name} comes off your calendar. You can save it again any time.</p>
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

function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
