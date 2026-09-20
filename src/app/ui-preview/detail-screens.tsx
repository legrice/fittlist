"use client";
import { useState } from "react";
import { ArrowLeft, ChevronRight, Plus, CalendarDays, Users, MapPin, Bell, Share2, Clock, Bookmark, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrototype, dateLabel, type Destination, type PreviewClass } from "./prototype-state";
import Membership from "./membership";
import PreviewClassCard, { classTimeRange } from "./class-card";
import styles from "./preview.module.css";

const secondary = { variant:"outline" as const, "data-variant":"outline" };
function Row({ title, detail, onClick }: { title:string; detail?:string; onClick:()=>void }) {
  return <button className={styles.detailRow} onClick={onClick}><span><strong>{title}</strong>{detail && <small>{detail}</small>}</span><ChevronRight size={18}/></button>;
}
function Heading({children}:{children:React.ReactNode}) { return <div className={styles.sectionTitle}><h2>{children}</h2></div>; }
function Schedule({items}:{items:PreviewClass[]}) { return <div className={styles.stack}>{items.length ? items.map(item=><section key={item.id} className={styles.daySection}><h3>{dateLabel(item.date)}</h3><PreviewClassCard item={item}/></section>) : <p className={styles.sectionIntro}>No upcoming classes yet.</p>}</div>; }
function EditProfile() {
  const p=usePrototype(); const [draft,setDraft]=useState(p.profile);
  return <form className={styles.detailForm} onSubmit={e=>{e.preventDefault();p.setProfile(draft);p.back();}}>
    <div className={styles.detailAvatar}>{draft.name.split(" ").map(s=>s[0]).join("").slice(0,2)}</div>
    <label>Name<input required value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <label>Handle<input required pattern="[a-zA-Z0-9_]+" value={draft.handle} onChange={e=>setDraft({...draft,handle:e.target.value})}/></label>
    <label>Bio<textarea aria-label="Bio" value={draft.bio} maxLength={200} onChange={e=>setDraft({...draft,bio:e.target.value})}/></label>
    <label>Location<input value={draft.location} onChange={e=>setDraft({...draft,location:e.target.value})}/></label>
    <Button type="submit">Save profile</Button>
  </form>;
}
function ClassEditor({route}:{route:Destination}) {
  const p=usePrototype(); const existing=p.schedule.find(c=>c.id===route.name);
  const [draft,setDraft]=useState<PreviewClass>(existing ?? {id:"",name:"",place:route.name || "Personal calendar",coach:p.profile.name,own:true,inCalendar:true,date:new Date().toISOString().slice(0,10),time:"18:00",duration:"60"});
  const update=(key:keyof PreviewClass,value:string)=>setDraft(d=>({...d,[key]:value}));
  return <form className={styles.detailForm} onSubmit={e=>{e.preventDefault();const item={...draft,id:existing?.id ?? `class-${Date.now()}`};p.setSchedule(s=>existing?s.map(c=>c.id===item.id?item:c):[...s,item]);p.back();}}>
    <label>Class name<input required value={draft.name} onChange={e=>update("name",e.target.value)}/></label>
    <label>Calendar / studio<select value={draft.place} onChange={e=>update("place",e.target.value)}>{Array.from(new Set([draft.place,"Personal calendar","Ironbound Performance Athletics","Gals who like to move","Asana Soul Practice","Jane DO Jersey City"])).map(place=><option key={place}>{place}</option>)}</select></label>
    <label>Instructor<input required value={draft.coach} onChange={e=>update("coach",e.target.value)}/></label>
    <div className={styles.formColumns}><label>Date<input type="date" required value={draft.date} onChange={e=>update("date",e.target.value)}/></label><label>Time<input type="time" required value={draft.time} onChange={e=>update("time",e.target.value)}/></label></div>
    <label>Duration<select value={draft.duration} onChange={e=>update("duration",e.target.value)}>{[30,45,50,60,90].map(n=><option key={n} value={n}>{n} minutes</option>)}</select></label>
    <Button type="submit">{existing?"Save changes":"Add class"}</Button>
  </form>;
}
function Settings({name}:{name:string}) {
  const p=usePrototype(); const [status,setStatus]=useState("");const [away,setAway]=useState(p.away);const [email,setEmail]=useState(p.profile.email);
  const switches=(labels:string[])=>labels.map(label=><div className={styles.preferenceRow} key={label}><span>{label}</span><button role="switch" aria-label={label} aria-checked={!!p.preferences[label]} className={styles.themeSwitch} onClick={()=>p.setPreferences(v=>({...v,[label]:!v[label]}))}><span/></button></div>);
  if(name==="Notification settings") return <><p className={styles.sectionIntro}>Choose what you hear about.</p>{switches(["Class reminders","New followers","Group activity","Messages","Email updates"])}</>;
  if(name==="Privacy & communication") return <>{switches(["Public profile","Allow messages","Approve followers"])}</>;
  if(name==="Set yourself as away") return <form className={styles.detailForm} onSubmit={e=>{e.preventDefault();p.setAway(away);setStatus("Away settings saved for this preview.");}}><div className={styles.formColumns}><label>From<input type="date" required value={away.start} onChange={e=>setAway({...away,start:e.target.value})}/></label><label>Until<input type="date" required min={away.start} value={away.end} onChange={e=>setAway({...away,end:e.target.value})}/></label></div><label>Profile note<input value={away.note} onChange={e=>setAway({...away,note:e.target.value})}/></label><label>Automatic reply<textarea aria-label="Automatic reply" value={away.reply} onChange={e=>setAway({...away,reply:e.target.value})}/></label><Button type="submit">Save away dates</Button><p role="status">{status}</p></form>;
  if(name==="Account & preferences") return <form className={styles.detailForm} onSubmit={e=>{e.preventDefault();p.setProfile(v=>({...v,email}));setStatus("Account preferences saved for this preview.");}}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Time zone<select value={p.timezone} onChange={e=>p.setTimezone(e.target.value)}><option>America/New_York</option><option>America/Chicago</option><option>America/Los_Angeles</option></select></label><Button type="submit">Save preferences</Button><p role="status">{status}</p></form>;
  if(name==="Calendar & sync") return <><p className={styles.sectionIntro}>Try connecting a calendar. No external account is linked in this preview.</p>{["Google Calendar","Apple Calendar","Outlook"].map(provider=><div className={styles.preferenceRow} key={provider}><span>{provider}</span><Button {...secondary} onClick={()=>p.setConnections(v=>v.includes(provider)?v.filter(x=>x!==provider):[...v,provider])}>{p.connections.includes(provider)?"Disconnect":"Connect"}</Button></div>)}</>;
  if(name==="Insights" && !p.pro) return <><Heading>Your activity</Heading><p className={styles.sectionIntro}>{p.schedule.filter(c=>c.own).length} upcoming teaching classes.</p><Row title="Go deeper with Pro" detail="Explore trends, popular classes, and profile engagement. Preview the proposed plan." onClick={()=>p.open({kind:"membership",name:"See what’s connecting with your community."})}/></>;
  if(p.live && ["Insights","People & access","Admin dashboard"].includes(name)) return <p className={styles.sectionIntro}>These tools aren’t connected to live data in this preview yet.</p>;
  if(name==="Insights") return <><p className={styles.sectionIntro}>This week · sample activity</p><div className={styles.metricGrid}>{[["Classes",p.schedule.length],["Profile views",128],["Shares",24],["New followers",8]].map(([label,value])=><div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><Heading>Your calendar activity</Heading><Schedule items={p.schedule}/></>;
  if(name==="Admin dashboard") return <><p className={styles.sectionIntro}>Preview management tools</p><Row title="Studios" detail="Ironbound Performance Athletics" onClick={()=>p.open({kind:"manage",name:"Ironbound Performance Athletics"})}/><Row title="People & access" detail="Review your calendar team" onClick={()=>p.open({kind:"settings",name:"People & access"})}/><Row title="Event registration" detail="Manage class attendance" onClick={()=>p.open({kind:"settings",name:"Event registration"})}/></>;
  if(name==="People & access") return <>{[p.profile.name,"Freddie Morgan","Erin Clyne"].map((person,i)=><div className={styles.preferenceRow} key={person}><span>{person}</span><select aria-label={`Role for ${person}`} value={i===0?"Owner":p.roles[person] || "Editor"} onChange={e=>p.setRoles(v=>({...v,[person]:e.target.value}))} disabled={i===0}><option>Owner</option><option>Editor</option><option>Viewer</option></select></div>)}</>;
  if(name==="Event registration") return <><p className={styles.sectionIntro}>Select a class to view its details.</p><Schedule items={p.schedule}/></>;
  return null;
}
export default function DetailScreens({route}:{route:Destination}) {
  const p=usePrototype(); const [message,setMessage]=useState("");
  const [shareStatus,setShareStatus]=useState("");
  const item=p.schedule.find(c=>c.id===route.name);
  const title=route.kind==="membership"?"Membership":route.kind==="edit-profile"?"Edit profile":route.kind==="add-class"?"Add a class":route.kind==="edit-class"?"Edit class":route.kind==="class"?item?.name || "Class unavailable":route.name || "Details";
  const matching=p.schedule.filter(c=>route.kind==="person"?c.coach===route.name:(route.name==="Personal calendar"||route.name==="My classes")?((c.own ?? (c.coach===p.profile.name || c.coach==="Matt LeGrice")) || p.saved.includes(c.id)):route.name==="Gals who like to move"?["sculpt","ironbound"].includes(c.id)||c.place===route.name:c.place===route.name);
  return <>
    <button className={styles.backButton} onClick={p.back}><ArrowLeft size={19}/>Back</button>
    <h1 className={styles.pageTitle}>{title}</h1>
    {route.kind==="membership" && <Membership reason={route.name}/>}
    {route.kind==="edit-profile" && <EditProfile/>}
    {(route.kind==="add-class"||route.kind==="edit-class") && <ClassEditor route={route}/>}
    {route.kind==="settings" && <Settings name={title}/>}
    {(route.kind==="manage"||route.kind==="studio"||route.kind==="person") && <>
      <div className={styles.detailIdentity}><div className={styles.detailAvatar}>{route.kind==="person"?<Users size={30}/>:<CalendarDays size={30}/>}</div><span><MapPin size={15}/> {p.live ? (route.kind==="person"?p.live.people.find(person=>person.name===route.name)?.location:p.live.studios.find(studio=>studio.name===route.name)?.location) || "Location not added" : "Jersey City, NJ"}</span></div>
      {route.kind==="manage" ? <><p className={styles.sectionIntro}>You manage this calendar.</p><div className={styles.profileActions}><Button {...secondary} onClick={()=>p.open({kind:"add-class",name:route.name})}><Plus size={18}/>Add class</Button><Button {...secondary} onClick={()=>p.open({kind:"settings",name:"People & access"})}>Manage access</Button></div></> : <Button {...secondary} onClick={()=>p.setFollowing(v=>v.includes(title)?v.filter(x=>x!==title):[...v,title])}>{p.following.includes(title)?"Following":"Follow"}</Button>}
      <Heading>Upcoming classes</Heading><Schedule items={matching}/>
    </>}
    {route.kind==="class" && item && <>
      <div className={styles.classPageMeta}><span><CalendarDays size={21}/>{dateLabel(item.date)}</span><span><Clock size={21}/>{classTimeRange(item)}</span></div>
      <button className={styles.classShareLink} onClick={async()=>{const url=new URL(window.location.href);url.searchParams.set("class",item.id);try{await navigator.clipboard.writeText(url.href);setShareStatus("Class link copied.");}catch{setShareStatus(url.href);}}}><Share2 size={18}/>Copy class link</button>
      <p role="status" className={styles.sectionIntro}>{shareStatus}</p>
      <section className={styles.classPageSection}><Heading>About this class</Heading><p>{p.live ? item.description || "No description added." : "Move together in a welcoming, instructor-led session. Bring water and arrive a few minutes early."}</p></section>
      <section className={styles.classPageSection}><Heading>Where</Heading><Row title={item.place} detail="View studio and upcoming classes" onClick={()=>p.open({kind:"studio",name:item.place})}/></section>
      <section className={styles.classPageSection}><Heading>Instructor</Heading><Row title={item.coach} detail={(item.own ?? (item.coach===p.profile.name||item.coach==="Matt LeGrice"))?"You’re teaching this class":"View coach profile"} onClick={()=>p.open({kind:"person",name:item.coach})}/></section>
      <div className={styles.classPageFooter}>{(item.own ?? (item.coach===p.profile.name||item.coach==="Matt LeGrice")) ? <button onClick={()=>p.open({kind:"edit-class",name:item.id})}>Edit class</button> : <button aria-pressed={p.saved.includes(item.id)} onClick={()=>p.setSaved(v=>v.includes(item.id)?v.filter(id=>id!==item.id):[...v,item.id])}>{p.saved.includes(item.id)?<Check size={20}/>:<Bookmark size={20}/>} {p.saved.includes(item.id)?"Saved to your calendar":"Save to your calendar"}</button>}</div>
    </>}
    {route.kind==="class" && !item && <p className={styles.sectionIntro}>This class is not available in the loaded calendar. Go back to explore the calendar.</p>}
    {route.kind==="conversation" && <><div className={styles.messageList}><p className={styles.messageBubble}>See you at Asana Lab!</p>{p.messages.slice(1).map((text,i)=><p className={`${styles.messageBubble} ${styles.sentMessage}`} key={i}>{text}</p>)}</div><form className={styles.detailForm} onSubmit={e=>{e.preventDefault();if(!message.trim())return;p.setMessages(v=>[...v,message.trim()]);setMessage("");}}><label>Message<textarea aria-label="Message" required value={message} onChange={e=>setMessage(e.target.value)}/></label><Button type="submit">Send in preview</Button></form></>}
    <p className={styles.prototypeNote}><Bell size={13}/>{p.live ? "Account data. Edits and settings changes stay in this preview." : "Sample data. Changes stay in this preview session."}</p>
  </>;
}
