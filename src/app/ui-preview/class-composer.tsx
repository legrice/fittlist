"use client";
import { useEffect, useState } from "react";
import { AddBrowse } from "@/components/AddBrowse";
import { Adder } from "@/components/Adder";
import { AddWeekChoices } from "@/components/AddWeekChoices";
import { globalComposerData } from "@/app/actions/composer";
import type { PublishInput } from "@/app/actions/classes";
import { todayIso } from "@/lib/format";
import type { StudioDto, TemplateDto } from "@/lib/types";
import { dateLabel, timeLabel, usePrototype } from "./prototype-state";
import styles from "./preview.module.css";

export default function ClassComposer() {
  const p=usePrototype();
  const [kind,setKind]=useState<"coaching"|"saved"|"personal"|null>(null);
  const [started,setStarted]=useState(false);
  const [manual,setManual]=useState(false);
  const [notice,setNotice]=useState("");
  const [data,setData]=useState<Awaited<ReturnType<typeof globalComposerData>>>(null);
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
    const additions=dates.flatMap(date=>times.map(time=>({id:`preview-${Date.now()}-${date}-${time}`,name:input.name,description:input.description,place:studios.find(s=>s.id===input.studioId)?.name||input.location||"Personal calendar",coach:kind==="coaching"?p.profile.name:kind==="personal"?"Personal workout":"Class instructor",own:kind==="coaching",personal:kind==="personal",inCalendar:true,date,time,duration:String(input.durationMin)})));
    p.setSchedule(rows=>[...rows,...additions]);
    if(kind!=="coaching")p.setSaved(ids=>[...ids,...additions.map(item=>item.id)]);
    p.back();
  };
  const browseData={myLat:null,myLng:null,days:[...new Set(p.schedule.map(c=>c.date))].sort().map(iso=>({iso,label:dateLabel(iso),items:p.schedule.filter(c=>c.date===iso&&!c.personal&&!(c.own??(c.coach===p.profile.name||c.coach==="Matt LeGrice"))).map(c=>({classId:c.id,base:"",iso,name:c.name,hm:timeLabel(c.time).split(" ")[0],ap:timeLabel(c.time).split(" ")[1],durationMin:Number(c.duration),classType:null,lat:null,lng:null,where:c.place,coachName:c.coach,coachPhoto:c.photo||null,coachColor:"#C8C3DB",attribution:"coached" as const,attributionName:c.coach,own:false,saved:p.saved.includes(c.id)}))}))};
  return <div className={styles.mainClassComposer}>
    {!started?<><p className={styles.sectionIntro}>What are you doing?</p><AddWeekChoices canCoach selected={kind} onSelect={setKind}/><button className={styles.membershipCta} disabled={!kind} onClick={()=>setStarted(true)}>Continue</button></>:kind==="saved"&&!manual?<AddBrowse preview={{data:browseData,onSave:(id,on)=>{p.setSaved(ids=>on?[...new Set([...ids,id])]:ids.filter(value=>value!==id));if(on)p.back();}}} onClose={p.back} onAddNew={()=>setManual(true)} onEvent={()=>{setKind("personal");setManual(true);}}/>:<Adder studios={studios} templates={templates} customTypes={data?.customTypes||[]} lastUsed={data?.lastUsed||{startTime:"18:00",durationMin:60,studioId:null}} subsCount={0} firstPublish={false} personal={kind==="coaching"?undefined:{canCoach:false,event:kind==="personal",oneOff:true}} onClose={p.back} onToast={setNotice} onPublished={()=>p.back()} onDeleted={()=>p.back()} onPreviewPublish={save}/>}
    {notice&&<p role="status">{notice}</p>}
  </div>;
}
