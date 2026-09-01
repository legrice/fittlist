"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

export function ProfilePhotoZoom({ photo, name, color, className }: { photo:string|null; name:string; color:string; className:string }) {
  const [open,setOpen]=useState(false);
  const initial=(name.trim().charAt(0)||"?").toUpperCase();
  return <>
    <button type="button" className={`${className} profile-photo-zoom-trigger`} aria-label={`View ${name} photo`} onClick={()=>setOpen(true)}>
      {photo?<img src={photo} alt=""/>:<span style={{background:color}}>{initial}</span>}
    </button>
    {open&&<div className="profile-photo-zoom" role="dialog" aria-modal="true" aria-label={`${name} photo`} onClick={(event)=>{if(event.target===event.currentTarget)setOpen(false);}}>
      <button type="button" aria-label="Close photo" onClick={()=>setOpen(false)}><Icon name="close" size={22}/></button>
      {photo?<img src={photo} alt={name}/>:<span style={{background:color}}>{initial}</span>}
    </div>}
  </>;
}
