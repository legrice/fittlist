"use client";
import { ClassLine } from "@/components/WeekView";
import { usePrototype, timeLabel, type PreviewClass } from "./prototype-state";
import styles from "./preview.module.css";

export function classTimeRange(item: PreviewClass) {
  const [hours,minutes]=item.time.split(":").map(Number);
  const end=(hours*60+minutes+Number(item.duration))%(24*60);
  const endTime=`${String(Math.floor(end/60)).padStart(2,"0")}:${String(end%60).padStart(2,"0")}`;
  return `${timeLabel(item.time)} – ${timeLabel(endTime)}`;
}
export default function PreviewClassCard({item}:{item:PreviewClass}) {
  const p=usePrototype();
  const own=item.own ?? (item.coach===p.profile.name || item.coach==="Matt LeGrice");
  const saved=p.saved.includes(item.id);
  const [hm,ap]=timeLabel(item.time).split(" ");
  if(own) return <div className={`personal-calendar-list calendar-cardlist ${styles.mainBranchClasses}`}><div className="clrow"><ClassLine row={{key:item.id,name:item.name,where:item.place,hm,ap,dur:`${item.duration} min`,onTap:()=>p.open({kind:"class",name:item.id})}}/></div></div>;
  return <article className={`activity-card calendar-following-card ${styles.mainBranchClasses}`} aria-label={item.name}>
    <button type="button" className="activity-card-main" onClick={()=>p.open({kind:"class",name:item.id})}>
      <span className="explore-class-coach"><span className="clline-coach-face">{item.photo ? <img src={item.photo} alt=""/> : <span>{item.coach.charAt(0)}</span>}</span><span>{item.coach}</span></span>
      <span className="explore-class-time">{hm}<small>{ap}</small></span><strong className="explore-class-name">{item.name}</strong>
      <span className="explore-class-duration">{item.duration} min</span><span className="explore-class-studio">{item.place}</span>
    </button>
    <div className="explore-save-row"><button type="button" className={`explore-save-button${saved?" on":""}`} aria-label={`${saved?"Unsave":"Save"} ${item.name}`} aria-pressed={saved} onClick={()=>p.toggleSaved(item)}>{saved?"Saved":"Save"}</button></div>
  </article>;
}
