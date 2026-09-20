"use client";
import { ArrowLeft } from "@/components/PhosphorIcons";
import { ShareHubScreen, type HubItem } from "@/components/ShareHubScreen";
import { usePrototype, timeLabel } from "./prototype-state";
import styles from "./preview.module.css";

export default function SharePreview({onBack}:{onBack:()=>void}) {
  const p=usePrototype();
  const items:HubItem[]=p.schedule.filter(item=>!p.live || item.own || p.saved.includes(item.id)).map(item=>({key:item.id,iso:item.date,time:timeLabel(item.time),name:item.name,where:item.place,who:item.coach,own:true,coaching:item.own ?? (item.coach===p.profile.name||item.coach==="Matt LeGrice")}));
  const from=[...p.schedule].sort((a,b)=>a.date.localeCompare(b.date))[0]?.date || "2026-09-20";
  return <div className={`${styles.mainShareEditor} preview-share-editor`}>
    <button className={styles.backButton} onClick={onBack}><ArrowLeft size={19}/>Back to Calendar</button>
    <div className={styles.sharePlanBar}><span>{p.pro?"Pro · Unlimited exports":`${Math.max(0,10-p.exportsUsed)} of 10 exports left this month`}</span><button onClick={()=>p.open({kind:"membership"})}>{p.pro?"Manage plan":"Explore Pro"}</button></div>
    {!p.pro && <p className={styles.prototypeNote}>Plain is included. Preview any style; other designs require Pro to export.</p>}
    <details className={styles.planDemo}><summary>Preview membership controls</summary><button onClick={()=>p.setExportsUsed(10)}>Simulate monthly limit</button><button onClick={()=>p.setExportsUsed(0)}>Reset export count</button><button onClick={()=>p.setPro(!p.pro)}>Switch to {p.pro?"Free":"Pro"}</button></details>
    <ShareHubScreen onPreviewCanExport={style=>{if(p.pro)return true;const reason=p.exportsUsed>=10?"You’ve used your 10 free exports this month. Go Pro for unlimited sharing.":style!=="plain"?"Make this design yours with Pro. Plain is always included in Free.":null;if(reason){p.open({kind:"membership",name:reason});return false;}return true;}} onPreviewExported={()=>p.setExportsUsed(n=>n+1)} onPreviewCanSaveLook={count=>{if(p.pro||count<1)return true;p.open({kind:"membership",name:"Keep a look for every kind of week. Pro includes unlimited saved looks."});return false;}} embedded previewMode coach handle={p.profile.handle} name={p.profile.name} items={items} defaultFrom={from} today={from} savedHeadline="My week in motion" hasBackground={false} studios={[]} templates={[]} customTypes={[]} lastUsed={{startTime:"18:00",durationMin:60,studioId:null}} initialRevision={1} initialDesign={null} savedLooks={[]} onPreviewAdd={()=>p.open({kind:"add-class"})} onPreviewEdit={key=>p.open({kind:"edit-class",name:key})}/>
  </div>;
}
