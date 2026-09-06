"use client";

import { useState, type ReactNode } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { ReportContentButton } from "@/components/ReportContentButton";
import { ProfileShare } from "@/components/ProfileShare";

export function ProfileOverflow({profileId,path,name,children,canReport=true}:{profileId:string;path:string;name:string;children?:ReactNode;canReport?:boolean}){
  const [open,setOpen]=useState(false);
  return <>
    <button type="button" className="calendar-pin-button profile-overflow-trigger" aria-label="More profile actions" aria-expanded={open} onClick={()=>setOpen(true)}><Icon name="more_horiz" size={23}/></button>
    <BodyPortal>{open&&<div className="sheet-scrim" onClick={(event)=>{if(event.target===event.currentTarget)setOpen(false);}}><section className="sheet profile-overflow-sheet profile-overflow-centered" role="dialog" aria-modal="true" aria-label="Profile actions"><button type="button" className="iconbtn sheetclose sheet-dismiss" aria-label="Close profile actions" onClick={()=>setOpen(false)}><Icon name="close" size={20}/></button><h2>Profile actions</h2><div className="profile-overflow-items"><ProfileShare path={path} name={name} pill pillText="Share profile"/>{children}{canReport && <ReportContentButton contentType="profile" contentId={profileId} label="Report profile" canBlock className="profile-overflow-item"/>}</div></section></div>}</BodyPortal>
  </>;
}
