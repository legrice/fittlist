"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEvent } from "@/app/actions/events";

// Take the event down, behind one confirmation. There's no edit sheet yet
// (delete and repost covers a beta), so this is the poster's whole toolbox.
export function EventRemoveButton({ id, onDone }: { id: string; onDone?: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const remove = () =>
    start(async () => {
      const res = await deleteEvent(id);
      if (!res.ok) return;
      // From the overlay the board is already behind us; from the page it
      // isn't, so the default walks there.
      if (onDone) {
        onDone();
        router.refresh();
      } else {
        router.push("/discover");
      }
    });
  return (
    <div className="dangerzone">
      {confirming ? (
        <>
          <p className="lead">Take this event off the board?</p>
          <button className="btn ghost" disabled={pending} onClick={remove}>
            {pending ? "Removing…" : "Yes, remove it"}
          </button>
          <button
            className="tertiary"
            style={{ display: "block", margin: "10px auto 0" }}
            onClick={() => setConfirming(false)}
          >
            Keep it
          </button>
        </>
      ) : (
        <button className="tertiary" onClick={() => setConfirming(true)}>
          Remove event
        </button>
      )}
    </div>
  );
}
