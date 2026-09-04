"use client";

import { useState, useTransition, type ReactNode } from "react";
import { joinOpenGroup, respondToGroupInvitation } from "@/app/actions/groups";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { SignupPrompt } from "@/components/SignupPrompt";

export function GroupActions({ slug, manager, joined, joinable, invitationRole, children }: { slug: string; name: string; initialFavorite: boolean; manager: boolean; joined: boolean; joinable: boolean; invitationRole?: string | null; children?:ReactNode }) {
  const router = useRouter();
  const [isJoined, setIsJoined] = useState(joined);
  const [signup, setSignup] = useState(false);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const join = () => start(async () => {
    const result = await joinOpenGroup(slug);
    if ("signedOut" in result && result.signedOut) return setSignup(true);
    if (!result.ok) return toast("We couldn’t join that group");
    setIsJoined(true);
    toast("You joined the group");
    router.refresh();
  });
  return <>{invitationRole && <div className="group-invitation"><span><strong>You&rsquo;re invited</strong><small>Join as {invitationRole === "admin" ? "an admin" : "a member"}.</small></span><div><button type="button" disabled={pending} onClick={() => start(async () => { await respondToGroupInvitation(slug, false); router.refresh(); })}>Not now</button><button type="button" disabled={pending} onClick={() => start(async () => { const result = await respondToGroupInvitation(slug, true); if (result.ok) { setIsJoined(true); toast("You joined the group"); router.refresh(); } })}>{pending ? "Joining…" : "Join group"}</button></div></div>}<div className="profacts">{!manager && !invitationRole && joinable && (isJoined ? <span className="actpill actpill-primary"><Icon name="groups" size={20}/>Joined</span> : <button type="button" className="actpill actpill-primary" disabled={pending} onClick={join}><Icon name="groups" size={20}/>{pending ? "Joining…" : "Join group"}</button>)}{children}</div><Toast msg={toastMsg} on={toastOn} /><SignupPrompt open={signup} onClose={()=>setSignup(false)} next={`/g/${slug}`} title="Join this group" body="Sign up to get group updates, join the conversation, and keep up with new classes." /></>;
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
