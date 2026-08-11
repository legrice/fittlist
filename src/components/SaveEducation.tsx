"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";

const SEEN_KEY = "fl-save-education-seen";
const EVENT = "fl:first-save";

/** Call after a successful positive save. The shell owns the one-time UI. */
export function announceSaved(classId?: string, iso?: string) {
  try {
    if (localStorage.getItem(SEEN_KEY)) return;
  } catch {
    // Private browsing can still receive the explanation for this session.
  }
  window.dispatchEvent(
    new CustomEvent(EVENT, { detail: classId && iso ? `${classId}.${iso}` : null }),
  );
}

export function SaveEducation({ shareHref }: { shareHref: string }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    const show = (event: Event) => {
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        // The open sheet still teaches the behavior for this session.
      }
      setHighlight((event as CustomEvent<string | null>).detail ?? null);
      setOpen(true);
    };
    window.addEventListener(EVENT, show);
    return () => window.removeEventListener(EVENT, show);
  }, []);

  if (!open) return null;
  return (
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="sheet confirmsheet saveeducation">
        <span className="saveeducation-icon" aria-hidden="true">
          <Icon name="check_circle" size={24} />
        </span>
        <h2>Added to your week</h2>
        <p className="lead">
          It&rsquo;s now part of your week. Open Schedule to see it there, or share your
          updated week with friends.
        </p>
        <div className="publishwrap nostick saveeducation-actions">
          <Link
            className="btn si"
            href={highlight ? `/calendar?hl=${encodeURIComponent(highlight)}` : "/calendar"}
            onClick={() => setOpen(false)}
          >
            Go to Schedule
          </Link>
          <Link className="btn ghost" href={shareHref} onClick={() => setOpen(false)}>
            Share your week
          </Link>
        </div>
        <button className="confirm-keep" onClick={() => setOpen(false)}>
          Keep browsing
        </button>
      </div>
    </div>
  );
}
