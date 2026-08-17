"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { Icon } from "@/components/Icon";
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
      toast(`${person.name} removed from favorites`);
    } else {
      const result = await followTrainer(person.handle);
      if (!result.ok) return;
      if (result.requested) {
        setRequested(true);
        toast(`Favorite request sent to ${person.name}`);
      } else {
        setFavorited(true);
        toast(`${person.name} added to favorites`);
      }
    }
    router.refresh();
  });
  const label = favorited ? "Favorited" : requested ? "Requested" : "Add to favorites";
  return <><button type="button" className={`discover-favorite-person${favorited || requested ? " on" : ""}`} disabled={pending} onClick={toggle} aria-label={`${label}: ${person.name}`}><Icon name="favorite" size={17} /><span>{label}</span></button><Toast msg={toastMsg} on={toastOn} /></>;
}
