"use client";
import { BackButton } from "@/components/BackButton";
import { useState } from "react";
import { Heart, Share2 } from "@/components/PhosphorIcons";
import { usePrototype } from "./prototype-state";
import styles from "./preview.module.css";
export default function DetailHeader({type,name,id,onBack}:{type:"Group"|"Person"|"Studio"|"Class";name:string;id?:string;onBack:()=>void}) {
 const p=usePrototype();const [status,setStatus]=useState("");const key=`${type}:${id||name}`;const favorite=p.favorites.includes(key);
 const share=async()=>{const url=new URL(window.location.href);url.search="";if(type==="Class")url.searchParams.set("class",id||name);else {url.searchParams.set("detail",type.toLowerCase());url.searchParams.set("name",id||name);}try{if(navigator.share){await navigator.share({title:name,url:url.href});}else{await navigator.clipboard.writeText(url.href);setStatus("Link copied.");}}catch(e){if(!(e instanceof Error&&e.name==="AbortError"))setStatus(url.href);}};
 return <><header className={`${styles.detailNav} ${type==="Class"?styles.classDetailNav:""}`}><BackButton onClick={onBack}/><span aria-hidden="true"/><div><button aria-label={`Share ${type.toLowerCase()}`} onClick={()=>void share()}><Share2 size={21}/></button><button aria-label={`Favorite ${type.toLowerCase()}`} aria-pressed={favorite} onClick={()=>p.setFavorites(v=>favorite?v.filter(k=>k!==key):[...v,key])}><Heart size={21} weight={favorite?"fill":"bold"}/></button></div></header>{status&&<p role="status" className={styles.sectionIntro}>{status}</p>}</>;
}
