"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEventGoing } from "@/app/actions/events";
import { Icon } from "@/components/Icon";

// "I'm going", for an event. Same meaning as the class mark: a personal note
// and a wave to your mutuals, never a reservation. The refresh after a change
// is what reveals (or hides) the who's-going list, since seeing it is priced
// at being on it.
export function EventGoingButton({ id, initialGoing }: { id: string; initialGoing: boolean }) {
  const router = useRouter();
  const [going, setGoing] = useState(initialGoing);
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      const res = await setEventGoing(id, !going);
      if (res.ok) {
        setGoing(!going);
        router.refresh();
      }
    });
  return (
    <button
      className={`classsheet-add evgoing${going ? " on" : ""}`}
      disabled={pending}
      aria-pressed={going}
      onClick={toggle}
    >
      <Icon name={going ? "check" : "add"} size={18} />
      {going ? "You're going" : "I'm going"}
    </button>
  );
}
