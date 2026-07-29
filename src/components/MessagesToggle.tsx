"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMessagesOpen } from "@/app/actions/profile";
import { Icon } from "@/components/Icon";

// Whether people can write to this coach from their public page.
//
// Separate from availability on purpose. Availability answers "am I taking
// private clients"; this answers "can anyone reach me at all". A coach whose
// books are full still wants the question about Tuesday's class.
export function MessagesToggle({ initialOn }: { initialOn: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initialOn);
  const [, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const res = await setMessagesOpen(next);
      if (!res.ok) setOn(!next);
      router.refresh();
    });
  };

  return (
    <button className="setrow" onClick={toggle} aria-pressed={on}>
      <span className="setrow-ic"><Icon name={on ? "chat_bubble" : "public_off"} size={22} /></span>
      <span className="setrow-txt">
        <span className="t">Messages</span>
        <span className="s">
          {on ? "People can message you from your page" : "Off, no Message button on your page"}
        </span>
      </span>
      <span className={`switch${on ? " on" : ""}`} aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  );
}
