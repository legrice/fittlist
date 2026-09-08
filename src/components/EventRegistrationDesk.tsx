"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { withTimeout } from "@/lib/async";
import { requestMagicLink } from "@/app/actions/auth";
import { checkInEvent, saveEventSettings } from "@/app/actions/event-registration";
import type { EventSchedule } from "@/lib/event-data";
import { fmtTime, fmtDateLong } from "@/lib/format";

type Attendee = {id:string;name:string;email:string;classId:string;className:string;time:string;date:string;checkedInAt:string|null};
export function EventRegistrationDesk({event,roster,rosterTruncated,publishedDate}:{event:EventSchedule;roster:Attendee[];rosterTruncated:boolean;publishedDate:string|null}) {
  const router=useRouter();const [query,setQuery]=useState(""),[filter,setFilter]=useState(""),[message,setMessage]=useState(""),[pending,setPending]=useState(""),[capacities,setCapacities]=useState<Record<string,number>>(()=>Object.fromEntries(event.classes.map(c=>[c.id,c.capacity ?? 20])));
  const [walkName,setWalkName]=useState(""),[walkEmail,setWalkEmail]=useState(""),[walkClass,setWalkClass]=useState(""),[walkConsent,setWalkConsent]=useState(false);
  const busy=useRef(false), dirty=useRef(false);
  useEffect(()=>{if(!dirty.current)setCapacities(Object.fromEntries(event.classes.map(c=>[c.id,c.capacity ?? 20])));},[event]);
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible' && !busy.current && !dirty.current)router.refresh();};const interval=setInterval(refresh,15000);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);return()=>{clearInterval(interval);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);};},[router]);
  const act=async(id:string,fn:()=>Promise<{ok:boolean;error?:string}>)=>{if(busy.current)return;busy.current=true;setPending(id);setMessage("");try{const result=await withTimeout(fn(),20000);setMessage(result.ok ? (id==='walkup' ? "Signup link sent. The attendee must confirm it to reserve a place." : "Saved") : result.error || "Couldn’t save. Try again.");if(result.ok){if(id==='settings')dirty.current=false;router.refresh();}}catch{setMessage("Connection interrupted. Refresh and try again.");}finally{busy.current=false;setPending("");}};
  const visible=roster.filter(r=>(!filter || r.classId===filter) && `${r.name} ${r.email}`.toLowerCase().includes(query.toLowerCase()));
  const published=publishedDate===event.date;
  return <main className="event-desk">
    <header><Link href={`/s/${event.slug}/manage`}>← Space dashboard</Link><h1>{event.name}</h1><p>Registration desk · {event.date ? fmtDateLong(event.date) : "Choose a date"}</p></header>
    <div className="event-desk-toolbar"><button className="ghost" onClick={()=>router.refresh()}>Refresh tally</button>{published && <><Link className="btn" href={`/s/${event.slug}/register`} target="_blank">Open attendee signup</Link><a className="ghost" href={`/api/events/${event.slug}/export`}>Export attendee CSV</a></>}</div>
    <div className="event-stats"><div><strong>{event.classes.reduce((n,c)=>n+c.count,0)}</strong><span>Class registrations</span></div><div><strong>{event.uniqueAttendees}</strong><span>Unique attendees</span></div><div><strong>{event.classes.reduce((n,c)=>n+c.checked,0)}</strong><span>Class check-ins</span></div></div>
    <p role="status" aria-live="polite">{message || "Refreshes every 15 seconds while this page is open."}</p>
    <details className="event-desk-setup" open={!published}><summary>Event setup and signup QR</summary><div className="event-desk-columns"><section className="event-panel">
      <h2>Event setup</h2><form method="get"><label>Event date<input type="date" name="date" required defaultValue={event.date || "2026-09-12"} /></label><button className="ghost">Preview this date</button></form>
      <p>Build the classes in your space’s <Link href={`/s/${event.slug}/manage/calendar`}>calendar</Link>, then set their limits here. New classes start at 20 places when you save.</p>
      {event.classes.length===0 && <p>No classes scheduled on this date yet.</p>}
      {event.truncated && <p role="alert">This space has too many class templates to show safely here. Narrow its schedule before opening event registration.</p>}
      <div className="event-capacities">{event.classes.map(c=><label key={c.id}><span><strong>{fmtTime(c.time)} · {c.name}</strong><small>{c.count} registered · {c.checked} checked in{!c.public ? " · Private: not open for signup" : ""}</small></span><input aria-label={`Capacity for ${c.name} at ${fmtTime(c.time)}`} type="number" inputMode="numeric" min={Math.max(1,c.count)} max={1000} value={capacities[c.id] ?? 20} onChange={e=>{dirty.current=true;setCapacities(v=>({...v,[c.id]:Number(e.target.value)}));}} /></label>)}</div>
      <button className="btn si" disabled={!!pending || !event.classes.length || event.truncated} onClick={()=>void act('settings',()=>saveEventSettings(event.slug,event.date!,event.classes.map(c=>({id:c.id,capacity:capacities[c.id] ?? 20}))))}>{pending==='settings' ? "Saving…" : published ? "Save class limits" : "Open registration for this date"}</button>
      <p>Full classes close registration. Cancelling a registration frees a place. No waitlist is enabled.</p>
    </section><section className="event-panel event-qr">
      <h2>Attendee signup</h2>{published ? <><img src={`/api/events/${event.slug}/qr`} alt={`QR code for ${event.name} registration`} width={240} height={240}/><p>Have attendees scan this with their own phones. Keep your iPad on this registration desk.</p><Link href={`/s/${event.slug}/register`} target="_blank">fittlist.co/s/{event.slug}/register</Link></> : <p>Save the event’s date and class limits to activate its signup link and QR code.</p>}
      <p>Attendees verify their email, confirm a place, and can share the class. Optional profile setup comes later.</p>
    </section></div></details>
    {published && <details className="event-panel event-walkup"><summary>Send a walk-up signup link</summary><p>Enter the attendee’s details with their permission. They confirm by email on their own device; your iPad stays signed in as an admin.</p><form onSubmit={e=>{e.preventDefault();if(!walkConsent)return;void act('walkup',async()=>{const result=await requestMagicLink(walkEmail,null,"signup",{studioId:event.id,classId:walkClass,date:event.date!,name:walkName});if(result.ok){setWalkName("");setWalkEmail("");setWalkClass("");setWalkConsent(false);}return result;});}}>
      <div className="event-roster-filters"><label>Attendee name<input autoComplete="off" required minLength={2} maxLength={80} value={walkName} onChange={e=>setWalkName(e.target.value)} /></label><label>Attendee email<input autoComplete="off" type="email" inputMode="email" required maxLength={254} value={walkEmail} onChange={e=>setWalkEmail(e.target.value)} /></label></div>
      <label>Choose a class<select aria-label="Choose a class" required value={walkClass} onChange={e=>setWalkClass(e.target.value)}><option value="">Select a class</option>{event.classes.filter(c=>c.public && c.capacity && !c.past && !event.closed && c.count<c.capacity).map(c=><option key={c.id} value={c.id}>{fmtTime(c.time)} · {c.name} · {c.capacity!-c.count} places left</option>)}</select></label>
      <label className="event-consent"><input type="checkbox" required checked={walkConsent} onChange={e=>setWalkConsent(e.target.checked)} /><span>The attendee has asked me to send this signup link to their email.</span></label>
      <button className="btn si" disabled={!!pending}>{pending==='walkup' ? "Sending…" : "Send attendee signup link"}</button><p>A place is counted only after they verify their email. This form does not sign them into your iPad.</p>{message && <p>{message}</p>}
    </form></details>}
    <section className="event-panel"><h2>Attendees</h2><p>Names and emails are for managing this event. Registration is not consent to marketing emails.</p>
      <div className="event-roster-filters"><label>Search attendees<input type="search" placeholder="Name or email" value={query} onChange={e=>setQuery(e.target.value)} /></label><label>Class<select aria-label="Class" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All classes</option>{event.classes.map(c=><option key={c.id} value={c.id}>{fmtTime(c.time)} · {c.name}</option>)}</select></label></div>
      {rosterTruncated && <p role="alert">More than 10,000 registrations. This list is incomplete; contact support for a full export.</p>}
      {!visible.length && <p>No matching registrations yet.</p>}
      <div className="event-roster">{visible.slice(0,200).map(r=><article key={r.id}><div><strong>{r.name || "Attendee"}</strong><span>{r.email}</span><small>{fmtTime(r.time)} · {r.className}</small></div><button className={r.checkedInAt ? "btn" : "btn si"} aria-pressed={!!r.checkedInAt} disabled={!!pending} onClick={()=>void act(r.id,()=>checkInEvent(event.slug,r.id,!r.checkedInAt))}>{pending===r.id ? "Saving…" : r.checkedInAt ? "Checked in · Undo" : "Check in"}</button></article>)}</div>{visible.length>200 && <p>Showing the first 200 matches. Search a name or choose a class to narrow the list.</p>}
    </section>
  </main>;
}
