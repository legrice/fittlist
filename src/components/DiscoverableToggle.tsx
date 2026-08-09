"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDiscoverable } from "@/app/actions/profile";
import { Icon } from "@/components/Icon";

// Whether this person is listed in Discover. Their page is public either
// way; being in a directory is a different thing from having a URL, so it's
// their call. Members get the same switch, because being listable at all
// should be something you can decline.
export function DiscoverableToggle({ initialOn }: { initialOn: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initialOn);
  const [, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const res = await setDiscoverable(next);
      if (!res.ok) setOn(!next);
      router.refresh();
    });
  };

  return (
    <button className="setrow" onClick={toggle} aria-pressed={on}>
      <span className="setrow-ic"><Icon name={on ? "travel_explore" : "public_off"} size={24} /></span>
      <span className="setrow-txt">
        <span className="t">Listed in Discover</span>
        <span className="s">
          {on ? "People can find you in Discover" : "Off, only people with your link"}
        </span>
      </span>
      <span className={`switch${on ? " on" : ""}`} aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  );
}
