"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setApproveFollowers } from "@/app/actions/profile";
import { Icon } from "@/components/Icon";

// The private-account gate: on means a follow starts as a request you answer
// in Followers. Off keeps follows one-tap. Being listed in Discover and
// gating your followers is a fine combination; the two switches sit together
// so that reads as a choice, not a contradiction.
export function ApproveFollowersToggle({ initialOn }: { initialOn: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initialOn);
  const [, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const res = await setApproveFollowers(next);
      if (!res.ok) setOn(!next);
      router.refresh();
    });
  };

  return (
    <button className="setrow" onClick={toggle} aria-pressed={on}>
      <span className="setrow-ic"><Icon name="lock" size={22} /></span>
      <span className="setrow-txt">
        <span className="t">Approve followers</span>
        <span className="s">
          {on ? "People ask first, and you say yes in Followers" : "Off, anyone can follow you"}
        </span>
      </span>
      <span className={`switch${on ? " on" : ""}`} aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  );
}
