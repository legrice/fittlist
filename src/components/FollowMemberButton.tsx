"use client";

import { useState, useTransition } from "react";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { Icon } from "@/components/Icon";
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
}: {
  handle: string;
  name: string;
  initialFollowing: boolean;
  initialRequested?: boolean;
}) {
  const [state, setState] = useState<FollowState>(
    initialFollowing ? "following" : initialRequested ? "requested" : "off",
  );
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const first = name.trim().split(/\s+/)[0] || name;

  const toggle = () => {
    if (pending) return;
    start(async () => {
      if (state === "off") {
        const res = await followTrainer(handle);
        if (!res.ok) {
          toast(res.error ?? "Something went wrong.");
          return;
        }
        if (res.requested) {
          setState("requested");
          toast(`Asked to save ${first}'s calendar`);
        } else {
          setState("following");
          toast(`${first}'s calendar saved`);
        }
      } else {
        const res = await unfollowTrainer(handle);
        if (!res.ok) {
          toast(res.error ?? "Something went wrong.");
          return;
        }
        const wasRequest = state === "requested";
        setState("off");
        toast(wasRequest ? "Request withdrawn" : "Calendar removed");
      }
    });
  };

  return (
    <>
      <button
        className={`followpill save-ribbon-only${state === "following" ? " on" : ""}`}
        disabled={pending}
        aria-label={state === "following" ? "Remove saved calendar" : state === "requested" ? "Cancel calendar request" : "Save calendar"}
        onClick={toggle}
      >
        <Icon name={state === "following" ? "bookmark_added" : state === "requested" ? "schedule" : "bookmark"} size={20} />
      </button>
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
