"use client";

import { useState } from "react";
import { ChatCircle, Heart, X } from "@/components/PhosphorIcons";
import styles from "./preview.module.css";

type Comment = { name:string; initials:string; text:string };
type Update = { id:string; initials:string; name:string; when:string; body:string; comments:Comment[]; className?:string };

export default function GroupSampleUpdates({ live, running }: { live:boolean; running:boolean }) {
  const updates:Update[]=[
    {id:"week-plan",initials:"EC",name:"Erin Clyne",when:"Today",body:running?"Saturday run: meet by the waterfront at 8. Easy pace, and coffee afterward. Everyone is welcome.":"Who’s joining us this week? Bring a friend. There’s room for every experience level.",comments:[{name:"Alex Lee",initials:"AL",text:"I’m in! See you there."},{name:"Sam Chen",initials:"SC",text:"Count me in too."},{name:"Freddie Morgan",initials:"FM",text:"Can’t wait!"}]},
    {id:"class-plan",initials:"FM",name:"Freddie Morgan",when:"Yesterday",body:"Added a class to the calendar",className:running?"Weekend run":"Strength & mobility",comments:[{name:"Erin Clyne",initials:"EC",text:"This looks great. I saved it."}]},
  ];
  const [liked,setLiked]=useState<string[]>([]);
  const [activeComments,setActiveComments]=useState<string|null>(null);
  const [reply,setReply]=useState("");
  const [addedComments,setAddedComments]=useState<Record<string,Comment[]>>({});
  if(live)return <p className={styles.sectionIntro}>Group updates aren’t connected in this preview yet.</p>;
  const active=updates.find(update=>update.id===activeComments);
  const comments=active?[...active.comments,...(addedComments[active.id]||[])]:[];
  const addComment=()=>{if(!active||!reply.trim())return;setAddedComments(value=>({...value,[active.id]:[...(value[active.id]||[]),{name:"You",initials:"ML",text:reply.trim()}]}));setReply("");};
  return <>
    <div className={styles.groupUpdatesFeed}>{updates.map(update=>{const commentCount=update.comments.length+(addedComments[update.id]?.length||0);const isLiked=liked.includes(update.id);return <article className={styles.sampleUpdate} key={update.id}>
      <header><span>{update.initials}</span><div><strong>{update.name}</strong><small>{update.when}</small></div></header>
      <p className={styles.groupUpdateBody}>{update.body}</p>
      {update.className&&<div className={styles.groupUpdateClass}><strong>{update.className}</strong><span>Saturday · 9:00 AM</span><span>Jersey City</span></div>}
      <div className={styles.groupUpdateActions}>
        <button aria-label={isLiked?"Unlike update":"Like update"} aria-pressed={isLiked} onClick={()=>setLiked(value=>isLiked?value.filter(id=>id!==update.id):[...value,update.id])}><Heart size={21} weight={isLiked?"fill":"regular"}/><span>{isLiked?4:3}</span></button>
        <button aria-label={`View ${commentCount} comments`} onClick={()=>setActiveComments(update.id)}><ChatCircle size={21}/><span>Comments</span>{commentCount>0&&<b>{commentCount}</b>}</button>
      </div>
    </article>})}</div>
    {active&&<div className={styles.groupCommentsOverlay} onMouseDown={event=>{if(event.target===event.currentTarget)setActiveComments(null);}}><section className={styles.groupCommentsSheet} role="dialog" aria-modal="true" aria-labelledby="group-comments-title">
      <div className={styles.groupCommentsHandle}/><header><div><small>{active.when}</small><h2 id="group-comments-title">Comments</h2></div><button aria-label="Close comments" onClick={()=>setActiveComments(null)}><X size={20}/></button></header>
      <div className={styles.groupCommentList}>{comments.map((comment,index)=><div key={`${comment.name}-${index}`}><span>{comment.initials}</span><p><strong>{comment.name}</strong>{comment.text}</p></div>)}</div>
      <form onSubmit={event=>{event.preventDefault();addComment();}}><input aria-label="Add a comment" value={reply} onChange={event=>setReply(event.target.value)} placeholder="Add a comment"/><button disabled={!reply.trim()}>Post</button></form>
    </section></div>}
  </>;
}
