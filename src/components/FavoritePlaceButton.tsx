"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleStudioVisit } from "@/app/actions/endorsements";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import type { DirStudio } from "@/components/DirectoryRows";

export function FavoritePlaceButton({ studio }: { studio: DirStudio }) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(!!studio.favorited);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  return <><button type="button" className={`discover-favorite-place save-ribbon-only${favorited ? " on" : ""}`} disabled={pending} aria-label={`${favorited ? "Remove" : "Save"} ${studio.name} calendar`} onClick={() => start(async () => { const result = await toggleStudioVisit(studio.slug); if (!result.ok) return; const next = !!result.selected; setFavorited(next); toast(`${studio.name} calendar ${next ? "saved" : "removed"}`); router.refresh(); })}><Icon name={favorited ? "bookmark_added" : "bookmark"} size={20} /></button><Toast msg={toastMsg} on={toastOn} /></>;
}
