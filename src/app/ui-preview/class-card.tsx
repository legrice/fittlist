"use client";
import { Bookmark, Check } from "lucide-react";
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
  return <article className={`${styles.scheduleCard} ${own ? styles.teachingCard : ""}`} aria-label={`${item.name}${own?", teaching":""}`}>
    <div className={styles.scheduleCardTop}>
      <button className={styles.classTimeLink} onClick={()=>p.open({kind:"class",name:item.id})}>{classTimeRange(item)}</button>
      {own ? <span className={styles.teachingBadge}>Teaching</span> : <button type="button" className={styles.classSave} aria-label={`${saved?"Unsave":"Save"} ${item.name}`} aria-pressed={saved} onClick={()=>p.setSaved(v=>saved?v.filter(id=>id!==item.id):[...v,item.id])}>{saved?<Check size={17}/>:<Bookmark size={17}/>}<span>{saved?"Saved":"Save"}</span></button>}
    </div>
    <button className={styles.scheduleCardMain} onClick={()=>p.open({kind:"class",name:item.id})}><strong>{item.name}</strong><span>{item.place}</span></button>
    {!own && <button className={styles.scheduleCoach} onClick={()=>p.open({kind:"person",name:item.coach})}>{item.photo ? <img src={item.photo} alt="" className={styles.scheduleCoachAvatar}/> : <span className={styles.scheduleCoachAvatar}>{item.coach.split(" ").map(part=>part[0]).join("").slice(0,2)}</span>}<span>{item.coach}</span></button>}
  </article>;
}
