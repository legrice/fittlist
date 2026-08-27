"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "fl-follow-hint";

/** Whether the hint is still worth showing. Read at tap time, not at mount,
 *  so dismissing it in one place quiets it in the next without a reload. */
export function followHintOff(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(KEY) === "off";
  } catch {
    return false;
  }
}

/**
 * What a follow actually did, said once rather than assumed.
 *
 * "You're following Sam" reports the tap; it doesn't say what changed. This
 * does, with the way to go and see. It stops when they say so, because an
 * instruction you already understand is just noise, and it says the same thing
 * on a profile and in Discover rather than each explaining a follow in its own
 * words.
 *
 * The words changed when following stopped delivering classes. It used to
 * promise Sam's classes were "on your Following week", which was true and is
 * now false twice over: there is no Following week, and a follow puts nothing
 * on a calendar. It buys a face, and the face is the door, so the hint names
 * the circle and points at the screen that holds it. Getting this wrong is
 * worse than saying nothing: somebody who goes looking for classes that were
 * never added concludes the follow failed.
 */
export function FollowHint({
  name,
  handle,
  on,
  onClose,
}: {
  name: string;
  handle: string;
  on: boolean;
  onClose: () => void;
}) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (on) setGone(false);
  }, [on]);
  if (!on || gone) return null;
  return (
    <div className="folhint" role="status" aria-live="polite">
      <p className="folhint-t">
        {name}&rsquo;s calendar is saved. Find it anytime in You.
      </p>
      <div className="folhint-row">
        <Link className="folhint-go" href={`/saved?highlight=${encodeURIComponent(handle)}`} onClick={onClose}>
          View saved calendars
        </Link>
        <button
          className="folhint-off"
          onClick={() => {
            try {
              localStorage.setItem(KEY, "off");
            } catch {
              // A browser refusing storage just means they get told again.
            }
            setGone(true);
            onClose();
          }}
        >
          Don&rsquo;t show again
        </button>
      </div>
    </div>
  );
}
