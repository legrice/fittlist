"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Info, Globe, MapPin, Phone, Envelope, Share2, X } from "@/components/PhosphorIcons";
import styles from "./preview.module.css";
type Props={name:string;type:string;kind:"person"|"studio"|"group";id?:string;location?:string|null;about?:string|null;coordinates?:number[]|null;website?:string|null;phone?:string|null;contactEmail?:string|null;instagram?:string|null;extra?:ReactNode;action?:ReactNode};
export default function ProfileInfo(p:Props){
 const [overflow,setOverflow]=useState(false),[miles,setMiles]=useState<number|null>(null),[status,setStatus]=useState("");
 const text=useRef<HTMLParagraphElement>(null),dialog=useRef<HTMLDialogElement>(null),aboutDialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const el=text.current;if(!el)return;const check=()=>setOverflow(el.scrollHeight>el.clientHeight+1);check();const observer=new ResizeObserver(check);observer.observe(el);return()=>observer.disconnect();},[p.about]);
 const locate=()=>{if(!p.coordinates||!navigator.geolocation)return;navigator.geolocation.getCurrentPosition(pos=>{const r=(n:number)=>n*Math.PI/180;const [lat,lng]=p.coordinates!;const a=Math.sin(r(lat-pos.coords.latitude)/2)**2+Math.cos(r(lat))*Math.cos(r(pos.coords.latitude))*Math.sin(r(lng-pos.coords.longitude)/2)**2;setMiles(3958.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));},()=>setStatus("Location unavailable. You can still open directions."),{timeout:10000,maximumAge:300000});};
 const directions=()=>{dialog.current?.showModal();locate();};
 const dest=p.location||p.coordinates?.join(",")||"";
 const maps=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
 const share=async()=>{const url=new URL(window.location.href);url.search="";url.searchParams.set("detail",p.kind);url.searchParams.set("name",p.id||p.name);try{if(navigator.share)await navigator.share({title:p.name,url:url.href});else{await navigator.clipboard.writeText(url.href);setStatus("Link copied.");}}catch{setStatus("Sharing wasn’t completed.");}};
 const web=(value:string)=>{try{const u=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`);return ["https:","http:"].includes(u.protocol)?u.href:undefined;}catch{return undefined;}};
 return <section className={styles.profileInfo}>
  <div className={styles.profileMetadata}><span>{p.type}</span>{p.kind==="studio"?p.coordinates&&<button onClick={directions}>{miles===null?"Distance away":`${miles<.1?"<0.1":miles.toFixed(1)} mi away`}</button>:<span>{p.location}</span>}</div>
  <h1 className={styles.pageTitle}>{p.name}</h1>
  {p.kind==="studio"&&dest&&<button className={styles.profileAddress} onClick={directions}>{dest}</button>}
  {p.about&&<><p ref={text} className={styles.profileDescriptionClamped}>{p.about}</p>{overflow&&<button className={styles.profileReadMore} onClick={()=>aboutDialog.current?.showModal()}>Read more</button>}</>}
  <div className={styles.profilePills}>{p.action}{(p.about||p.extra)&&<button onClick={()=>aboutDialog.current?.showModal()}><Info size={16}/>About</button>}{p.website&&web(p.website)&&<a href={web(p.website)} target="_blank" rel="noreferrer"><Globe size={16}/>Website</a>}{p.kind==="studio"&&dest&&<button onClick={directions}><MapPin size={16}/>Directions</button>}{p.phone&&<a href={`tel:${p.phone.replace(/[^+\d]/g,"")}`}><Phone size={16}/>Call</a>}{p.contactEmail&&<a href={`mailto:${p.contactEmail}`}><Envelope size={16}/>Email</a>}{p.instagram&&<a href={`https://www.instagram.com/${p.instagram.replace(/^https?:\/\/(www\.)?instagram.com\//,"").replace(/^@/,"").split(/[/?#]/)[0]}/`} target="_blank" rel="noreferrer">Instagram</a>}{p.kind!=="group"&&<button onClick={()=>void share()}><Share2 size={16}/>Share</button>}</div>
  {status&&<p role="status">{status}</p>}
  <dialog ref={aboutDialog} className={styles.profileAboutSheet} onClick={event=>{if(event.target===event.currentTarget)aboutDialog.current?.close();}}><header><div><small>{p.type}</small><h2>About {p.name}</h2></div><button aria-label="Close about" onClick={()=>aboutDialog.current?.close()}><X size={22}/></button></header>{p.about&&<p>{p.about}</p>}{p.extra&&<div className={styles.profileExtra}>{p.extra}</div>}</dialog>
  <dialog ref={dialog} className={styles.profileLocationDialog}><header><h2>Location</h2><button aria-label="Close location" onClick={()=>dialog.current?.close()}><X size={22}/></button></header><p>{dest}</p><a href={maps} target="_blank" rel="noreferrer">Get directions</a>{[{label:"Walk",mode:"walking",mph:3.1},{label:"Bike",mode:"bicycling",mph:12},{label:"Drive",mode:"driving",mph:27}].map(mode=><a key={mode.mode} href={`${maps}&travelmode=${mode.mode}`} target="_blank" rel="noreferrer"><strong>{mode.label}</strong><span>{miles===null?"Open in Maps":`${Math.max(1,Math.round(miles*1.3/mode.mph*60))} min`}</span></a>)}{miles!==null&&<small>Estimated travel times. Check Maps for routes and traffic.</small>}</dialog>
 </section>;
}
