"use client";

import { useState } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { ReportContentButton } from "@/components/ReportContentButton";

export function ProfileOverflow({profileId}:{profileId:string}){
  const [open,setOpen]=useState(false);
  return <>
    <button type="button" className="calendar-pin-button profile-overflow-trigger" aria-label="More profile actions" aria-expanded={open} onClick={()=>setOpen(true)}><Icon name="more_horiz" size={23}/></button>
    <BodyPortal>{open&&<div className="sheet-scrim" onClick={(event)=>{if(event.target===event.currentTarget)setOpen(false);}}><section className="sheet profile-overflow-sheet" role="dialog" aria-modal="true" aria-label="Profile actions"><button type="button" className="iconbtn sheetclose" aria-label="Close profile actions" onClick={()=>setOpen(false)}><Icon name="close" size={18}/></button><h2>Profile actions</h2><ReportContentButton contentType="profile" contentId={profileId} label="Report profile" canBlock className="profile-overflow-item"/></section></div>}</BodyPortal>
  </>;
}
