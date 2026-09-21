"use client";
import { ChevronLeft, ChevronRight } from "@/components/PhosphorIcons";
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
 const touch=useRef<number|null>(null);
 const located=studios.filter(s=>s.coordinates);const inView=located.filter(s=>visible.includes(s.name));const active=located.find(s=>s.name===activeName)||inView[0];
 const focus=(s:MapStudio)=>{setActiveName(s.name);if(s.coordinates)map.current?.flyTo({center:[s.coordinates[1],s.coordinates[0]],zoom:15,offset:[0,-70],duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:650});};
 const fit=()=>{const rows=latest.current.filter(s=>s.coordinates);if(!rows.length)return;const lngs=rows.map(s=>s.coordinates![1]),lats=rows.map(s=>s.coordinates![0]);map.current?.fitBounds([[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],{padding:{top:75,bottom:230,left:55,right:55},maxZoom:14,duration:0});};
 useEffect(()=>{let disposed=false;let cleanup=()=>{};
  void import("maplibre-gl").then(L=>{if(disposed||!container.current)return;try{
   const dark=!!container.current.closest('[class*="dark"]');
   const m=new L.Map({container:container.current,style:`https://basemaps.cartocdn.com/gl/${dark?'dark-matter':'voyager'}-gl-style/style.json`,center:[-74.05,40.724],zoom:13,attributionControl:{compact:true}});map.current=m;
   m.addControl(new L.NavigationControl({showCompass:false}),"top-right");m.addControl(new L.GeolocateControl({positionOptions:{enableHighAccuracy:false},trackUserLocation:true}),"top-right");
   let usedFallback=false;const recover=()=>{if(usedFallback)return;usedFallback=true;setFallbackUsed(true);m.setStyle(fallback);};
   const report=()=>setVisible(latest.current.filter(s=>s.coordinates&&m.getBounds().contains([s.coordinates[1],s.coordinates[0]])).map(s=>s.name));
   m.on('load',()=>{setReady(true);fit();report();});m.on('moveend',report);m.on('error',()=>{if(!usedFallback&&!m.isStyleLoaded())recover();else setFailed(true);});
   const pinTimer=setTimeout(()=>{setReady(true);fit();report();},1500);
   const timer=setTimeout(()=>{if(!m.isStyleLoaded())recover();},7000);const ro=new ResizeObserver(()=>m.resize());ro.observe(container.current);
   cleanup=()=>{clearTimeout(pinTimer);clearTimeout(timer);ro.disconnect();markers.current.forEach(marker=>marker.remove());markers.current.clear();m.remove();map.current=null;};
  }catch{setFailed(true);}}).catch(()=>setFailed(true));return()=>{disposed=true;cleanup();};
 },[]);
 useEffect(()=>{if(!ready||!map.current)return;let disposed=false;void import('maplibre-gl').then(L=>{if(disposed||!map.current)return;const keep=new Set(studios.filter(s=>s.coordinates).map(s=>s.name));for(const [key,marker] of markers.current){if(!keep.has(key)){marker.remove();markers.current.delete(key);}}for(const studio of studios){if(!studio.coordinates)continue;let marker=markers.current.get(studio.name);if(!marker){const el=document.createElement('button');el.type='button';el.className=styles.librePin;el.setAttribute('aria-label',studio.name);el.title=studio.name;el.innerHTML='<svg viewBox="0 0 24 30" width="32" height="40" aria-hidden="true"><path fill="currentColor" stroke="white" stroke-width="1.5" d="M12 29S1 18 1 12a11 11 0 0 1 22 0c0 6-11 17-11 17Z"/><circle cx="12" cy="12" r="4" fill="white"/></svg>';el.onclick=()=>focus(latest.current.find(s=>s.name===studio.name)||studio);marker=new L.Marker({element:el,anchor:'bottom'}).setLngLat([studio.coordinates[1],studio.coordinates[0]]).addTo(map.current);markers.current.set(studio.name,marker);}marker.getElement().setAttribute('aria-pressed',String(active?.name===studio.name));}
 setVisible(studios.filter(s=>s.coordinates&&map.current!.getBounds().contains([s.coordinates[1],s.coordinates[0]])).map(s=>s.name));});return()=>{disposed=true;};},[studios,ready,active?.name]);
 const step=(delta:number)=>{const rows=inView.length?inView:located;if(!rows.length)return;const index=rows.findIndex(s=>s.name===active?.name);focus(rows[(index+delta+rows.length)%rows.length]);};
 const close=()=>{const el=panel.current;if(!el||window.matchMedia("(prefers-reduced-motion: reduce)").matches){onClose();return;}void el.animate([{transform:"translateX(0)"},{transform:"translateX(100%)"}],{duration:200,easing:"ease-in",fill:"forwards"}).finished.then(onClose);};
 return <div ref={panel} className={`${styles.mapTakeover} ${styles.libreTakeover} ${styles.inlineStudioMap}`} role="region" aria-label="Studios map view"><div className={styles.studioMapWrap}><div ref={container} className={styles.studioMap}/><button className={styles.mapListButton} onClick={close}>List view</button><button className={styles.mapFit} onClick={fit}>Show all {located.length} studios</button>{(!ready||failed||fallbackUsed)&&<p className={styles.mapStatus} role="status">{failed?'Some map content could not load. You can return to the list.':fallbackUsed?'Using the fallback map.':"Loading map…"}</p>}
 <div className={styles.mapStudioCard} onTouchStart={e=>{touch.current=e.touches[0].clientX;}} onTouchEnd={e=>{if(touch.current!==null){const dx=e.changedTouches[0].clientX-touch.current;if(Math.abs(dx)>50)step(dx<0?1:-1);}touch.current=null;}}>{active?<><div className={styles.mapCardHeading}>{active.photo&&<img src={active.photo} alt=""/>}<div><strong>{active.name}</strong><span>{active.type} · {active.location}</span></div></div><div className={styles.mapCardActions}><button aria-label="Previous studio" onClick={()=>step(-1)} disabled={located.length<2}><ChevronLeft size={20}/></button><button className={styles.mapDetailLink} onClick={()=>{p.open({kind:'studio',name:active.name});}}>View studio</button><button aria-label="Next studio" onClick={()=>step(1)} disabled={located.length<2}><ChevronRight size={20}/></button></div></>:<p>{located.length?'No studios in this area. Move the map or show all studios.':'No mapped studios match these filters.'}</p>}</div>
 </div></div>;
}
