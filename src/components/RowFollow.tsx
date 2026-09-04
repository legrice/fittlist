"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { Icon } from "@/components/Icon";

// The directory row's Follow pill.
//
// It sits beside the name in the corner the chevron used to have to itself,
// and it is the same `.disfollow` the followers and blocked lists wear, so
// there is one inline follow control rather than one per list.
//
export function RowFollow({
  handle,
  name,
  following: initialFollowing,
  requested: initialRequested,
  calendarLanguage = false,
}: {
  handle: string;
  name: string;
  following: boolean;
  requested: boolean;
  /** Use calendar-first language in discovery without changing relationship data. */
  calendarLanguage?: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [requested, setRequested] = useState(initialRequested);
  const [pending, start] = useTransition();

  const toggle = (e: React.MouseEvent) => {
    // The row underneath is a link to their page. Following is a thing you do
    // without going there, which is the whole point of the pill.
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    start(async () => {
      if (following || requested) {
        const res = await unfollowTrainer(handle);
        if (!res.ok) return;
        setFollowing(false);
        setRequested(false);
        window.dispatchEvent(new Event("calendar-pins-changed"));
      } else {
        const res = await followTrainer(handle);
        if (!res.ok) return;
        if (res.requested) setRequested(true);
        else setFollowing(true);
      }
      router.refresh();
    });
  };

  return (
      <button
        type="button"
        className={`disfollow${following || requested ? " on" : ""}`}
        disabled={pending}
        aria-label={
          calendarLanguage
            ? following
              ? `Remove ${name}'s saved calendar`
              : requested
                ? `Cancel your request to save ${name}'s calendar`
                : `Save ${name}'s calendar`
            : following
              ? `Unfollow ${name}`
              : requested
                ? `Cancel your follow request to ${name}`
                : `Follow ${name}`
        }
        onClick={toggle}
      >
        {calendarLanguage
          ? <Icon name={following ? "bookmark_added" : requested ? "schedule" : "bookmark"} size={19} />
          : following ? "Following" : requested ? "Requested" : "Follow"}
      </button>
  );
}
