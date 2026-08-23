"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleStudioVisit } from "@/app/actions/endorsements";
import { Toast, useToast } from "@/components/Toast";
import type { DirStudio } from "@/components/DirectoryRows";

export function FavoritePlaceButton({ studio }: { studio: DirStudio }) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(!!studio.favorited);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const label=favorited?"Following":"Follow";
  return <><button type="button" className={`discover-follow-button discover-follow-place${favorited ? " on" : ""}`} disabled={pending} aria-label={`${label}: ${studio.name}`} aria-pressed={favorited} onClick={() => start(async () => { const result = await toggleStudioVisit(studio.slug); if (!result.ok) return; const next = !!result.selected; setFavorited(next); toast(`${next ? "Following" : "Unfollowed"} ${studio.name}`); router.refresh(); })}>{label}</button><Toast msg={toastMsg} on={toastOn} /></>;
}
