"use client";

import { useState,type ReactNode } from "react";
import { Icon } from "@/components/Icon";

export function ProfileInfoAction({title="About",children}:{title?:string;children:ReactNode}){
  const [open,setOpen]=useState(false);
  return <>
    <button type="button" className="actpill" onClick={()=>setOpen(true)}><Icon name="info" size={19}/>{title}</button>
    {open&&<div className="sheet-scrim" onClick={(event)=>{if(event.target===event.currentTarget)setOpen(false);}}><section className="sheet profile-info-sheet" role="dialog" aria-modal="true" aria-labelledby="profile-info-action-title"><button type="button" className="iconbtn sheetclose sheet-dismiss" aria-label={`Close ${title}`} onClick={()=>setOpen(false)}><Icon name="close" size={20}/></button><h2 id="profile-info-action-title">{title}</h2>{children}</section></div>}
  </>;
}
