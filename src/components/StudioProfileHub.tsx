"use client";
import { useState, type ReactNode } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
export function StudioProfileHub({coaches,coachList,schedule}:{coaches:{id:string;name:string;photo:string|null;color:string}[];coachList:ReactNode;schedule:ReactNode}) {
  const [tab,setTab]=useState("schedule");
  const [open,setOpen]=useState(false);
  return <div className="studio-profile-hub"><button className="group-member-preview" onClick={()=>setOpen(true)}><span className="group-member-faces">{coaches.slice(0,5).map(coach=><span key={coach.id} style={{background:coach.color}}>{coach.photo?<img src={coach.photo} alt=""/>:coach.name.charAt(0)}</span>)}</span>{coaches.length} {coaches.length===1?"coach":"coaches"}<Icon name="chevron_right" size={17}/></button><div className="group-tabs group-segmented-tabs" role="tablist" aria-label="Studio content">{["schedule","updates"].map(key=><button role="tab" aria-selected={tab===key} className={tab===key?"on":""} key={key} onClick={()=>setTab(key)}>{key==="schedule"?"Schedule":"Updates"}</button>)}</div>{tab==="schedule"?schedule:<div className="empty-block"><h2>No updates yet</h2><p>There are no studio updates to show.</p></div>}{open&&<BodyPortal><div className="sheet-scrim" onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}}><section className="sheet group-members-sheet" role="dialog" aria-modal="true" aria-label="Studio coaches" onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();setOpen(false);}}}><button autoFocus className="sheetclose sheet-dismiss" aria-label="Close coaches" onClick={()=>setOpen(false)}><Icon name="close" size={20}/></button>{coachList}</section></div></BodyPortal>}</div>;
}
