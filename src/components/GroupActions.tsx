"use client";

import { useState, useTransition, type ReactNode } from "react";
import { respondToGroupInvitation, toggleGroupFavorite } from "@/app/actions/groups";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

export function GroupActions({ slug, initialFavorite, manager, invitationRole, children }: { slug: string; name: string; initialFavorite: boolean; manager: boolean; invitationRole?: string | null; children?:ReactNode }) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(initialFavorite);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  return <>{invitationRole && <div className="group-invitation"><span><strong>You&rsquo;re invited</strong><small>Join as {invitationRole === "admin" ? "an admin" : "a member"}.</small></span><div><button type="button" disabled={pending} onClick={() => start(async () => { await respondToGroupInvitation(slug, false); router.refresh(); })}>Not now</button><button type="button" disabled={pending} onClick={() => start(async () => { const result = await respondToGroupInvitation(slug, true); if (result.ok) { toast("You joined the group"); router.refresh(); } })}>{pending ? "Joining…" : "Join group"}</button></div></div>}<div className="profacts">{!manager && <button type="button" className={`actpill favorite${favorite ? " on" : ""}`} disabled={pending} onClick={() => start(async () => { const result = await toggleGroupFavorite(slug); if (!result.ok || result.selected === undefined) return; setFavorite(result.selected); toast(result.selected ? "Calendar saved" : "Calendar removed"); })}><Icon name={favorite ? "favorite_filled" : "favorite"} size={20} />{favorite ? "Saved" : "Save calendar"}</button>}{children}</div><Toast msg={toastMsg} on={toastOn} /></>;
}

export function GroupShareButton({ slug, name, pill=false }: { slug: string; name: string; pill?:boolean }) {
  const [toastMsg, toastOn, toast] = useToast();
  const share = async () => {
    const url = `${window.location.origin}/g/${slug}`;
    if (navigator.share) await navigator.share({ title: name, url }).catch(() => undefined);
    else { await navigator.clipboard.writeText(url); toast("Group link copied"); }
  };
  return <><button type="button" className={pill?"actpill":"group-header-control"} aria-label="Share group" onClick={share}><Icon name="reply" className="share-arrow-forward" size={21} />{pill&&<span>Share</span>}</button><Toast msg={toastMsg} on={toastOn} /></>;
}
