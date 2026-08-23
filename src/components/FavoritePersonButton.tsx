"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { BodyPortal } from "@/components/BodyPortal";
import { FollowHint, followHintOff } from "@/components/FollowHint";
import { Toast, useToast } from "@/components/Toast";
import type { DirPerson } from "@/components/DirectoryRows";

export function FavoritePersonButton({ person }: { person: DirPerson }) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(person.following);
  const [requested, setRequested] = useState(person.requested);
  const [hint, setHint] = useState(false);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const toggle = () => start(async () => {
    if (favorited || requested) {
      const result = await unfollowTrainer(person.handle);
      if (!result.ok) return;
      setFavorited(false);
      setRequested(false);
      toast(`${person.name}'s calendar removed`);
    } else {
      const result = await followTrainer(person.handle);
      if (!result.ok) return;
      if (result.requested) {
        setRequested(true);
        toast(`Calendar request sent to ${person.name}`);
      } else {
        setFavorited(true);
        if (!followHintOff()) setHint(true);
      }
    }
    router.refresh();
  });
  const label = favorited ? "Following" : requested ? "Requested" : "Follow";
  const firstName=person.name.trim().split(/\s+/)[0]||person.name;
  return <><button type="button" className={`discover-follow-button${favorited || requested ? " on" : ""}`} disabled={pending} onClick={toggle} aria-label={`${label}: ${person.name}`} aria-pressed={favorited}>{label}</button><BodyPortal><FollowHint name={firstName} handle={person.handle} on={hint} onClose={()=>setHint(false)}/></BodyPortal><Toast msg={toastMsg} on={toastOn} /></>;
}
