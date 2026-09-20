"use client";
import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { usePrototype } from "./prototype-state";
import styles from "./preview.module.css";
export default function Membership({reason}:{reason?:string}) {
 const p=usePrototype(); const [annual,setAnnual]=useState(false);
 return <div className={styles.membership}>
  <span className={styles.proBadge}><Sparkles size={15}/>FittList Pro</span>
  <h2>Make every week yours.</h2>
  <p>{reason || "More ways to share your teaching. Less time making it look good."}</p>
  <div className={styles.planSwitch} role="group" aria-label="Billing period"><button aria-pressed={!annual} onClick={()=>setAnnual(false)}>Monthly</button><button aria-pressed={annual} onClick={()=>setAnnual(true)}>Yearly · save 28%</button></div>
  <p className={styles.planPrice}><strong>{annual?"$69":"$7.99"}</strong> / {annual?"year":"month"}</p>
  <p>{annual?"Equivalent to $5.75/month, billed annually.":"Billed monthly. Cancel anytime."}</p>
  <ul>{["Unlimited share image exports","Every share design","Unlimited saved looks","Your colors and logo · planned","Deeper insights · planned","Export multiple formats at once · planned"].map(item=><li key={item}><Check size={18}/>{item}</li>)}</ul>
  <div className={styles.freePlan}><strong>Free stays useful.</strong><p>Your calendar, published classes, following, saving, discovery, and profile links stay free. Includes 10 image exports per month, the standard design, and one saved look.</p></div>
  <p className={styles.prototypeNote}>Prototype only. No payment or subscription is created. Plan changes and usage reset when you reload.</p>
  <button className={styles.membershipCta} onClick={()=>{p.setPro(!p.pro);p.back();}}>{p.pro?"Switch to Free in preview":"Try Pro in preview"}</button>
 </div>;
}
