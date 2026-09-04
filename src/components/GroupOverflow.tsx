"use client";

import { useState } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { GroupShareButton } from "@/components/GroupActions";
import { Icon } from "@/components/Icon";
import { ReportContentButton } from "@/components/ReportContentButton";

export function GroupOverflow({ id, slug, name, canReport }: { id:string; slug:string; name:string; canReport:boolean }) {
  const [open,setOpen]=useState(false);
  return <>
    <button type="button" className="group-header-control group-overflow-trigger" aria-label="More group actions" aria-expanded={open} onClick={()=>setOpen(true)}><Icon name="more_horiz" size={23}/></button>
    <BodyPortal>{open&&<div className="sheet-scrim" onClick={(event)=>{if(event.target===event.currentTarget)setOpen(false);}}><section className="sheet profile-overflow-sheet profile-overflow-centered" role="dialog" aria-modal="true" aria-label="Group actions"><button type="button" className="iconbtn sheetclose" aria-label="Close group actions" onClick={()=>setOpen(false)}><Icon name="close" size={18}/></button><h2>Group actions</h2><div className="profile-overflow-items"><GroupShareButton slug={slug} name={name} pill/>{canReport&&<ReportContentButton contentType="group" contentId={id} label="Report group" className="profile-overflow-item"/>}</div></section></div>}</BodyPortal>
  </>;
}
