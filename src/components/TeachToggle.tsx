"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTeaching } from "@/app/actions/auth";
import { Icon } from "@/components/Icon";

/**
 * "I teach too", in settings, for everybody.
 *
 * This is the whole account model in one control. There is one kind of
 * account; teaching is a thing it can carry, not a different signup. Turning
 * turning it on adds coaching to the calendar's filters and Add choices and
 * lists you in Discover. Turning it off keeps the calendar and its personal
 * entries, but removes the ability to publish teaching classes.
 *
 * It reads as a settings row rather than an upgrade prompt on purpose. Nobody
 * is being sold anything: most people here follow, some also teach, and the
 * app should not make the second sound like a promotion.
 */
export function TeachToggle({
  on: initial,
  canTurnOn,
  account = false,
}: {
  on: boolean;
  canTurnOn: boolean;
  account?: boolean;
}) {
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
      <button
        className={account ? "youaccount-row" : "setrow"}
        onClick={flip}
        aria-pressed={on}
        disabled={!on && !canTurnOn}
      >
        {account && <span className="youaccount-icon"><Icon name="activity" size={20} /></span>}
        <span className={account ? "youaccount-copy" : "setrow-txt"}>
          <strong className={account ? undefined : "t"}>{on ? "I’m a coach" : "I’m not a coach"}</strong>
          <small className={account ? undefined : "s"}>
            {on
              ? "Teaching is available when you add to your calendar."
              : "Add attending classes and personal workouts only."}
          </small>
        </span>
        <span className={`switch${on ? " on" : ""}`} aria-hidden="true">
          <span className="switch-knob" />
        </span>
      </button>
      {err && <p className="err">{err}</p>}
    </>
  );
}
