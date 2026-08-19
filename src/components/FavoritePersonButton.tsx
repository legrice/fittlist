"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { Icon } from "@/components/Icon";
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
      toast(`${person.name} removed from favorites`);
    } else {
      const result = await followTrainer(person.handle);
      if (!result.ok) return;
      if (result.requested) {
        setRequested(true);
        toast(`Favorite request sent to ${person.name}`);
      } else {
        setFavorited(true);
        if (!followHintOff()) setHint(true);
      }
    }
    router.refresh();
  });
  const label = favorited ? "Favorited" : requested ? "Requested" : "Add to favorites";
  const firstName=person.name.trim().split(/\s+/)[0]||person.name;
  return <><button type="button" className={`discover-favorite-person${favorited || requested ? " on" : ""}`} disabled={pending} onClick={toggle} aria-label={`${label}: ${person.name}`}><Icon name={favorited ? "favorite_filled" : "favorite"} size={17} /><span>{label}</span></button><BodyPortal><FollowHint name={firstName} handle={person.handle} on={hint} onClose={()=>setHint(false)}/></BodyPortal><Toast msg={toastMsg} on={toastOn} /></>;
}
