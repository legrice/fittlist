"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setShiftsPublic } from "@/app/actions/profile";
import { Icon } from "@/components/Icon";

// Whether the shifts a gym has you on belong on your own page.
//
// Off, a shift reaches your calendar and nowhere else, which is what a coach
// who wants no public trace of their work needs. On, the classes you actually
// teach are on the page you hand people, which is what a coach teaching at
// four gyms needs. Both are right; only the coach knows which.
//
// It has nothing to say about the gym's own schedule, which never names a
// coach. That is the gym's call and a different question.
export function ShiftsPublicToggle({
  initialOn,
  count,
}: {
  initialOn: boolean;
  /** How many slots they're on, so the row can say what it's about. */
  count: number;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initialOn);
  const [, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const res = await setShiftsPublic(next);
      if (!res.ok) setOn(!next);
      router.refresh();
    });
  };

  return (
    <button className="setrow" onClick={toggle} aria-pressed={on}>
      <span className="setrow-ic">
        <Icon name={on ? "calendar_month" : "public_off"} size={22} />
      </span>
      <span className="setrow-txt">
        <span className="t">Gym shifts on your page</span>
        <span className="s">
          {on
            ? `Your ${count === 1 ? "shift is" : `${count} shifts are`} on your page and in your share`
            : "Off, they stay in your calendar only"}
        </span>
      </span>
      <span className={`switch${on ? " on" : ""}`} aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  );
}
