"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleGroupFavorite } from "@/app/actions/groups";
import { Toast, useToast } from "@/components/Toast";

export function FavoriteGroupButton({ group }: { group: { name: string; slug: string; favorited: boolean } }) {
  const router = useRouter();
  const [following, setFollowing] = useState(group.favorited);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const label = following ? "Following" : "Follow";

  return <>
    <button
      type="button"
      className={`discover-follow-button discover-follow-group${following ? " on" : ""}`}
      disabled={pending}
      aria-label={`${label}: ${group.name}`}
      aria-pressed={following}
      onClick={() => start(async () => {
        const result = await toggleGroupFavorite(group.slug);
        if (!result.ok || result.selected === undefined) return;
        setFollowing(result.selected);
        toast(`${result.selected ? "Following" : "Unfollowed"} ${group.name}`);
        router.refresh();
      })}
    >
      {label}
    </button>
    <Toast msg={toastMsg} on={toastOn} />
  </>;
}
