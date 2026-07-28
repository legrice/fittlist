"use client";

import { useState, useTransition } from "react";
import { setGoing } from "@/app/actions/going";
import { Icon } from "@/components/Icon";

// "I'm going" on the class itself, pinned to the bottom of the screen — the
// one commitment the page asks for. A personal note, never a reservation, so
// on a class with a booking link the caption says so plainly.
export function GoingButton({
  classId,
  iso,
  initialGoing,
  hasBooking,
}: {
  classId: string;
  iso: string;
  initialGoing: boolean;
  hasBooking: boolean;
}) {
  const [on, setOn] = useState(initialGoing);
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next);
    setErr("");
    startTransition(async () => {
      const res = await setGoing(classId, iso, next);
      if (!res.ok) {
        setOn(!next);
        setErr(res.error ?? "Something went wrong.");
      }
    });
  };

  return (
    <div className="evcta">
      <div className="evcta-inner">
        <p className="evctanote">
          {hasBooking
            ? "Just for your own week — book above to reserve your spot."
            : "Just for your own week. It isn't a booking."}
        </p>
        <button
          className={`btn${on ? " ghost" : ""} evctabtn${on ? " on" : ""}`}
          disabled={pending}
          aria-pressed={on}
          onClick={toggle}
        >
          <Icon name={on ? "check" : "add"} size={18} />
          {on ? "You're going" : "I'm going"}
        </button>
        {err && <p className="err">{err}</p>}
      </div>
    </div>
  );
}
