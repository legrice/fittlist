"use client";
import { ArrowLeft } from "lucide-react";
import { ShareHubScreen, type HubItem } from "@/components/ShareHubScreen";
import { usePrototype, timeLabel } from "./prototype-state";
import styles from "./preview.module.css";

export default function SharePreview({onBack}:{onBack:()=>void}) {
  const p=usePrototype();
  const items:HubItem[]=p.schedule.filter(item=>!p.live || item.own || p.saved.includes(item.id)).map(item=>({key:item.id,iso:item.date,time:timeLabel(item.time),name:item.name,where:item.place,who:item.coach,own:true,coaching:item.own ?? (item.coach===p.profile.name||item.coach==="Matt LeGrice")}));
  const from=[...p.schedule].sort((a,b)=>a.date.localeCompare(b.date))[0]?.date || "2026-09-20";
  return <div className={`${styles.mainShareEditor} preview-share-editor`}>
    <button className={styles.backButton} onClick={onBack}><ArrowLeft size={19}/>Back to Calendar</button>
    <ShareHubScreen embedded previewMode coach handle={p.profile.handle} name={p.profile.name} items={items} defaultFrom={from} today={from} savedHeadline="My week in motion" hasBackground={false} studios={[]} templates={[]} customTypes={[]} lastUsed={{startTime:"18:00",durationMin:60,studioId:null}} initialRevision={1} initialDesign={null} savedLooks={[]} onPreviewAdd={()=>p.open({kind:"add-class"})} onPreviewEdit={key=>p.open({kind:"edit-class",name:key})}/>
  </div>;
}
