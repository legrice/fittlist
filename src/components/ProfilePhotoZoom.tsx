"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { BodyPortal } from "@/components/BodyPortal";

export function ProfilePhotoZoom({ photo, name, color, className }: { photo:string|null; name:string; color:string; className:string }) {
  const [open,setOpen]=useState(false);
  const [notice,setNotice]=useState("");
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();setOpen(false);}};
    window.addEventListener("keydown",key);
    return ()=>{window.removeEventListener("keydown",key);trigger.current?.focus();};
  },[open]);
  const initial=(name.trim().charAt(0)||"?").toUpperCase();
  const copy=async()=>{try{await navigator.clipboard.writeText(window.location.href);setNotice("Profile link copied");}catch{setNotice("Couldn’t copy the link");}};
  const share=async()=>{try{if(navigator.share)await navigator.share({title:name,url:window.location.href});else await copy();}catch(error){if(!(error instanceof Error && error.name==="AbortError"))setNotice("Couldn’t share the link");}};
  return <>
    <button ref={trigger} type="button" className={`${className} profile-photo-zoom-trigger`} aria-label={`View ${name} photo`} onClick={()=>{setNotice("");setOpen(true);}}>
      {photo?<img src={photo} alt=""/>:<span style={{background:color}}>{initial}</span>}
    </button>
    {open&&<BodyPortal><div className="profile-photo-viewer" role="dialog" aria-modal="true" aria-label={`${name} photo`} onClick={(event)=>{if(event.target===event.currentTarget)setOpen(false);}}>
      <button autoFocus className="photo-viewer-close" type="button" aria-label="Close photo" onClick={()=>setOpen(false)}><Icon name="close" size={22}/></button>
      <div className="photo-viewer-content">
        {photo?<img className="photo-viewer-image" src={photo} alt={name}/>:<span className="photo-viewer-placeholder" style={{background:color}}>{initial}</span>}
        <div className="photo-viewer-actions">
          <button onClick={()=>void share()}><Icon name="reply" size={24}/>Share</button>
          <button onClick={()=>void copy()}><Icon name="link" size={24}/>Copy link</button>
          {photo&&<a href={photo} target="_blank" rel="noopener noreferrer"><Icon name="open_in_new" size={24}/>Open photo</a>}
        </div>
        <p role="status">{notice}</p>
      </div>
    </div></BodyPortal>}
  </>;
}
