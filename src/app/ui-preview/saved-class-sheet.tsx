"use client";
import { Check, Copy, Plus, Share2, Users, X } from "@/components/PhosphorIcons";
import { dateLabel, timeLabel, usePrototype } from "./prototype-state";
import styles from "./preview.module.css";

export default function SavedClassSheet({onCreateGroup}:{onCreateGroup:()=>void}) {
  const p=usePrototype();
  const item=p.savedClassConfirmation;
  if(!item)return null;
  const close=()=>p.setSavedClassConfirmation(null);
  const share=async()=>{
    const text=`${item.name} with ${item.coach} · ${dateLabel(item.date)} at ${timeLabel(item.time)}`;
    try {
      if(navigator.share)await navigator.share({title:item.name,text,url:window.location.href});
      else {await navigator.clipboard.writeText(`${text}\n${window.location.href}`);p.setSaveNotice("Class link copied.");}
    } catch {}
  };
  const addToGroup=(name:string)=>p.setSaveNotice(`${item.name} added to ${name}.`);
  return <div className={styles.savedClassOverlay} onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
    <section className={styles.savedClassSheet} role="dialog" aria-modal="true" aria-labelledby="saved-class-title">
      <button className={styles.savedClassClose} aria-label="Close" onClick={close}><X size={20}/></button>
      <span className={styles.savedClassSuccess}><Check size={25} weight="bold"/></span>
      <h2 id="saved-class-title">Saved to your calendar</h2>
      <p className={styles.savedClassSummary}><strong>{item.name}</strong><span>{dateLabel(item.date)} at {timeLabel(item.time)} · {item.place}</span></p>
      <button className={styles.savedClassShare} onClick={share}><Share2 size={18}/>Share this class</button>
      <div className={styles.savedClassGroups}>
        <h3>Add to a group</h3>
        {Object.entries(p.joinedGroups).map(([id,name])=><button key={id} onClick={()=>addToGroup(name)}><span><Users size={18}/></span><strong>{name}</strong><Plus size={18}/></button>)}
        <button className={styles.savedClassCreate} onClick={()=>{close();onCreateGroup();}}><span><Plus size={18}/></span><strong>Create a new group</strong><Copy size={17}/></button>
      </div>
    </section>
  </div>;
}
