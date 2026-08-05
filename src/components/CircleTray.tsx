"use client";

import { useState } from "react";
import Link from "next/link";
import { markPeeked } from "@/app/actions/circles";
import { CoachPeek } from "@/components/CoachPeek";
import { Icon } from "@/components/Icon";
import { initialOf } from "@/lib/avatar";
import type { Circle } from "@/lib/circles";

/**
 * The faces across the top of Schedule: everyone you follow, and a plus.
 *
 * This is the whole of what a follow buys now. It used to pour a coach's
 * classes onto your week, which meant the app decided what your calendar said
 * and saving barely changed the screen. A circle is the other model: following
 * is a subscription to a face, tapping it shows their week, and saving from
 * there is the act that fills your calendar. That makes the tray load-bearing
 * rather than decoration.
 *
 * The plus at the end is the way to more of them. A tray of six faces is a
 * screen that works; a tray of one is a screen that needs the next one, and
 * the plus is the only thing on it that says where they come from.
 */
export function CircleTray({ circles }: { circles: Circle[] }) {
  const [open, setOpen] = useState<Circle | null>(null);
  // The ring goes out here rather than waiting for the server to agree, so the
  // face they just looked at stops shouting the moment they look away.
  const [seen, setSeen] = useState<Record<string, true>>({});

  if (!circles.length) return null;

  const openPeek = (c: Circle) => {
    setOpen(c);
    setSeen((s) => ({ ...s, [c.id]: true }));
    // On open, not on close. The ring promises "there is something in here",
    // and that promise is kept the moment they are looking at it. Closing is
    // the worse moment: a reload or a back swipe never fires it, and the ring
    // stays lit over classes they have already read.
    void markPeeked(c.id);
  };

  return (
    <>
      <div className="tray">
        <div className="tray-scroll">
          {circles.map((c) => (
            <button
              key={c.id}
              className="trayitem"
              onClick={() => openPeek(c)}
              aria-label={`${c.name}${c.fresh && !seen[c.id] ? ", new classes" : ""}`}
            >
              <span className={`trayav${c.fresh && !seen[c.id] ? " fresh" : ""}`}>
                {c.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photo} alt="" />
                ) : (
                  <span className="trayav-ini" style={{ background: c.color }}>
                    {initialOf(c.name)}
                  </span>
                )}
              </span>
              <span className="trayitem-nm">{c.first}</span>
            </button>
          ))}
          <Link className="trayitem" href="/discover">
            <span className="trayav trayav-add">
              <Icon name="add" size={26} />
            </span>
            <span className="trayitem-nm">Add</span>
          </Link>
        </div>
      </div>
      {open && (
        <CoachPeek
          id={open.id}
          name={open.name}
          photo={open.photo}
          color={open.color}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
