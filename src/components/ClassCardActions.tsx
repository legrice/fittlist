"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { setGoing, setGoingVisibility } from "@/app/actions/going";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { announceSaved } from "@/components/SaveEducation";

// The corner of a class row on a profile: the Add ribbon, for a member
// looking at somebody else's class. A sibling of the row, never a child,
// because a button inside a link is not a thing; ClassOpener only catches
// taps inside the row, so this keeps its own.
export function ClassCardActions({
  classId,
  iso,
  name,
  canAdd,
  initialOn,
}: {
  classId: string;
  iso: string;
  name: string;
  /** The viewer could put this in their plans: signed in, not the owner, not
   *  the coach on the slot. The server still has the final say. */
  canAdd: boolean;
  initialOn: boolean;
}) {
  const [on, setOn] = useState(initialOn);
  const [justAdded, setJustAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toastMsg, toastOn, toast] = useToast();
  const [, start] = useTransition();
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const toggle = () => {
    const next = !on;
    setOn(next);
    if (next) {
      setJustAdded(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setJustAdded(false), 4200);
    } else {
      setJustAdded(false);
    }
    start(async () => {
      const res = await setGoing(classId, iso, next);
      if (!res.ok) {
        setOn(!next);
        setJustAdded(false);
        toast(res.error ?? "Something went wrong");
      } else if (next) announceSaved(classId, iso);
    });
  };

  return (
    <>
      {/* The ribbon and its word: the share circle came off every row,
          because sharing lives on the class sheet, where one class has the
          whole screen. The label repeats in the spoken name on purpose: the
          visible word has to be inside the accessible one, or "click Added"
          reaches nothing. */}
      {canAdd && (
        <button
          className={`calendar-save-action evcard-add${on ? " on" : ""}`}
          aria-label={on ? "Saved to your plans" : "Save to your plans"}
          aria-pressed={on}
          onClick={toggle}
        >
          <Icon name={on ? "bookmark_added" : "bookmark"} size={22} />
        </button>
      )}
      {/* The same note every other Add answers with, naming the list it
          joined. Words only while it speaks, so nothing else finds two. */}
      <div className={`favtoast listadded${justAdded ? " on" : ""}`} aria-hidden={!justAdded}>
        {justAdded && (
          <>
            <Icon name="check_circle" size={18} />
            <span className="favtoast-t">Saved {name}. Followers can see it.</span>
            {/* See it lands on the week with this occurrence marked, so the
                note hands over to the thing itself rather than to a list to
                search. */}
            <Link
              className="favtoast-link"
              href={`/week?hl=${encodeURIComponent(`${classId}.${iso}`)}`}
              onClick={() => setJustAdded(false)}
            >
              See it
            </Link>
          </>
        )}
      </div>
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
