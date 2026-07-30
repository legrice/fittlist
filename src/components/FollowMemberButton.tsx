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
export function FollowMemberButton({
  handle,
  name,
  initialFollowing,
}: {
  handle: string;
  name: string;
  initialFollowing: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const toggle = () => {
    if (pending) return;
    const next = !following;
    setFollowing(next);
    start(async () => {
      const res = next ? await followTrainer(handle) : await unfollowTrainer(handle);
      if (!res.ok) {
        setFollowing(!next);
        toast(res.error ?? "Something went wrong.");
        return;
      }
      toast(next ? `Following ${name.trim().split(/\s+/)[0]}` : "Unfollowed");
    });
  };

  return (
    <>
      <button
        className={`followpill${following ? " on" : ""}`}
        disabled={pending}
        onClick={toggle}
      >
        {following ? (
          <>
            <Icon name="check" size={17} /> Following
          </>
        ) : (
          "Follow"
        )}
      </button>
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
