"use client";
import { MapPin } from "@/components/PhosphorIcons";
import { useEffect, useRef, useState } from "react";
import type { Map as LibreMap, Marker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { usePrototype } from "./prototype-state";
import styles from "./preview.module.css";
export type MapStudio = { name:string; type:string; location:string; photo?:string|null; coordinates:[number,number]|null };
const fallback:StyleSpecification={version:8,sources:{osm:{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}},layers:[{id:"osm",type:"raster",source:"osm"}]};
// Adapted from lift-local: one persistent map, reconciled markers, fallback
// tiles, viewport-aware cards, and resize observation. No Mapbox token needed.
export default function StudioMap({studios,onClose}:{studios:MapStudio[];onClose:()=>void}){
 const p=usePrototype();const panel=useRef<HTMLDivElement>(null),container=useRef<HTMLDivElement>(null),map=useRef<LibreMap|null>(null);
 const markers=useRef(new Map<string,Marker>()),latest=useRef(studios);latest.current=studios;
 const [ready,setReady]=useState(false),[failed,setFailed]=useState(false),[fallbackUsed,setFallbackUsed]=useState(false),[activeName,setActiveName]=useState<string|null>(null),[visible,setVisible]=useState<string[]>([]);
 const rail=useRef<HTMLDivElement>(null),scrollTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(scrollTimer.current)clearTimeout(scrollTimer.current);},[]);
 const located=studios.filter(s=>s.coordinates);const inView=located.filter(s=>visible.includes(s.name));const active=located.find(s=>s.name===activeName)||inView[0];
 const focus=(s:MapStudio,alignCard=true)=>{setActiveName(s.name);if(alignCard){const el=rail.current?.querySelector<HTMLElement>(`[data-studio-index="${latest.current.filter(s=>s.coordinates).findIndex(row=>row.name===s.name)}"]`);if(el&&rail.current)rail.current.scrollTo({left:el.offsetLeft-(rail.current.clientWidth-el.offsetWidth)/2,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});}if(s.coordinates)map.current?.flyTo({center:[s.coordinates[1],s.coordinates[0]],zoom:15,offset:[0,-70],duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:650});};
 const fit=()=>{const rows=latest.current.filter(s=>s.coordinates);if(!rows.length)return;const lngs=rows.map(s=>s.coordinates![1]),lats=rows.map(s=>s.coordinates![0]);map.current?.fitBounds([[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],{padding:{top:75,bottom:230,left:55,right:55},maxZoom:14,duration:0});};
 useEffect(()=>{let disposed=false;let cleanup=()=>{};
  void import("maplibre-gl").then(L=>{if(disposed||!container.current)return;try{
   const dark=!!container.current.closest('[class*="dark"]');
   const m=new L.Map({container:container.current,style:`https://basemaps.cartocdn.com/gl/${dark?'dark-matter':'voyager'}-gl-style/style.json`,center:[-74.05,40.724],zoom:13,attributionControl:{compact:true}});map.current=m;
   // Collapse attribution once it arrives; subsequent user toggles remain untouched.
   const attributionObserver=new MutationObserver(()=>{const el=container.current?.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact:not(.maplibregl-attrib-empty)');if(el){el.classList.remove('maplibregl-compact-show');el.removeAttribute('open');attributionObserver.disconnect();}});
   attributionObserver.observe(container.current,{subtree:true,attributes:true,childList:true});
   m.addControl(new L.NavigationControl({showCompass:false}),"top-right");m.addControl(new L.GeolocateControl({positionOptions:{enableHighAccuracy:false},trackUserLocation:true}),"top-right");
   let usedFallback=false;const recover=()=>{if(usedFallback)return;usedFallback=true;setFallbackUsed(true);m.setStyle(fallback);};
   const report=()=>setVisible(latest.current.filter(s=>s.coordinates&&m.getBounds().contains([s.coordinates[1],s.coordinates[0]])).map(s=>s.name));
   m.on('load',()=>{setReady(true);fit();report();});m.on('moveend',report);m.on('error',()=>{if(!usedFallback&&!m.isStyleLoaded())recover();else setFailed(true);});
   const pinTimer=setTimeout(()=>{setReady(true);fit();report();},1500);
   const timer=setTimeout(()=>{if(!m.isStyleLoaded())recover();},7000);const ro=new ResizeObserver(()=>m.resize());ro.observe(container.current);
   cleanup=()=>{attributionObserver.disconnect();clearTimeout(pinTimer);clearTimeout(timer);ro.disconnect();markers.current.forEach(marker=>marker.remove());markers.current.clear();m.remove();map.current=null;};
  }catch{setFailed(true);}}).catch(()=>setFailed(true));return()=>{disposed=true;cleanup();};
 },[]);
 useEffect(()=>{if(!ready||!map.current)return;let disposed=false;void import('maplibre-gl').then(L=>{if(disposed||!map.current)return;const keep=new Set(studios.filter(s=>s.coordinates).map(s=>s.name));for(const [key,marker] of markers.current){if(!keep.has(key)){marker.remove();markers.current.delete(key);}}for(const studio of studios){if(!studio.coordinates)continue;let marker=markers.current.get(studio.name);if(!marker){const el=document.createElement('button');el.type='button';el.className=styles.librePin;el.setAttribute('aria-label',studio.name);el.title=studio.name;el.innerHTML='<svg viewBox="0 0 24 30" width="32" height="40" aria-hidden="true"><path fill="currentColor" stroke="white" stroke-width="1.5" d="M12 29S1 18 1 12a11 11 0 0 1 22 0c0 6-11 17-11 17Z"/><circle cx="12" cy="12" r="4" fill="white"/></svg>';el.onclick=()=>focus(latest.current.find(s=>s.name===studio.name)||studio);marker=new L.Marker({element:el,anchor:'bottom'}).setLngLat([studio.coordinates[1],studio.coordinates[0]]).addTo(map.current);markers.current.set(studio.name,marker);}marker.getElement().setAttribute('aria-pressed',String(active?.name===studio.name));}
 setVisible(studios.filter(s=>s.coordinates&&map.current!.getBounds().contains([s.coordinates[1],s.coordinates[0]])).map(s=>s.name));});return()=>{disposed=true;};},[studios,ready,active?.name]);
 const onRailScroll=()=>{if(scrollTimer.current)clearTimeout(scrollTimer.current);scrollTimer.current=setTimeout(()=>{const el=rail.current;if(!el)return;const center=el.scrollLeft+el.clientWidth/2;const cards=Array.from(el.querySelectorAll<HTMLElement>('[data-studio-index]'));const nearest=cards.reduce<HTMLElement|null>((best,card)=>!best||Math.abs(card.offsetLeft+card.offsetWidth/2-center)<Math.abs(best.offsetLeft+best.offsetWidth/2-center)?card:best,null);const studio=nearest&&located[Number(nearest.dataset.studioIndex)];if(studio&&studio.name!==active?.name)focus(studio,false);},150);};
 const close=()=>{const el=panel.current;if(!el||window.matchMedia("(prefers-reduced-motion: reduce)").matches){onClose();return;}void el.animate([{transform:"translateX(0)"},{transform:"translateX(100%)"}],{duration:200,easing:"ease-in",fill:"forwards"}).finished.then(onClose);};
 return <div ref={panel} className={`${styles.mapTakeover} ${styles.libreTakeover} ${styles.inlineStudioMap}`} role="region" aria-label="Studios map view"><div className={styles.studioMapWrap}><div ref={container} className={styles.studioMap}/><button className={styles.mapListButton} onClick={close}>Back to list view</button>{(!ready||failed||fallbackUsed)&&<p className={styles.mapStatus} role="status">{failed?'Some map content could not load. You can return to the list.':fallbackUsed?'Using the fallback map.':"Loading map…"}</p>}
 {located.length?<div ref={rail} className={styles.mapCardRail} role="region" aria-label="Studio cards" onScroll={onRailScroll}>{located.map((studio,index)=><button key={studio.name} data-studio-index={index} className={styles.mapCarouselCard} aria-label={`Open ${studio.name}`} aria-current={active?.name===studio.name?"true":undefined} onFocus={()=>focus(studio)} onClick={()=>p.open({kind:"studio",name:studio.name})}>{studio.photo?<img src={studio.photo} alt=""/>:<span className={styles.mapCardPhotoFallback}><MapPin size={30}/></span>}<span className={styles.mapCarouselCopy}><small>{studio.type}</small><strong>{studio.name}</strong><span>{studio.location}</span></span></button>)}</div>:<div className={styles.mapStudioCard}>No mapped studios match these filters.</div>}

 </div></div>;
}
