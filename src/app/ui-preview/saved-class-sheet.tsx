"use client";
import { useEffect, useState } from "react";
import { CalendarDays, Check, Copy, Plus, Users, X } from "@/components/PhosphorIcons";
import { dateLabel, timeLabel, usePrototype } from "./prototype-state";
import styles from "./preview.module.css";

export default function SavedClassSheet({onCreateGroup}:{onCreateGroup:()=>void}) {
  const p=usePrototype();
  const item=p.savedClassConfirmation;
  const [addedGroups,setAddedGroups]=useState<Record<string,boolean>>({});
  useEffect(()=>setAddedGroups({}),[item?.id]);
  if(!item)return null;
  const close=()=>p.setSavedClassConfirmation(null);
  const viewCalendar=()=>{close();p.reset();window.dispatchEvent(new Event("preview-view-saved-calendar"));};
  const addToGroup=(id:string)=>setAddedGroups(value=>({...value,[id]:true}));
  return <div className={styles.savedClassOverlay} onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
    <section className={styles.savedClassSheet} role="dialog" aria-modal="true" aria-labelledby="saved-class-title">
      <button className={styles.savedClassClose} aria-label="Close" onClick={close}><X size={20}/></button>
      <span className={styles.savedClassSuccess}><Check size={25} weight="bold"/></span>
      <h2 id="saved-class-title">Saved to your calendar</h2>
      <p className={styles.savedClassSummary}><strong>{item.name}</strong><span>{dateLabel(item.date)} at {timeLabel(item.time)} · {item.place}</span></p>
      <button className={styles.savedClassShare} onClick={viewCalendar}><CalendarDays size={19}/>View it on your calendar</button>
      <div className={styles.savedClassGroups}>
        <h3>Add to a group</h3>
        {Object.entries(p.joinedGroups).map(([id,name])=>{
          const added=Boolean(addedGroups[id]);
          return <button key={id} aria-pressed={added} onClick={()=>addToGroup(id)}>
            <span><Users size={18}/></span>
            <span className={styles.savedClassGroupCopy}><strong>{name}</strong>{added&&<small>Added to this group</small>}</span>
            {added?<span className={styles.savedClassGroupCheck} aria-label={`Added to ${name}`}><Check size={17} weight="bold"/></span>:<Plus size={18}/>}
          </button>;
        })}
        <button className={styles.savedClassCreate} onClick={()=>{close();onCreateGroup();}}><span><Plus size={18}/></span><strong>Create a new group</strong><Copy size={17}/></button>
      </div>
    </section>
  </div>;
}
