"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { BodyPortal } from "@/components/BodyPortal";
import { Toast, useToast } from "@/components/Toast";
import type { DirPerson } from "@/components/DirectoryRows";

export function FavoritePersonButton({ person }: { person: DirPerson }) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(person.following);
  const [requested, setRequested] = useState(person.requested);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const toggle = () => start(async () => {
    if (favorited || requested) {
      const result = await unfollowTrainer(person.handle);
      if (!result.ok) return;
      setFavorited(false);
      setRequested(false);
      window.dispatchEvent(new Event("calendar-pins-changed"));
      toast(`${person.name}'s calendar removed`);
    } else {
      const result = await followTrainer(person.handle);
      if (!result.ok) return;
      if (result.requested) {
        setRequested(true);
        toast(`Calendar request sent to ${person.name}`);
      } else setFavorited(true);
    }
    router.refresh();
  });
  const label = favorited ? "Following" : requested ? "Requested" : "Follow";
  return <><button type="button" className={`discover-follow-button${favorited || requested ? " on" : ""}`} disabled={pending} onClick={toggle} aria-label={`${label}: ${person.name}`} aria-pressed={favorited}>{label}</button><BodyPortal><Toast msg={toastMsg} on={toastOn} /></BodyPortal></>;
}
