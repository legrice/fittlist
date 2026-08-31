"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTeaching } from "@/app/actions/auth";
import { Icon } from "@/components/Icon";

/**
 * Coaching is a capability on the same account, not a migration. The server
 * action deliberately keeps existing classes when this is switched off, so a
 * person can change this setting without losing the calendar they built.
 */
export function TeachingToggle({ initialOn }: { initialOn: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initialOn);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (pending) return;
    const next = !on;
    setMessage("");
    setOn(next);
    startTransition(async () => {
      const result = await setTeaching(next);
      if (!result.ok) {
        setOn(!next);
        setMessage(result.error ?? "Couldn't change that setting.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <button className="setrow" type="button" onClick={toggle} aria-pressed={on} disabled={pending}>
        <span className="setrow-ic"><Icon name="activity" size={24} /></span>
        <span className="setrow-txt">
          <span className="t">I&rsquo;m a coach</span>
          <span className="s">
            {on ? "Coach tools and your public calendar are on" : "Not a coach · personal calendar only"}
          </span>
        </span>
        <span className={`switch${on ? " on" : ""}`} aria-hidden="true">
          <span className="switch-knob" />
        </span>
      </button>
      {message && <span className="content-report-status" role="status">{message}</span>}
    </>
  );
}
