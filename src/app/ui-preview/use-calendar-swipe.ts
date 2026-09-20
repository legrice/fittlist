"use client";
import {useEffect,useRef,useState} from "react";
export function useCalendarSwipe(view:string,setView:(value:string)=>void) {
 const root=useRef<HTMLDivElement>(null);const gesture=useRef<{x:number;y:number;dx:number;locked:boolean;width:number;start:number}|null>(null);const suppress=useRef(false);
 const [progress,setProgress]=useState<number|null>(null);const [geometry,setGeometry]=useState({left:0,width:0,endLeft:0,endWidth:0});
 useEffect(()=>{const node=root.current;if(!node)return;const list=node.querySelector('[role="tablist"]') as HTMLElement;const measure=()=>{const tabs=list?.querySelectorAll<HTMLElement>('[role="tab"]');if(tabs?.length===2)setGeometry({left:tabs[0].offsetLeft,width:tabs[0].offsetWidth,endLeft:tabs[1].offsetLeft,endWidth:tabs[1].offsetWidth});};measure();const observer=new ResizeObserver(measure);if(list)observer.observe(list);return()=>observer.disconnect();},[]);
 const t=progress??(view==="you"?0:1);
 return {root,indicator:{left:geometry.left+(geometry.endLeft-geometry.left)*t,width:geometry.width+(geometry.endWidth-geometry.width)*t,transition:progress===null?undefined:"none"},handlers:{
 onPointerDown:(e:React.PointerEvent<HTMLDivElement>)=>{suppress.current=false;if(!e.isPrimary||e.pointerType==="mouse"||e.clientX<24||e.clientX>window.innerWidth-24||(e.target as HTMLElement).closest('[aria-label="Filter by person"],input,textarea,select,[role="tablist"]'))return;gesture.current={x:e.clientX,y:e.clientY,dx:0,locked:false,width:e.currentTarget.clientWidth,start:view==="you"?0:1};},
 onPointerMove:(e:React.PointerEvent<HTMLDivElement>)=>{const g=gesture.current;if(!g)return;const dx=e.clientX-g.x,dy=e.clientY-g.y;if(!g.locked){if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)){gesture.current=null;return;}if(Math.abs(dx)<12||Math.abs(dx)<Math.abs(dy)*1.3)return;g.locked=true;e.currentTarget.setPointerCapture(e.pointerId);suppress.current=true;}g.dx=dx;setProgress(Math.max(0,Math.min(1,g.start-dx/g.width)));},
 onPointerUp:()=>{const g=gesture.current;gesture.current=null;if(g?.locked){const next=g.start-g.dx/g.width;setView(next>g.start+.18?"following":next<g.start-.18?"you":g.start?"following":"you");}setProgress(null);},
 onPointerCancel:()=>{gesture.current=null;setProgress(null);},
 onClickCapture:(e:React.MouseEvent<HTMLDivElement>)=>{if(suppress.current){e.preventDefault();e.stopPropagation();suppress.current=false;}}
 }};
}
