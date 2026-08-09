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
      <span className="setrow-ic"><Icon name="lock" size={24} /></span>
      <span className="setrow-txt">
        {/* The word everybody already knows from every other app. "Approve
            followers" named the mechanism, which meant reading the row to
            find out what it did to your account; Public and Private are the
            two states people arrive already understanding, and the mechanism
            goes in the line underneath where it belongs. */}
        <span className="t">Account privacy</span>
        <span className="s">
          {on
            ? "Private, you approve who follows you"
            : "Public, anyone can follow you and see your week"}
        </span>
      </span>
      <span className={`switch${on ? " on" : ""}`} aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  );
}
