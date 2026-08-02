"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { setGoing } from "@/app/actions/going";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The corner of a class card on a profile: share it on, and (for a member
// looking at somebody else's class) the Add ribbon. Siblings of the row, never
// children, because a button inside a link is not a thing; ClassOpener only
// catches taps inside the row, so these keep their own.
export function ClassCardActions({
  classId,
  iso,
  url,
  name,
  canAdd,
  initialOn,
}: {
  classId: string;
  iso: string;
  /** The class page's path, shared as an absolute link. */
  url: string;
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

  const share = async () => {
    const abs = `${window.location.origin}${url}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: name, url: abs });
        return;
      }
      await navigator.clipboard.writeText(abs);
      toast("Link copied, ready to paste");
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") toast(abs);
    }
  };

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
      }
    });
  };

  return (
    <>
      {/* Share takes the ribbon's spot when there is no ribbon: one lone
          button hovering a slot in from the corner read as a mistake. */}
      <button
        className={`evcard-share${canAdd ? "" : " lone"}`}
        aria-label={`Share ${name}`}
        onClick={share}
      >
        <Icon name="ios_share" size={17} />
      </button>
      {canAdd && (
        <button
          className={`evcard-add${on ? " on" : ""}`}
          aria-label={on ? "In your plans" : "Add to your plans"}
          aria-pressed={on}
          onClick={toggle}
        >
          <Icon name={on ? "bookmark_added" : "bookmark"} size={18} />
        </button>
      )}
      {/* The same note every other Add answers with, naming the list it
          joined. Words only while it speaks, so nothing else finds two. */}
      <div className={`favtoast listadded${justAdded ? " on" : ""}`} aria-hidden={!justAdded}>
        {justAdded && (
          <>
            <Icon name="bookmark_added" size={16} />
            <span className="favtoast-t">Added {name} to your plans</span>
            <Link className="favtoast-link" href="/week" onClick={() => setJustAdded(false)}>
              See it
            </Link>
          </>
        )}
      </div>
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
