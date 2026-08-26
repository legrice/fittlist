"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { addGroupComment, addGroupPost, toggleGroupReaction } from "@/app/actions/groups";
import { setGoing } from "@/app/actions/going";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

export type GroupUpdate = {
  id:string; kind:string; body:string | null; createdAt:string;
  author:{ name:string; photo:string | null; color:string };
  cls:{ id:string; iso:string; name:string; detail:string; where:string; saved:boolean } | null;
  comments:{ id:string; body:string; author:{ name:string; photo:string | null; color:string } }[];
  reactions:{ reaction:string; count:number; mine:boolean }[];
};

export function GroupHub({ slug, canPost, updates, schedule, members, initialTab="schedule" }: { slug:string; canPost:boolean; updates:GroupUpdate[]; schedule:ReactNode; members:ReactNode; initialTab?:"schedule"|"updates"|"members" }) {
  const [tab,setTab]=useState(initialTab);
  return <><div className="group-tabs" role="tablist"><button className={tab==="schedule"?"on":""} onClick={()=>setTab("schedule")}>Upcoming</button><button className={tab==="updates"?"on":""} onClick={()=>setTab("updates")}>Updates{updates.length > 0 && <span>{updates.length}</span>}</button><button className={tab==="members"?"on":""} onClick={()=>setTab("members")}>Members</button></div>{tab==="schedule" ? schedule : tab==="updates" ? <GroupUpdates slug={slug} canPost={canPost} updates={updates} /> : members}</>;
}

function GroupUpdates({ slug, canPost, updates }: { slug:string; canPost:boolean; updates:GroupUpdate[] }) {
  const router=useRouter(); const [text,setText]=useState(""); const [pending,start]=useTransition(); const [toastMsg,toastOn,toast]=useToast();
  const post=()=>start(async()=>{ const result=await addGroupPost(slug,text); if(!result.ok) return toast(result.error); setText(""); router.refresh(); });
  return <section className="group-updates">{canPost && <div className="group-composer"><textarea value={text} maxLength={500} onChange={(e)=>setText(e.target.value)} placeholder="Share an update with the group" /><button disabled={pending || !text.trim()} onClick={post}><Icon name="send" size={20} />Post</button></div>}{updates.length ? <div className="group-feed">{updates.map((update)=><UpdateCard slug={slug} update={update} key={update.id} />)}</div> : <div className="group-updates-empty"><Icon name="forum" size={30} /><h2>No updates yet</h2><p>Classes added to the group and member posts will appear here.</p></div>}<Toast msg={toastMsg} on={toastOn} /></section>;
}

function UpdateCard({ slug, update }: { slug:string; update:GroupUpdate }) {
  const router=useRouter(); const [comment,setComment]=useState(""); const [pending,start]=useTransition(); const [toastMsg,toastOn,toast]=useToast();
  const react=(reaction:"heart"|"strong"|"in")=>start(async()=>{ await toggleGroupReaction(slug,update.id,reaction); router.refresh(); });
  const reply=()=>start(async()=>{ const result=await addGroupComment(slug,update.id,comment); if(!result.ok) return toast(result.error); setComment(""); router.refresh(); });
  const save=()=>start(async()=>{ if(!update.cls) return; const result=await setGoing(update.cls.id,update.cls.iso,!update.cls.saved); if(!result.ok) return toast(result.error ?? "Couldn’t update your calendar"); toast(update.cls.saved?"Removed from your calendar":"Saved to your calendar"); router.refresh(); });
  return <article className="group-update-card" id={`post-${update.id}`}><header><Avatar person={update.author}/><div><strong>{update.author.name}</strong><small>{new Date(update.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</small></div></header>{update.kind==="class_added" && <p className="group-activity-label">Added a class to the calendar</p>}{update.body && <p className="group-update-body">{update.body}</p>}{update.cls && <div className="group-update-class"><div><small>{update.cls.detail}</small><strong>{update.cls.name}</strong><span>{update.cls.where}</span></div><button disabled={pending} className={update.cls.saved?"saved":""} onClick={save} aria-label={update.cls.saved?`Remove ${update.cls.name} from your calendar`:`Save ${update.cls.name} to your calendar`}><Icon name={update.cls.saved?"bookmark_added":"bookmark"} size={18}/></button></div>}<div className="group-reactions">{([["heart","❤️"],["strong","💪"],["in","I’m in"]] as const).map(([key,label])=>{const value=update.reactions.find((r)=>r.reaction===key); return <button className={value?.mine?"on":""} onClick={()=>react(key)} key={key}>{label}{value?.count ? ` ${value.count}`:""}</button>})}</div>{update.comments.length > 0 && <div className="group-comments">{update.comments.map((item)=><div key={item.id}><Avatar person={item.author}/><p><strong>{item.author.name}</strong> {item.body}</p></div>)}</div>}<div className="group-comment-form"><input value={comment} maxLength={300} onChange={(e)=>setComment(e.target.value)} placeholder="Write a reply"/><button disabled={pending || !comment.trim()} onClick={reply} aria-label="Post reply"><Icon name="send" size={18}/></button></div><Toast msg={toastMsg} on={toastOn}/></article>;
}

function Avatar({ person }: { person:{name:string;photo:string|null;color:string} }) { return person.photo ? <img className="group-update-avatar" src={person.photo} alt="" loading="lazy" decoding="async" /> : <span className="group-update-avatar" style={{background:person.color}}>{person.name.charAt(0).toUpperCase()}</span>; }
