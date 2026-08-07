"use client";

import { useState } from "react";
import { DiscoverSheet } from "@/components/DiscoverSheet";
import { Icon } from "@/components/Icon";

/**
 * The magnifier in the header, and the directory behind it.
 *
 * It is the same sheet Following's floating button opens, on purpose: finding
 * somebody is one act with one drawing of it, and a second door that navigated
 * to a page instead would be the same idea behaving two ways depending on
 * which screen you were standing on.
 *
 * It took the corner your own face used to hold. A profile is one tap away in
 * the tab bar, so the face was a second door to a place that already had one,
 * and the corner is for the thing you reach for from anywhere. On this app
 * that is finding a coach: every other screen is empty until a follow happens.
 */
export function HeaderFind() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={`iconbtn inboxbtn findbtn${open ? " onroute" : ""}`}
        aria-label="Find coaches"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Icon name="search" size={18} />
      </button>
      {open && <DiscoverSheet onClose={() => setOpen(false)} />}
    </>
  );
}
