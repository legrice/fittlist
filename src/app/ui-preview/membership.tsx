"use client";
import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { usePrototype } from "./prototype-state";
import styles from "./preview.module.css";
const plans = [
 {id:"free",name:"Free",audience:"For people and studios getting started",description:"Get discovered and keep your community in the loop.",features:["Personal or studio profile, links, and QR code","One studio calendar, managed by its owner","Publish classes and appear in Explore","Following, saving, and joining groups","10 share exports per month · one saved look"]},
 {id:"pro",name:"Pro",audience:"For independent instructors and studio owners",description:"Make your weekly promotion feel like you.",features:["Everything in Free","Unlimited share image exports","Every share design and unlimited saved looks","Your colors and logo · planned","Deeper individual insights · planned","Export multiple formats at once · planned"]},
 {id:"studio",name:"Studio / Team",audience:"For studios running a schedule together",description:"One place for your calendars, coaches, and team.",features:["Everything in Pro for the studio workspace","Manage multiple studio calendars · proposed","Invite staff with admin and editor roles · proposed","Assign instructors and coordinate cover · proposed","Shared studio branding and saved looks · proposed","Studio-wide class and engagement insights · proposed"]},
] as const;
export default function Membership({reason}:{reason?:string}) {
 const p=usePrototype(); const [annual,setAnnual]=useState(false);
 const [selected,setSelected]=useState<"free"|"pro"|"studio">(p.membershipPlan==="free"?"pro":p.membershipPlan);
 const plan=plans.find(item=>item.id===selected)!;
 return <div className={styles.membership}>
  <span className={styles.proBadge}><Sparkles size={15}/>Find your fit</span>
  <h2>Your next level.</h2>
  <p>{reason || "Start free. Build your brand with Pro. Bring your team together with Studio."}</p>
  <div className={styles.tierOptions} role="group" aria-label="Membership tier">{plans.map(item=><button key={item.id} aria-pressed={selected===item.id} onClick={()=>setSelected(item.id)}><strong>{item.name}</strong><span>{item.audience}</span><small>{item.id==="free"?"$0":item.id==="pro"?"From $5.75/month, billed yearly":"Pricing to be decided"}{p.membershipPlan===item.id?" · Current preview plan":""}</small></button>)}</div>
  <h3 className={styles.planHeading}>{plan.name}</h3><p>{plan.description}</p>
  {selected==="pro" && <><div className={styles.planSwitch} role="group" aria-label="Billing period"><button aria-pressed={!annual} onClick={()=>setAnnual(false)}>Monthly</button><button aria-pressed={annual} onClick={()=>setAnnual(true)}>Yearly · save 28%</button></div><p className={styles.planPrice}><strong>{annual?"$69":"$7.99"}</strong> / {annual?"year":"month"}</p><p>{annual?"Equivalent to $5.75/month, billed annually.":"Billed monthly. Cancel anytime."}</p></>}
  {selected==="free" && <p className={styles.planPrice}><strong>$0</strong> / month</p>}
  {selected==="studio" && <div className={styles.freePlan}><strong>Built for a team, billed per studio.</strong><p>Proposed tier. Pricing, staff allowance, and calendar limits are still being explored. Your personal Pro plan and a studio workspace would be separate memberships.</p></div>}
  <ul>{plan.features.map(item=><li key={item}><Check size={18}/>{item}</li>)}</ul>
  <div className={styles.freePlan}><strong>Basic participation stays free.</strong><p>Keep your profile, published classes, following, saved classes, and profile-link sharing. Studio plans add collaboration and management tools.</p></div>
  <p className={styles.prototypeNote}>Prototype only. No payment or subscription is created. Studio selection demonstrates the tier, not new management functionality. Plan changes and usage reset when you reload.</p>
  <button className={styles.membershipCta} onClick={()=>{p.setMembershipPlan(selected);p.back();}}>{p.membershipPlan===selected?"Keep current preview plan":selected==="free"?"Switch to Free in preview":`Try ${plan.name} in preview`}</button>
 </div>;
}
