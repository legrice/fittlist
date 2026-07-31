"use client";

import Link from "next/link";
import { useState } from "react";
import { ClassSheet } from "@/components/ClassSheet";
import { EventSheet } from "@/components/EventSheet";

// The top of Home: everything you hearted that's still ahead, classes and
// events in one date-ordered row. Heart something anywhere and it surfaces
// here, which is what makes the heart mean one thing. Tapping a chip opens
// the same overlay the rest of the app uses.
export type PlanChip = {
  key: string;
  kind: "class" | "event";
  when: string;
  name: string;
  sub: string;
  iso: string;
  handle?: string;
  classId?: string;
  eventId?: string;
};

export function PlansShelf({ items }: { items: PlanChip[] }) {
  const [cls, setCls] = useState<{ handle: string; classId: string; iso: string } | null>(null);
  const [ev, setEv] = useState<string | null>(null);

  return (
    <div className="plans">
      <h2 className="plans-h nearby-h">
        Your plans
        <Link className="nearby-all" href="/week">
          See all
        </Link>
      </h2>
      <div className="plans-row">
        {items.map((p) => (
          <button
            key={p.key}
            className="planchip"
            onClick={() => {
              if (p.kind === "event" && p.eventId) setEv(p.eventId);
              else if (p.handle && p.classId) setCls({ handle: p.handle, classId: p.classId, iso: p.iso });
            }}
          >
            <span className="planchip-when">{p.when}</span>
            <span className="planchip-nm">{p.name}</span>
            <span className="planchip-sub">{p.sub}</span>
          </button>
        ))}
      </div>
      {cls && (
        <ClassSheet
          handle={cls.handle}
          classId={cls.classId}
          iso={cls.iso}
          onClose={() => setCls(null)}
        />
      )}
      {ev && <EventSheet id={ev} onClose={() => setEv(null)} />}
    </div>
  );
}
