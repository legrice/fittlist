"use client";

import { useState, useTransition } from "react";
import { setGoing } from "@/app/actions/going";
import { Icon } from "@/components/Icon";

// "I'm going" on the class itself. A personal note, never a reservation — so
// on a class with a booking link it stays secondary to Book, and the copy
// underneath says so plainly.
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
    <div className="evgoing">
      <button
        className={`btn${on ? " ghost" : ""} evgoingbtn${on ? " on" : ""}`}
        disabled={pending}
        aria-pressed={on}
        onClick={toggle}
      >
        <Icon name={on ? "check" : "add"} size={18} />
        {on ? "You're going" : "I'm going"}
      </button>
      <p className="evgoingnote">
        {hasBooking
          ? "Just for your own week — book above to reserve your spot."
          : "Just for your own week. It isn't a booking."}
      </p>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
