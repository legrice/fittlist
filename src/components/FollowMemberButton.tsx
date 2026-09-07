"use client";

import { useRef, useState, useTransition } from "react";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { haptic } from "@/lib/haptics";
import { Toast, useToast } from "@/components/Toast";

// Following a member. Same verb and same table as following a coach; what it
// buys is different, and smaller on purpose: no schedule lands in your week,
// nothing public changes. If you both follow each other and you both add the
// same class, you'll see them on it in Your week. That's the whole feature:
// "is anyone I know going?"
//
// A person who approves their followers turns the tap into an ask: the pill
// says Requested until they answer, and tapping it again withdraws the ask.
type FollowState = "off" | "requested" | "following";

export function FollowMemberButton({
  handle,
  name,
  initialFollowing,
  initialRequested = false,
  followsYou = false,
}: {
  handle: string;
  name: string;
  initialFollowing: boolean;
  initialRequested?: boolean;
  followsYou?: boolean;
}) {
  const busy = useRef(false);
  const [state, setState] = useState<FollowState>(
    initialFollowing ? "following" : initialRequested ? "requested" : "off",
  );
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const first = name.trim().split(/\s+/)[0] || name;

  const toggle = () => {
    if (busy.current || pending) return;
    busy.current = true;
    start(async () => {
      try {
        if (state === "off") {
          const res = await followTrainer(handle);
          if (!res.ok) {
            toast(res.error ?? "Something went wrong.");
            return;
          }
          if (res.requested) {
            setState("requested");
            toast(`Follow request sent to ${first}`);
          } else {
            setState("following");
            toast(`Following ${first}`);
          }
          haptic("success");
          window.dispatchEvent(new Event("follows-changed"));
        } else {
          const res = await unfollowTrainer(handle);
          if (!res.ok) {
            toast(res.error ?? "Something went wrong.");
            return;
          }
          const wasRequest = state === "requested";
          setState("off");
          haptic("selection");
          window.dispatchEvent(new Event("calendar-pins-changed"));
          toast(wasRequest ? "Follow request withdrawn" : `Unfollowed ${first}`);
        }
      } catch { toast("Couldn’t update following. Check your connection and try again."); }
      finally { busy.current = false; }
    });
  };

  return (
    <>
      <button
        className={`followpill${state === "following" ? " on" : ""}`}
        disabled={pending}
        aria-pressed={state === "following"}
        onClick={toggle}
      >
        {state === "following" ? "Following" : state === "requested" ? "Requested" : followsYou ? "Follow back" : "Follow"}
      </button>
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
