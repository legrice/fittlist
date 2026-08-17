"use client";

import { useState, useTransition } from "react";
import { respondToGroupInvitation, toggleGroupFavorite } from "@/app/actions/groups";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

export function GroupActions({ slug, name, initialFavorite, manager, invitationRole }: { slug: string; name: string; initialFavorite: boolean; manager: boolean; invitationRole?: string | null }) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(initialFavorite);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const share = async () => {
    const url = `${window.location.origin}/g/${slug}`;
    if (navigator.share) await navigator.share({ title: name, url }).catch(() => undefined);
    else { await navigator.clipboard.writeText(url); toast("Group link copied"); }
  };
  return <>{invitationRole && <div className="group-invitation"><span><strong>You&rsquo;re invited</strong><small>Join as {invitationRole === "admin" ? "an admin" : "a member"}.</small></span><div><button type="button" disabled={pending} onClick={() => start(async () => { await respondToGroupInvitation(slug, false); router.refresh(); })}>Not now</button><button type="button" disabled={pending} onClick={() => start(async () => { const result = await respondToGroupInvitation(slug, true); if (result.ok) { toast("You joined the group"); router.refresh(); } })}>{pending ? "Joining…" : "Join group"}</button></div></div>}<div className="group-actions">{!manager && <button type="button" className={`group-action favorite${favorite ? " on" : ""}`} disabled={pending} onClick={() => start(async () => { const result = await toggleGroupFavorite(slug); if (!result.ok || result.selected === undefined) return; setFavorite(result.selected); toast(result.selected ? "Added to favorites" : "Removed from favorites"); })}><Icon name={favorite ? "favorite_filled" : "favorite"} size={20} />{favorite ? "Favorited" : "Favorite"}</button>}<button type="button" className="group-action" onClick={share}><Icon name="reply" className="share-arrow-forward" size={20} />Share</button></div><Toast msg={toastMsg} on={toastOn} /></>;
}
