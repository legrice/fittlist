"use client";
import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { withTimeout } from "@/lib/async";
import { requestMagicLink } from "@/app/actions/auth";
import { checkInEvent, refreshEventDesk, removeEventWaitlist, promoteEventWaitlist, saveEventSettings } from "@/app/actions/event-registration";
import type { EventSchedule } from "@/lib/event-data";
import { fmtTime, fmtDateLong } from "@/lib/format";

type Attendee = {id:string;name:string;email:string;classId:string;className:string;time:string;date:string;checkedInAt:string|null};
export function EventRegistrationDesk(initial:{event:EventSchedule;roster:Attendee[];waiting:Omit<Attendee,"checkedInAt">[];rosterTruncated:boolean;publishedDate:string|null}) {
  const [snapshot,setSnapshot]=useState(initial);
  const {event,roster,waiting,rosterTruncated,publishedDate}=snapshot;
  const router=useRouter(), refreshSequence=useRef(0);
  const refresh=useCallback(async()=>{const revision=++refreshSequence.current;const data=await withTimeout(refreshEventDesk(initial.event.slug,initial.event.date!),10000);if(revision!==refreshSequence.current)return;if(data)setSnapshot(data);else router.refresh();},[initial.event.slug,initial.event.date,router]);
  const [query,setQuery]=useState(""),[filter,setFilter]=useState(""),[message,setMessage]=useState(""),[pending,setPending]=useState(""),[capacities,setCapacities]=useState<Record<string,number>>(()=>Object.fromEntries(event.classes.map(c=>[c.id,c.capacity ?? 20])));
  const [waitlists,setWaitlists]=useState<Record<string,boolean>>(()=>Object.fromEntries(event.classes.map(c=>[c.id,c.waitlistEnabled])));
  const [walkName,setWalkName]=useState(""),[walkEmail,setWalkEmail]=useState(""),[walkClass,setWalkClass]=useState(""),[walkConsent,setWalkConsent]=useState(false);
  const busy=useRef(false), dirty=useRef(false);
  useEffect(()=>{if(!dirty.current){setCapacities(Object.fromEntries(event.classes.map(c=>[c.id,c.capacity ?? 20])));setWaitlists(Object.fromEntries(event.classes.map(c=>[c.id,c.waitlistEnabled])));}},[event]);
  useEffect(()=>{const update=()=>{if(document.visibilityState==='visible' && !busy.current && !dirty.current)void refresh().catch(()=>setMessage('Couldn’t refresh the tally. Try Refresh tally.'));};const interval=setInterval(update,15000);window.addEventListener('focus',update);window.addEventListener('online',update);return()=>{clearInterval(interval);window.removeEventListener('focus',update);window.removeEventListener('online',update);};},[refresh]);
  const act=async(id:string,fn:()=>Promise<{ok:boolean;error?:string}>)=>{if(busy.current)return;busy.current=true;refreshSequence.current++;setPending(id);setMessage("");try{const result=await withTimeout(fn(),20000);setMessage(result.ok ? (id==='walkup' ? "Signup link sent. The attendee must verify their email to register or join the waitlist." : "Saved") : result.error || "Couldn’t save. Try again.");if(result.ok){if(id==='settings')dirty.current=false;await refresh();}}catch{setMessage("Connection interrupted. Refresh and try again.");}finally{busy.current=false;setPending("");}};
  const visible=roster.filter(r=>(!filter || r.classId===filter) && `${r.name} ${r.email}`.toLowerCase().includes(query.toLowerCase()));
  const published=publishedDate===event.date;
  const [qrClass,setQrClass]=useState("");
  const qrSelection=event.classes.find(c=>c.id===qrClass && c.public && c.capacity);
  const qrQuery=qrSelection ? `?class=${encodeURIComponent(qrSelection.id)}&d=${encodeURIComponent(event.date!)}` : "";
  const signupHref=`/s/${event.slug}/register${qrQuery}`;
  return <main className="event-desk">
    <header><BackLink className="ghost event-desk-back" href={`/s/${event.slug}/manage`} label="Back to studio admin">← Studio admin</BackLink><h1><span className="event-desk-studio-name">{event.name}</span><span className="event-desk-page-title">Front desk</span></h1><p><span className="event-desk-mobile-label">Front desk · </span>{event.date ? fmtDateLong(event.date) : "Choose a date"}</p></header>
    <div className="event-desk-toolbar"><button className="ghost" disabled={!!pending} onClick={()=>void act("refresh",async()=>({ok:true}))}>Refresh tally</button>{published && <><Link className="btn" href={`/s/${event.slug}/register`} target="_blank">Open attendee signup</Link><a className="ghost" href={`/api/events/${event.slug}/export`}>Export attendee CSV</a></>}</div>
    <div className="event-stats"><div><strong>{event.classes.reduce((n,c)=>n+c.count,0)}</strong><span>Class registrations</span></div><div><strong>{event.uniqueAttendees}</strong><span>Unique attendees</span></div><div><strong>{event.classes.reduce((n,c)=>n+c.checked,0)}</strong><span>Class check-ins</span></div></div>
    <p role="status" aria-live="polite">{message || "Refreshes every 15 seconds while this page is open."}</p>
    <details className="event-desk-setup" open={!published}><summary>Event setup and signup QR</summary><div className="event-desk-columns"><section className="event-panel">
      <h2>Event setup</h2><form method="get"><label>Event date<input type="date" name="date" required defaultValue={event.date || "2026-09-12"} /></label><button className="ghost">Preview this date</button></form>
      <p>Build the classes in your space’s <Link href={`/s/${event.slug}/manage/calendar`}>calendar</Link>, then set their limits here. New classes start at 20 places when you save.</p>
      {event.classes.length===0 && <p>No classes scheduled on this date yet.</p>}
      {event.truncated && <p role="alert">This space has too many class templates to show safely here. Narrow its schedule before opening event registration.</p>}
      <div className="event-capacities">{event.classes.map(c=><label key={c.id}><span><strong>{fmtTime(c.time)} · {c.name}</strong><small>{c.count} registered · {c.waiting} waiting · {c.checked} checked in{!c.public ? " · Private: not open for signup" : ""}</small></span><input aria-label={`Capacity for ${c.name} at ${fmtTime(c.time)}`} type="number" inputMode="numeric" min={Math.max(1,c.count)} max={1000} value={capacities[c.id] ?? 20} onChange={e=>{dirty.current=true;setCapacities(v=>({...v,[c.id]:Number(e.target.value)}));}} /></label>)}</div>
      {event.classes.map(c=><label className="event-consent" key={`wait-${c.id}`}><input type="checkbox" checked={waitlists[c.id] ?? false} onChange={e=>{dirty.current=true;setWaitlists(v=>({...v,[c.id]:e.target.checked}));}} /><span>Enable waitlist for {c.name} at {fmtTime(c.time)}</span></label>)}
      <button className="btn si" disabled={!!pending || !event.classes.length || event.truncated} onClick={()=>void act('settings',()=>saveEventSettings(event.slug,event.date!,event.classes.map(c=>({id:c.id,capacity:capacities[c.id] ?? 20,waitlist:waitlists[c.id] ?? false}))))}>{pending==='settings' ? "Saving…" : published ? "Save class limits" : "Open registration for this date"}</button>
      <p>When a place opens, confirm the next waitlisted attendee below and contact them directly. Turning off a waitlist stops new joins; existing entries remain.</p>
    </section><section className="event-panel event-qr">
      <h2>Attendee signup</h2>{published ? <><img src={`/api/events/${event.slug}/qr`} alt={`QR code for ${event.name} registration`} width={240} height={240}/><p>Have attendees scan this with their own phones. Keep your iPad on this registration desk.</p><Link href={`/s/${event.slug}/register`} target="_blank">fittlist.co/s/{event.slug}/register</Link></> : <p>Save the event’s date and class limits to activate its signup link and QR code.</p>}
      <p>Attendees verify their email, confirm a place, and can share the class. Optional profile setup comes later.</p>
    </section></div></details>
    {published && <section className="event-panel event-qr">
      <h2>Class signup QR</h2>
      <label>Choose a signup QR<select aria-label="Choose a signup QR" value={qrSelection?.id || ""} onChange={e=>setQrClass(e.target.value)}><option value="">All event classes</option>{event.classes.filter(c=>c.public && c.capacity).map(c=><option key={c.id} value={c.id}>{fmtTime(c.time)} · {c.name}</option>)}</select></label>
      <h3>{qrSelection ? `${fmtTime(qrSelection.time)} · ${qrSelection.name}` : event.name}</h3>
      <img key={qrQuery} src={`/api/events/${event.slug}/qr${qrQuery}`} alt={`Signup QR for ${qrSelection?.name || event.name}`} width={320} height={320}/>
      <p>Scan, enter your name and email, then confirm by email. Your confirmed class goes straight into your FittList calendar. No profile setup needed.</p>
      <Link className="event-secondary" href={signupHref} target="_blank">Open this signup page</Link>
      <a className="event-secondary" href={`/api/events/${event.slug}/qr${qrQuery}`} target="_blank" rel="noopener noreferrer">Open QR full screen</a>
    </section>}
    {published && <details className="event-panel event-walkup"><summary>Send a walk-up signup link</summary><p>Enter the attendee’s details with their permission. They confirm by email on their own device; your iPad stays signed in as an admin.</p><form onSubmit={e=>{e.preventDefault();if(!walkConsent)return;void act('walkup',async()=>{const result=await requestMagicLink(walkEmail,null,"signup",{studioId:event.id,classId:walkClass,date:event.date!,name:walkName});if(result.ok){setWalkName("");setWalkEmail("");setWalkClass("");setWalkConsent(false);}return result;});}}>
      <div className="event-roster-filters"><label>Attendee name<input autoComplete="off" required minLength={2} maxLength={80} value={walkName} onChange={e=>setWalkName(e.target.value)} /></label><label>Attendee email<input autoComplete="off" type="email" inputMode="email" required maxLength={254} value={walkEmail} onChange={e=>setWalkEmail(e.target.value)} /></label></div>
      <label>Choose a class<select aria-label="Choose a class" required value={walkClass} onChange={e=>setWalkClass(e.target.value)}><option value="">Select a class</option>{event.classes.filter(c=>c.public && c.capacity && !c.past && !event.closed && (c.count<c.capacity || c.waitlistEnabled)).map(c=><option key={c.id} value={c.id}>{fmtTime(c.time)} · {c.name} · {c.waiting>0 || c.count>=c.capacity! ? "Waitlist" : `${c.capacity!-c.count} places left`}</option>)}</select></label>
      <label className="event-consent"><input type="checkbox" required checked={walkConsent} onChange={e=>setWalkConsent(e.target.checked)} /><span>The attendee has asked me to send this signup link to their email.</span></label>
      <button className="btn si" disabled={!!pending}>{pending==='walkup' ? "Sending…" : "Send attendee signup link"}</button><p>After verification, they receive an available place or join the enabled waitlist. This form does not sign them into your iPad.</p>{message && <p>{message}</p>}
    </form></details>}
    <section className="event-panel"><h2>Waitlist · {event.classes.reduce((n,c)=>n+c.waiting,0)}</h2><p>Listed in signup order. Confirm the next person only after checking they can attend, then contact them directly. No automatic confirmation email is sent.</p>
      {!waiting.length && <p>No one is waiting yet.</p>}
      <div className="event-roster">{waiting.slice(0,200).map(r=>{const c=event.classes.find(c=>c.id===r.classId);const next=waiting.find(w=>w.classId===r.classId)?.id===r.id;return <article key={r.id}><div><strong>{r.name || "Attendee"}</strong><span>{r.email}</span><small>{fmtTime(r.time)} · {r.className}</small></div><button className="btn si" disabled={!!pending || !next || !c || c.capacity===null || c.count>=c.capacity || !c.public || c.past || event.closed} onClick={()=>void act(r.id,()=>promoteEventWaitlist(event.slug,r.id))}>{pending===r.id ? "Confirming…" : "Confirm place"}</button><button className="ghost" disabled={!!pending} onClick={()=>{if(window.confirm(`Remove ${r.name || "this attendee"} from the waitlist?`))void act(r.id,()=>removeEventWaitlist(event.slug,r.id));}}>Remove</button></article>;})}</div>
      {waiting.length>200 && <p>Showing the first 200 waiting attendees. Export the CSV for the full list.</p>}
    </section>
    <section className="event-panel"><h2>Attendees</h2><p>Names and emails are for managing this event. Registration is not consent to marketing emails.</p>
      <div className="event-roster-filters"><label>Search attendees<input type="search" placeholder="Name or email" value={query} onChange={e=>setQuery(e.target.value)} /></label><label>Class<select aria-label="Class" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All classes</option>{event.classes.map(c=><option key={c.id} value={c.id}>{fmtTime(c.time)} · {c.name}</option>)}</select></label></div>
      {rosterTruncated && <p role="alert">More than 10,000 registrations. This list is incomplete; contact support for a full export.</p>}
      {!visible.length && <p>No matching registrations yet.</p>}
      <div className="event-roster">{visible.slice(0,200).map(r=><article key={r.id}><div><strong>{r.name || "Attendee"}</strong><span>{r.email}</span><small>{fmtTime(r.time)} · {r.className}</small></div><button className={r.checkedInAt ? "btn" : "btn si"} aria-pressed={!!r.checkedInAt} disabled={!!pending} onClick={()=>void act(r.id,()=>checkInEvent(event.slug,r.id,!r.checkedInAt))}>{pending===r.id ? "Saving…" : r.checkedInAt ? "Checked in · Undo" : "Check in"}</button></article>)}</div>{visible.length>200 && <p>Showing the first 200 matches. Search a name or choose a class to narrow the list.</p>}
    </section>
  </main>;
}
