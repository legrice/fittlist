"use client";
import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { usePrototype } from "./prototype-state";
import styles from "./preview.module.css";
const money=(cents:number)=>`$${(cents/100).toFixed(2)}`;
export default function Membership({reason}:{reason?:string}) {
 const p=usePrototype();
 const [selected,setSelected]=useState<"free"|"pro"|"studio">("pro");
 const [channel,setChannel]=useState<"web"|"apple">("web");
 const [storeMessage,setStoreMessage]=useState("");
 const [step,setStep]=useState<"plans"|"checkout"|"confirmed">("plans");
 const [annual,setAnnual]=useState(false);
 const studios=p.live?p.live.managed.map(s=>s.name):["Ironbound Performance Athletics"];
 const [studio,setStudio]=useState(studios[0]||"");
 const [eligible,setEligible]=useState(true);
 const [code,setCode]=useState("");const [discount,setDiscount]=useState("");const [error,setError]=useState("");
 const [receipt,setReceipt]=useState("");
 const base=annual?6900:799;
 const percent=channel==="web" && selected==="pro" && (eligible||discount==="WELCOME20")?20:0;
 const total=Math.round(base*(100-percent)/100);
 const status=p.studioSubscriptions[studio];
 const features=selected==="free"?["See your shifts and coaching schedule","Receive schedule changes and assignments","Request swaps or cover and respond to requests","Publish your own classes, follow, and save","10 image exports per month and one saved look"]:selected==="pro"?["Unlimited personal share image exports","Every share design and unlimited saved looks","Personal branding and deeper insights · planned","Multiple export formats · planned"]:["Manage studio calendars and assign instructors","Staff participate without a personal subscription","Coordinate shift swaps and cover requests","Admin and editor permissions","Shared studio branding and team insights · planned"];
 const setStudioStatus=(next:"active"|"ending"|"grace"|"readonly")=>p.setStudioSubscriptions(v=>({...v,[studio]:next}));
 const confirm=()=>{
  const summary=selected==="studio"?`${studio} · Studio / Team preview activated. No payment.`:`Personal Pro · ${money(total)} simulated ${annual?"annual":"monthly"} payment.`;
  if(selected==="studio")setStudioStatus("active");else {p.setMembershipPlan("pro");p.setPersonalEnding(false);p.setBillingProvider(channel);}
  p.setBillingReceipts(v=>[...v,{scope:selected==="studio"?studio:"Personal Pro",amount:selected==="studio"?"Not charged · pricing pending":money(total),date:new Date().toLocaleDateString()}]);
  setReceipt(summary);setStep("confirmed");
 };
 return <div className={styles.membership}>
  <span className={styles.proBadge}><Sparkles size={15}/>FittList membership</span>
  <h2>{step==="checkout"?"Review your membership.":step==="confirmed"?"You’re all set.":"Your schedule stays free."}</h2>
  <details className={styles.planDemo}><summary>Preview purchase platform</summary><button onClick={()=>{setChannel("web");setStep("plans");}}>Web checkout</button><button onClick={()=>{setChannel("apple");setStep("plans");}}>Apple App Store</button><p>Current preview: {channel==="apple"?"Apple App Store":"Web"}</p></details>
  <p>{reason || "Your studio pays for team management. You never need personal Pro to see or respond to your work schedule."}</p>
  {step==="confirmed"?<><div className={styles.freePlan}><Check/><p role="status">{receipt}</p><p>{selected==="studio"?"Your personal membership is unchanged. Invited staff keep free access to their assignments.":"Your personal promotion tools are unlocked. Studio memberships are separate."}</p></div><button className={styles.membershipCta} onClick={()=>setStep("plans")}>Manage memberships</button></>:<>
  {step==="plans"?<>
   <div className={styles.tierOptions} role="group" aria-label="Membership tier">{(["free","pro","studio"] as const).map(tier=><button key={tier} aria-pressed={selected===tier} onClick={()=>{setSelected(tier);setError("");}}><strong>{tier==="free"?"Free":tier==="pro"?"Personal Pro":"Studio / Team"}</strong><span>{tier==="free"?"Your calendar and staff participation":tier==="pro"?"Optional tools for your own promotion":"Management paid for by the studio"}</span><small>{tier==="free"?"$0":tier==="pro"?"$7.99/month or $69/year":"Pricing to be decided"}</small></button>)}</div>
   <ul>{features.map(feature=><li key={feature}><Check size={18}/>{feature}</li>)}</ul>
  </>:<button className={styles.backButton} onClick={()=>setStep("plans")}>Back to plans</button>}
  {selected==="studio" && <div className={styles.detailForm}><label>Studio workspace<select value={studio} onChange={e=>setStudio(e.target.value)}>{studios.map(name=><option key={name}>{name}</option>)}</select></label>{!studios.length&&<p>You don’t manage a studio workspace yet.</p>}<div className={styles.freePlan}><strong>{status?`Studio membership: ${status==="readonly"?"Read-only":status}`:"Separate studio membership"}</strong><p>Only this workspace receives management access. Staff can see assignments, receive updates, and respond to shifts with a Free account. Studio membership does not unlock personal Pro.</p><p>After cancellation, schedule visibility and history remain available. A management grace period gives the team time to finish upcoming changes.</p></div></div>}
  {selected==="pro" && <><div className={styles.planSwitch} role="group" aria-label="Billing period"><button aria-pressed={!annual} onClick={()=>setAnnual(false)}>Monthly</button><button aria-pressed={annual} onClick={()=>setAnnual(true)}>Yearly</button></div><p className={styles.planPrice}><strong>{money(base)}</strong> / {annual?"year":"month"}</p></>}
  {step==="checkout" && selected==="pro" && channel==="web" && <>
   <div className={styles.freePlan}><strong>{percent?"20% off your first billing period":"Standard pricing"}</strong><p>{eligible?"Founding-member offer applied automatically (simulated eligibility).":discount?"WELCOME20 applied.":"No discount applied."}</p><p><strong>Due today: {money(total)}</strong></p><p>Then {money(base)} per {annual?"year":"month"} after the first {annual?"year":"month"}, until canceled. Discounts do not stack. USD, illustrative totals; taxes are not calculated in this preview.</p></div>
   <form className={styles.detailForm} onSubmit={e=>{e.preventDefault();const normalized=code.trim().toUpperCase();if(normalized!=="WELCOME20"){setError("This demo code isn’t valid. Try WELCOME20.");return;}setDiscount(normalized);setError(eligible?"Founding offer already applied. Offers cannot be combined.":"Code applied: 20% off your first billing period.");}}><label>Discount code<input value={code} onChange={e=>setCode(e.target.value)} placeholder="Enter code"/></label><button type="submit" className={styles.profileProLink}>Apply code</button><p role="status">{error}</p>{discount&&<button type="button" onClick={()=>{setDiscount("");setCode("");setError("");}}>Remove code</button>}</form>
   <details className={styles.planDemo}><summary>Preview discount eligibility</summary><label><input type="checkbox" checked={eligible} onChange={e=>setEligible(e.target.checked)}/> Existing app user</label><p>Demo code: WELCOME20. Eligibility, expiry, redemption limits, and taxes will require billing integration.</p></details>
  </>}
  {channel==="apple" && <div className={styles.freePlan}><strong>Purchased through Apple</strong><p>Personal Pro uses Apple’s purchase confirmation in the iOS app. Prices and eligible offers will come from the App Store. Web discount codes do not apply here.</p>{selected==="pro"&&step==="checkout"&&<p>Illustrative price: {money(base)} per {annual?"year":"month"}, renewing until canceled. No introductory offer is applied in this simulation.</p>}<button className={styles.profileProLink} onClick={()=>setStoreMessage("Offer-code redemption will open Apple’s redemption sheet. No code has been redeemed in this preview.")}>Redeem Apple offer code</button><button className={styles.profileProLink} onClick={()=>setStoreMessage(p.billingProvider==="apple"&&p.pro?"Your simulated Apple membership is already active. No new purchase was made.":"No Apple purchase is connected to this prototype. The iOS app will verify purchases before restoring access.")}>Restore purchases</button><p role="status">{storeMessage}</p></div>}
  {step==="checkout" && selected==="studio" && <p>Studio pricing is not set. This confirms a workspace preview without collecting payment details or charging a studio.</p>}
  {step==="plans" && <>
   <h3 className={styles.planHeading}>Manage memberships</h3>
   <div className={styles.freePlan}><strong>Personal: {p.pro?(p.personalEnding?"Pro · ends after the current period":"Pro"):"Free"}</strong><p>Your personal plan never controls access to assigned shifts.</p>{p.pro&&p.billingProvider==="apple"?<><p>Managed through the App Store.</p><button className={styles.profileProLink} onClick={()=>setStoreMessage("In the iOS app, this opens Apple’s subscription management. No subscription was changed.")}>Manage Apple subscription</button><p role="status">{storeMessage}</p></>:p.pro&&<button className={styles.profileProLink} onClick={()=>p.setPersonalEnding(!p.personalEnding)}>{p.personalEnding?"Keep personal Pro":"Cancel personal renewal"}</button>}</div>
   {selected==="studio"&&status&&<div className={styles.planDemo}><button onClick={()=>setStudioStatus(status==="active"?"ending":"active")}>{status==="active"?"Cancel studio renewal":"Resume studio membership"}</button><details><summary>Preview billing lifecycle</summary><button onClick={()=>setStudioStatus("grace")}>Simulate payment failure / grace period</button><button onClick={()=>setStudioStatus("readonly")}>Simulate end of grace period</button></details><p>Lifecycle simulation only. Existing schedules remain visible; studio billing never blocks staff schedule access.</p></div>}
   {p.billingReceipts.length>0&&<><h3 className={styles.planHeading}>Demo billing history</h3>{p.billingReceipts.map((item,index)=><div className={styles.freePlan} key={index}><strong>{item.scope}</strong><p>{item.date} · {item.amount}</p><small>Preview receipt only, not an invoice.</small></div>)}</>}
  </>}
  <p className={styles.prototypeNote}>Studio purchasing on iOS is not enabled in this concept; its App Store approach needs review. Prototype only. No Stripe connection, payment, or real subscription. Plan and billing changes reset on reload. Studio management and lifecycle restrictions are proposed, not enforced against your real calendars.</p>
  <button className={styles.membershipCta} disabled={(selected==="studio"&&(!studio||channel==="apple")) || (selected==="pro"&&p.pro)} onClick={()=>{if(selected==="free"){if(p.pro&&p.billingProvider==="apple"){setStoreMessage("Use Manage Apple subscription to cancel or change your Apple plan.");setSelected("pro");return;}if(p.pro)p.setPersonalEnding(true);p.back();}else if(step==="checkout")confirm();else setStep("checkout");}}>{selected==="studio"&&channel==="apple"?"Studio purchase flow to be decided":selected==="pro"&&p.pro?"Already subscribed · manage above":selected==="free"?(p.pro?"Schedule switch to Free":"Keep Free"):step==="checkout"?"Confirm simulated membership":"Continue to checkout preview"}</button>
  </>}
 </div>;
}
