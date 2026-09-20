"use client";
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

import { loadLivePreview } from "./live-data";
export type PreviewClass = { description?:string|null; own?:boolean; inCalendar?:boolean; photo?:string|null; id: string; name: string; place: string; coach: string; date: string; time: string; duration: string };
export const initialClasses: PreviewClass[] = [
  { id:"asana", name:"Asana Lab", place:"Asana Soul Practice", coach:"Erin Clyne", date:"2026-09-19", time:"08:00", duration:"60" },
  { id:"sculpt", name:"Sculpt", place:"Jane DO Jersey City", coach:"Freddie Morgan", date:"2026-09-20", time:"10:30", duration:"50" },
  { id:"ironbound", name:"Guns, Buns, and Lungs", place:"Ironbound Performance Athletics", coach:"Matt LeGrice", date:"2026-09-21", time:"18:00", duration:"60" },
];
export type Destination = { kind:"membership"|"settings"|"manage"|"edit-profile"|"person"|"studio"|"class"|"edit-class"|"add-class"|"conversation"; name?:string; view?:string };
function useStateStore() {
  const [studioDrafts,setStudioDrafts]=useState<Record<string,import("./studio-workspace").StudioDraft>>({});
  const [profile,setProfile] = useState({ name:"Matt LeGrice", handle:"mattlegrice", bio:"Strength & mobility coach", location:"Jersey City, NJ", email:"matt@example.com",photo:null as string|null });
  const [membershipPlan,setMembershipPlan]=useState<"free"|"pro"|"studio">("free");
  const pro=membershipPlan==="pro";
  const [studioSubscriptions,setStudioSubscriptions]=useState<Record<string,"active"|"ending"|"grace"|"readonly">>({});
  const [personalEnding,setPersonalEnding]=useState(false);
  const [billingProvider,setBillingProvider]=useState<"web"|"apple"|null>(null);
  const [billingReceipts,setBillingReceipts]=useState<{scope:string;amount:string;date:string}[]>([]);
  const setPro=(value:boolean)=>setMembershipPlan(value?"pro":"free");
  const [exportsUsed,setExportsUsed]=useState(0);
  const [live,setLive]=useState<Awaited<ReturnType<typeof loadLivePreview>>>(null);
  const [dataStatus,setDataStatus]=useState("loading");
  const reloadData=async()=>{setDataStatus("loading");try{const data=await loadLivePreview();if(!data){setLive(null);setSchedule(initialClasses);setSaved(["asana","sculpt"]);setFollowing([]);setProfile({name:"Matt LeGrice",handle:"mattlegrice",bio:"Strength & mobility coach",location:"Jersey City, NJ",email:"matt@example.com",photo:null});setDataStatus("signed-out");return;}setLive(data);setProfile(data.profile);setSchedule(data.schedule);setSaved(data.saved);setFollowing(data.people.filter(p=>p.following).map(p=>p.name));setMessages([]);setDataStatus("live");}catch{setDataStatus("error");}};
  useEffect(()=>{void reloadData();},[]);
  const [schedule,setSchedule] = useState(initialClasses);
  const [preferences,setPreferences] = useState<Record<string,boolean>>({ "Class reminders":true,"New followers":true,"Group activity":true,"Messages":true,"Email updates":false,"Public profile":true,"Allow messages":true,"Approve followers":false });
  const [away,setAway] = useState({ start:"",end:"",note:"",reply:"" });
  const [following,setFollowing] = useState<string[]>([]);
  const [saved,setSaved] = useState<string[]>(["asana","sculpt"]);
  const [connections,setConnections] = useState<string[]>([]);
  const [roles,setRoles] = useState<Record<string,string>>({"Freddie Morgan":"Editor","Erin Clyne":"Editor"});
  const [timezone,setTimezone] = useState("America/New_York");
  const [saveNotice,setSaveNotice]=useState("");
  const toggleSaved=(item:PreviewClass)=>{
    if(saved.includes(item.id)){setSaved(v=>v.filter(id=>id!==item.id));setSaveNotice("");return;}
    const start=new Date(`${item.date}T${item.time}:00`).getTime();
    const end=start+Number(item.duration)*60000;
    const conflict=schedule.find(c=>{
      if(!(c.own ?? (c.coach===profile.name || c.coach==="Matt LeGrice")))return false;
      const otherStart=new Date(`${c.date}T${c.time}:00`).getTime();
      return start<otherStart+Number(c.duration)*60000 && otherStart<end;
    });
    setSaved(v=>[...v,item.id]);
    setSaveNotice(conflict?`Saved. Just so you know, you’re coaching ${conflict.name} at ${timeLabel(conflict.time)} and the times overlap.`:"");
  };
  const [messages,setMessages] = useState(["See you at Asana Lab!"]);
  const [stack,setStack] = useState<Destination[]>([]);
  useEffect(()=>{
    const load=()=>{
      const id=new URLSearchParams(window.location.search).get("class");
      const routes=window.history.state?.previewRoutes;
      setStack(Array.isArray(routes) ? routes : id ? [{kind:"class",name:id}] : []);
    };
    load(); window.addEventListener("popstate",load);
    return ()=>window.removeEventListener("popstate",load);
  },[]);
  const navigate=(routes:Destination[],push:boolean)=>{
    const url=new URL(window.location.href);
    const current=routes.at(-1);
    if(current?.kind==="class") url.searchParams.set("class",current.name || ""); else url.searchParams.delete("class");
    const state={...window.history.state,previewRoutes:routes,previewDepth:push?(window.history.state?.previewDepth || 0)+1:0};
    window.history[push?"pushState":"replaceState"](state,"",url);
    setStack(routes);
  };
  return { studioDrafts,setStudioDrafts,saveNotice,setSaveNotice,toggleSaved,billingProvider,setBillingProvider,studioSubscriptions,setStudioSubscriptions,personalEnding,setPersonalEnding,billingReceipts,setBillingReceipts,membershipPlan,setMembershipPlan,pro,setPro,exportsUsed,setExportsUsed,live,dataStatus,reloadData,profile,setProfile,schedule,setSchedule,preferences,setPreferences,away,setAway,following,setFollowing,saved,setSaved,connections,setConnections,messages,setMessages,roles,setRoles,timezone,setTimezone,stack,
    open:(route:Destination)=>navigate([...stack,route],true),
    back:()=>{if(window.history.state?.previewDepth>0) window.history.back(); else navigate(stack.slice(0,-1),false);},
    reset:()=>navigate([],false) };

}
type Store = ReturnType<typeof useStateStore>;
const Context = createContext<Store|null>(null);
export function PrototypeProvider({children}:{children:ReactNode}) { const value=useStateStore(); return <Context.Provider value={value}>{children}</Context.Provider>; }
export function usePrototype() { const value=useContext(Context); if(!value) throw new Error("PrototypeProvider is required"); return value; }
export const dateLabel = (date:string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
export const timeLabel = (time:string) => new Date(`2026-09-20T${time}:00`).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
