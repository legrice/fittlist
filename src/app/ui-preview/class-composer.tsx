"use client";
import { useEffect, useState } from "react";
import { AddBrowse } from "@/components/AddBrowse";
import { Adder } from "@/components/Adder";
import { AddWeekChoices } from "@/components/AddWeekChoices";
import { BackButton } from "@/components/BackButton";
import { globalComposerData } from "@/app/actions/composer";
import type { PublishInput } from "@/app/actions/classes";
import { todayIso } from "@/lib/format";
import type { StudioDto, TemplateDto } from "@/lib/types";
import { ArrowUpRight, Check, X } from "@/components/PhosphorIcons";
import { dateLabel, timeLabel, usePrototype } from "./prototype-state";
import styles from "./preview.module.css";

export default function ClassComposer() {
  const p=usePrototype();
  const [kind,setKind]=useState<"coaching"|"saved"|"personal"|null>(null);
  const [started,setStarted]=useState(false);
  const [manual,setManual]=useState(false);
  const [notice,setNotice]=useState("");
  const [published,setPublished]=useState(false);
  const [skipPublishedConfirmation,setSkipPublishedConfirmation]=useState(false);
  const [confirmClose,setConfirmClose]=useState(false);
  const [data,setData]=useState<Awaited<ReturnType<typeof globalComposerData>>>(null);
  useEffect(()=>{try{setSkipPublishedConfirmation(localStorage.getItem("fittlist-preview-skip-class-published")==="true");}catch{}},[]);
  useEffect(()=>{let active=true;if(p.live)void globalComposerData().then(value=>{if(active)setData(value);}).catch(()=>{if(active)setNotice("Could not load your saved class details. You can still add a class.");});return()=>{active=false;};},[p.live]);
  const studios:StudioDto[]=data?.studios ?? [...new Set(p.schedule.map(c=>c.place))].map((name,seq)=>({id:`preview-${seq}`,seq,name,address:p.profile.location}));
  const templates:TemplateDto[]=data?.templates ?? p.schedule.map(c=>({name:c.name,classType:null,description:c.description||null,image:null,startTime:c.time,durationMin:Number(c.duration),studioId:studios.find(s=>s.name===c.place)?.id||null,location:c.place,withWho:c.coach,isPublic:!!c.own,links:[]}));
  const save=(input:PublishInput & {times?:string[]})=>{
    const dates:string[]=[];
    const today=todayIso();
    if(input.specificDate)dates.push(input.specificDate);
    else for(let offset=0;offset<7;offset++){
      const day=new Date(today+"T12:00:00");day.setDate(day.getDate()+offset);
      const iso=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`;
      if(input.days.includes((day.getDay()+6)%7)&&(!input.endsOn||iso<=input.endsOn))dates.push(iso);
    }
    const times=[...new Set([input.startTime,...(input.times||[])])];
    const additions=dates.flatMap(date=>times.map(time=>({id:`preview-${Date.now()}-${date}-${time}`,name:input.name,description:input.description,links:input.links,place:studios.find(s=>s.id===input.studioId)?.name||input.location||"Personal calendar",coach:kind==="coaching"?p.profile.name:kind==="personal"?"Personal workout":"Class instructor",own:kind==="coaching",personal:kind==="personal",inCalendar:true,date,time,duration:String(input.durationMin)})));
    p.setSchedule(rows=>[...rows,...additions]);
    if(kind!=="coaching")p.setSaved(ids=>[...ids,...additions.map(item=>item.id)]);
    if(skipPublishedConfirmation)p.back();else setPublished(true);
  };
  const browseData={myLat:null,myLng:null,days:[...new Set(p.schedule.map(c=>c.date))].sort().map(iso=>({iso,label:dateLabel(iso),items:p.schedule.filter(c=>c.date===iso&&!c.personal&&!(c.own??(c.coach===p.profile.name||c.coach==="Matt LeGrice"))).map(c=>({classId:c.id,base:"",iso,name:c.name,hm:timeLabel(c.time).split(" ")[0],ap:timeLabel(c.time).split(" ")[1],durationMin:Number(c.duration),classType:null,lat:null,lng:null,where:c.place,coachName:c.coach,coachPhoto:c.photo||null,coachColor:"#C8C3DB",attribution:"coached" as const,attributionName:c.coach,own:false,saved:p.saved.includes(c.id)}))}))};
  return <div className={styles.mainClassComposer}>
    {published&&<div className={styles.followOverlay} onMouseDown={event=>{if(event.target===event.currentTarget)p.back();}}><section className={styles.followDialog} role="dialog" aria-modal="true" aria-labelledby="class-published-title"><button className={styles.followClose} aria-label="Close confirmation" onClick={p.back}><X size={20}/></button><span className={styles.followSuccess}><Check size={27} weight="bold"/></span><h2 id="class-published-title">Class published successfully</h2><button className={styles.followGoHome} onClick={()=>{setPublished(false);p.back();window.requestAnimationFrame(()=>window.dispatchEvent(new Event("preview-open-share")));}}>Share your week <ArrowUpRight size={18}/></button><label className={styles.followRemember}><input type="checkbox" checked={skipPublishedConfirmation} onChange={event=>{const checked=event.target.checked;setSkipPublishedConfirmation(checked);try{localStorage.setItem("fittlist-preview-skip-class-published",String(checked));}catch{}}}/> Don’t show this again</label></section></div>}
    {confirmClose&&<div className={styles.followOverlay}><section className={`${styles.followDialog} ${styles.leaveGroupDialog}`} role="alertdialog" aria-modal="true" aria-labelledby="close-class-start-title"><button className={styles.followClose} aria-label="Keep editing" onClick={()=>setConfirmClose(false)}><X size={20}/></button><h2 id="close-class-start-title">Close class setup?</h2><p>Your progress will be lost.</p><button className={styles.leaveGroupConfirm} onClick={p.back}>Yes, close</button><button className={styles.leaveGroupCancel} onClick={()=>setConfirmClose(false)}>Keep editing</button></section></div>}
    {!started?<div className={`${styles.groupSetup} ${styles.classSetupStart}`}><div className={styles.groupSetupHeader}><BackButton data-local-back onClick={()=>setConfirmClose(true)}/><span>Add a class</span><button aria-label="Close class setup" onClick={()=>setConfirmClose(true)}><X size={20}/></button></div><div className={styles.groupSetupProgress} role="progressbar" aria-label="Class setup progress" aria-valuemin={1} aria-valuemax={4} aria-valuenow={1}>{[1,2,3,4].map(n=><span key={n} data-active={n===1}/>)}</div><h1 className={styles.classStepTitle}>What are you adding?</h1><AddWeekChoices canCoach selected={kind} onSelect={setKind}/><div className={styles.groupSetupFooter}><button disabled={!kind} onClick={()=>setStarted(true)}>Continue</button></div></div>:kind==="saved"&&!manual?<AddBrowse preview={{data:browseData,onSave:(id,on)=>{p.setSaved(ids=>on?[...new Set([...ids,id])]:ids.filter(value=>value!==id));if(on)p.back();}}} onClose={p.back} onAddNew={()=>setManual(true)} onEvent={()=>{setKind("personal");setManual(true);}}/>:<Adder studios={studios} templates={templates} customTypes={data?.customTypes||[]} lastUsed={data?.lastUsed||{startTime:"18:00",durationMin:60,studioId:null}} subsCount={0} firstPublish={false} personal={kind==="coaching"?undefined:{canCoach:false,event:kind==="personal",oneOff:true}} onClose={p.back} onToast={setNotice} onPublished={()=>p.back()} onDeleted={()=>p.back()} onPreviewPublish={save} onPreviewBack={()=>setStarted(false)}/>}
    {notice&&<p role="status">{notice}</p>}
  </div>;
}
