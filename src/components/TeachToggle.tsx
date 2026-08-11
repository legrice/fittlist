"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTeaching } from "@/app/actions/auth";

/**
 * "I teach too", in settings, for everybody.
 *
 * This is the whole account model in one control. There is one kind of
 * account; teaching is a thing it can carry, not a different signup. Turning
 * this on adds the Calendar tab and lists you in Discover, and turning it off
 * takes both away without touching a single class, because a switch that
 * quietly threw away somebody's week is a switch nobody could risk touching.
 *
 * It reads as a settings row rather than an upgrade prompt on purpose. Nobody
 * is being sold anything: most people here follow, some also teach, and the
 * app should not make the second sound like a promotion.
 */
export function TeachToggle({ on: initial, canTurnOn }: { on: boolean; canTurnOn: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [err, setErr] = useState("");
  const [, start] = useTransition();

  const flip = () => {
    const next = !on;
    setOn(next);
    setErr("");
    start(async () => {
      const res = await setTeaching(next);
      if (!res.ok) {
        setOn(!next);
        setErr(res.error ?? "Couldn't change that");
        return;
      }
      // The tab bar is rendered by the layout above this, so the whole shell
      // has to hear about it: a switch that adds a tab and leaves the bar
      // alone until the next navigation has plainly not worked.
      router.refresh();
    });
  };

  return (
    <>
      <button className="setrow" onClick={flip} aria-pressed={on}>
        <span className="setrow-txt">
          <span className="t">I coach classes</span>
          <span className="s">
            {on
              ? "The Coaching pill is on your schedule, and people can find you on Discover."
              : "Adds coaching to your schedule and Add screens, and lists you so people can follow you."}
          </span>
        </span>
        <span className={`switch${on ? " on" : ""}`} aria-hidden="true">
          <span className="switch-knob" />
        </span>
      </button>
      {err && <p className="err">{err}</p>}
    </>
  );
}
