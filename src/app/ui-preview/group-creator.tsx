"use client";
import { useState } from "react";
import { BackButton } from "@/components/BackButton";
import { Activity, CalendarDays, Check, Sparkles, Users, X } from "@/components/PhosphorIcons";
import { Input } from "@/components/ui/input";
import styles from "./preview.module.css";

const purposes = [
  { id:"teaching", title:"Teach together", detail:"Share teaching schedules", icon:CalendarDays, about:"A place to share where we’re teaching and keep our community connected." },
  { id:"friends", title:"Take classes", detail:"Make plans with friends", icon:Users, about:"Find classes, share recommendations, and make plans together." },
  { id:"club", title:"Build a community", detail:"Run, train, or move together", icon:Activity, about:"A local community to meet people and make time to move together." },
  { id:"other", title:"Something else", detail:"Create your own kind of group", icon:Sparkles, about:"" },
];
export type GroupDraft = { name:string; location:string; description:string; category:string; image:string; purpose:string; invitees:string[] };
export default function GroupCreator({location,people,onCancel,onCreate}:{location:string;people:{name:string}[];onCancel:()=>void;onCreate:(draft:GroupDraft)=>void}) {
  const [step,setStep]=useState(1);
  const [purpose,setPurpose]=useState("");
  const [name,setName]=useState("");
  const [city,setCity]=useState(location);
  const [description,setDescription]=useState("");
  const [editedAbout,setEditedAbout]=useState(false);
  const [category,setCategory]=useState("Fitness");
  const [image,setImage]=useState("");
  const [query,setQuery]=useState("");
  const [invitees,setInvitees]=useState<string[]>([]);
  const [notice,setNotice]=useState("");
  const move=(next:number)=>{setStep(next);document.querySelector('main')?.scrollTo({top:0});};
  const close=()=>{if((purpose||name)&&!window.confirm("Close group setup? Your progress will be lost."))return;onCancel();};
  const finish=(skip=false)=>onCreate({name:name.trim(),location:city.trim(),description:description.trim(),category,image,purpose,invitees:skip?[]:invitees});
  return <div className={styles.groupSetup}>
    <div className={styles.groupSetupHeader}><BackButton data-local-back onClick={()=>step>1?move(step-1):close()}/><span>Start a group</span><button aria-label="Close group setup" onClick={close}><X size={20}/></button></div>
    <div className={styles.groupSetupProgress} role="progressbar" aria-label="Group setup progress" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>{[1,2,3].map(n=><span key={n} data-active={n<=step}/>)}</div>
    <h1 className={styles.classStepTitle}>{step===1?"What would you like to do together?":step===2?"Make it yours":"Invite your people"}</h1>
    {step===1?<><div className={`${styles.groupPurposeChoices} ${styles.groupPurposeGrid}`}>{purposes.map(item=>{const Icon=item.icon;return <button key={item.id} aria-pressed={purpose===item.id} onClick={()=>{setPurpose(item.id);if(!editedAbout)setDescription(item.about);}}><span className={styles.groupPurposeIcon}><Icon size={24}/></span><span><strong>{item.title}</strong><span>{item.detail}</span></span><span className={styles.groupChoiceCheck}>{purpose===item.id&&<Check size={16}/>}</span></button>;})}</div><div className={styles.groupSetupFooter}><button disabled={!purpose} onClick={()=>move(2)}>Continue</button></div></>:step===2?<form className={styles.groupForm} onSubmit={event=>{event.preventDefault();if(name.trim()&&city.trim())move(3);}}>
      <label>Group name<Input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Your group’s name"/></label>
      <label>Location<Input required value={city} onChange={e=>setCity(e.target.value)} placeholder="City or neighborhood"/></label>
      <label>Type<select aria-label="Group type" value={category} onChange={e=>setCategory(e.target.value)}>{["Fitness","Wellness","Run club"].map(type=><option key={type}>{type}</option>)}</select></label>
      <label>About your group<textarea aria-label="About your group" maxLength={500} rows={4} value={description} onChange={e=>{setDescription(e.target.value);setEditedAbout(true);}} placeholder="What brings you together?"/></label>
      <label>Group photo · optional<input type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5*1024*1024){setNotice("Choose an image smaller than 5 MB.");return;}const reader=new FileReader();reader.onload=()=>{setImage(String(reader.result));setNotice("");};reader.readAsDataURL(file);}}/></label>{image&&<img className={styles.groupSetupPhoto} src={image} alt="Group photo preview"/>}
      {notice&&<p role="status">{notice}</p>}<div className={styles.groupSetupFooter}><button type="submit">Continue</button></div>
    </form>:<><p className={styles.sectionIntro}>Invite people now, or skip and do it from the group later.</p><label className={styles.search}><Input aria-label="Search people to invite" placeholder="Search people" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className={styles.groupPurposeChoices}>{people.filter((person,index,all)=>all.findIndex(row=>row.name===person.name)===index&&person.name.toLowerCase().includes(query.toLowerCase())).map(person=><button key={person.name} aria-pressed={invitees.includes(person.name)} onClick={()=>setInvitees(rows=>rows.includes(person.name)?rows.filter(n=>n!==person.name):[...rows,person.name])}><strong>{person.name}</strong><span className={styles.groupChoiceCheck}>{invitees.includes(person.name)&&<Check size={16}/>}</span></button>)}</div>{notice&&<p role="status">{notice}</p>}<div className={styles.groupSetupFooter}><button onClick={()=>finish()}>Create group{invitees.length?` · ${invitees.length} selected`:""}</button><button className={styles.groupSetupSkip} onClick={()=>finish(true)}>Skip for now</button></div></>}
  </div>;
}
