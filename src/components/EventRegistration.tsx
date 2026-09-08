"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { requestMagicLink } from "@/app/actions/auth";
import { registerForEvent, refreshEvent } from "@/app/actions/event-registration";
import type { EventSchedule } from "@/lib/event-data";
import { fmtDateLong, fmtTime } from "@/lib/format";
import { SavedClassShareSheet } from "@/components/SavedClassShareSheet";
import { withTimeout } from "@/lib/async";
import { Wordmark } from "@/components/Wordmark";

export function EventRegistration({event:initial,selectedId}:{event:EventSchedule;selectedId?:string}) {
  const [event,setEvent] = useState(initial), [selected,setSelected] = useState(selectedId || ""), [share,setShare] = useState(false);
  const [name,setName] = useState(""), [email,setEmail] = useState(""), [consent,setConsent] = useState(false), [sent,setSent] = useState(false), [pending,setPending] = useState(false), [message,setMessage] = useState("");
  const busy = useRef(false);
  useEffect(()=>setEvent(initial),[initial]);
  useEffect(()=>{
    let stopped=false;
    const refresh=()=>{void refreshEvent(initial.slug).then(data=>{if(data && !stopped)setEvent(data);}).catch(()=>{});};
    window.addEventListener('focus',refresh);window.addEventListener('online',refresh);
    return ()=>{stopped=true;window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);};
  },[initial.slug]);
  const cls = event.classes.find(c=>c.id===selected), full = !!cls && cls.capacity !== null && cls.count>=cls.capacity;
  const run = async (remove=false) => {
    if(busy.current || !cls || !event.date) return;
    busy.current=true;setPending(true);setMessage("");
    try {
      if(event.signedIn) {
        const result=await withTimeout(registerForEvent(event.slug,cls.id,event.date,!remove),20000);
        if(!result.ok) setMessage(result.error || "Please try again.");
        const updated=await withTimeout(refreshEvent(event.slug),10000);if(updated)setEvent(updated);
      } else {
        if(!consent) {setMessage("Please agree to continue.");return;}
        const result=await withTimeout(requestMagicLink(email,null,"signup",{studioId:event.id,classId:cls.id,date:event.date,name}),20000);
        if(result.ok)setSent(true);else setMessage(result.error || "Couldn’t send the email. Please try again.");
      }
    } catch {setMessage("Connection interrupted. Please try again; an existing registration won’t be duplicated.");}
    finally {busy.current=false;setPending(false);}
  };
  return <main className="event-page">
    <header className="event-hero"><Link href="/"><Wordmark variant="cloud" /></Link><h1>{event.name}</h1><p>{event.date ? fmtDateLong(event.date) : "Schedule coming soon"}</p><p>{event.address}</p></header>
    <div className="event-content">
      {cls ? <section className="event-panel">
        <button className="ghost" type="button" disabled={pending} onClick={()=>{setSelected("");setSent(false);setMessage("");}}>← All classes</button>
        <h2>{cls.name}</h2><p>{fmtTime(cls.time)} · {cls.duration} min · Free</p><p>{cls.location}</p>
        {cls.description && <p>{cls.description}</p>}
        {cls.registered ? <>
          <h2>You’re signed up</h2><p>Your place is confirmed and the class is in your FittList calendar.</p>
          <button className="btn si" onClick={()=>setShare(true)}>Share that you’re going</button>
          <Link className="event-secondary" href="/calendar">View my calendar</Link>
          <details><summary>Can’t make it?</summary><p>Cancel to free your place for someone else.</p><button className="ghost" disabled={pending} onClick={()=>void run(true)}>Cancel registration</button></details>
        </> : event.closed || cls.past ? <p role="status">Registration is closed for this class.</p> : full ? <><h2>This class is full</h2><p>Choose another class, or check back if someone cancels.</p></> : sent ? <>
          <h2>Check your email</h2><p>We sent a secure link to <strong>{email}</strong>. Open it and tap Continue to finish signing up for this class.</p><p>Your place is confirmed after verification. Places aren’t held while you check your inbox.</p><button className="ghost" disabled={pending} onClick={()=>{setSent(false);setMessage("");}}>Change email or send again</button>
        </> : <>
          <p><strong>{Math.max(0,(cls.capacity ?? 0)-cls.count)} places left</strong></p>
          <p>Your name and email will be shared with {event.name}’s admins to manage your registration. Your registration is private in FittList unless you choose to share it.</p>
          {event.signedIn ? <><p>Registering as {event.viewerName || "your signed-in account"}.</p><button className="btn si" disabled={pending} onClick={()=>void run() }>{pending ? "Signing you up…" : "Sign up free"}</button></> : <form onSubmit={e=>{e.preventDefault();void run();}}>
            <label>Your name<input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)} enterKeyHint="next" /></label>
            <label>Email address<input type="email" autoComplete="email" inputMode="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} enterKeyHint="send" /></label>
            <label className="event-consent"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)} /><span>I agree to the <Link href="/terms" target="_blank">Terms of Use</Link> and acknowledge the <Link href="/privacy" target="_blank">Privacy Policy</Link>. Continue creates or signs into my FittList account.</span></label>
            <button className="btn si" disabled={pending}>{pending ? "Sending…" : "Email my signup link"}</button>
            <p>No password or app download needed. We’ll return you to this class.</p>
          </form>}
        </>}
        {message && <p role="alert">{message}</p>}
      </section> : <>
        <h2>Free classes</h2><p>Choose a class to reserve your place. Each attendee needs their own registration.</p>
        {!event.date || !event.classes.length ? <p role="status">The schedule isn’t open yet. Please check back soon.</p> : event.closed ? <p role="status">The event is closed on this date.</p> : <div className="event-class-grid">{event.classes.map(c=><button className="event-class-card" key={c.id} onClick={()=>{setSelected(c.id);setSent(false);setMessage("");}}><strong className="event-time">{fmtTime(c.time)}</strong><span><strong>{c.name}</strong><small>{c.duration} min · {c.location}</small><b>{c.registered ? "You’re signed up" : c.past ? "Registration closed" : c.capacity!==null && c.count>=c.capacity ? "Full" : `${Math.max(0,(c.capacity ?? 0)-c.count)} places left · Sign up free`}</b></span></button>)}</div>}
      </>}
      <p className="event-footnote">Questions? Ask the event team. <Link href={`/s/${event.slug}`}>View the space</Link></p>
    </div>
    {share && cls && event.date && <SavedClassShareSheet classId={cls.id} iso={event.date} name={cls.name} saveKind="rsvp" onClose={()=>setShare(false)} onToast={setMessage} />}
  </main>;
}
