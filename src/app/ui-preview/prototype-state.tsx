"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

export type PreviewClass = { id: string; name: string; place: string; coach: string; date: string; time: string; duration: string };
export const initialClasses: PreviewClass[] = [
  { id:"asana", name:"Asana Lab", place:"Asana Soul Practice", coach:"Erin Clyne", date:"2026-09-19", time:"08:00", duration:"60" },
  { id:"sculpt", name:"Sculpt", place:"Jane DO Jersey City", coach:"Freddie Morgan", date:"2026-09-20", time:"10:30", duration:"50" },
  { id:"ironbound", name:"Guns, Buns, and Lungs", place:"Ironbound Performance Athletics", coach:"Matt LeGrice", date:"2026-09-21", time:"18:00", duration:"60" },
];
export type Destination = { kind:"settings"|"manage"|"edit-profile"|"person"|"studio"|"class"|"edit-class"|"add-class"|"conversation"; name?:string };
function useStateStore() {
  const [profile,setProfile] = useState({ name:"Matt LeGrice", handle:"mattlegrice", bio:"Strength & mobility coach", location:"Jersey City, NJ", email:"matt@example.com" });
  const [schedule,setSchedule] = useState(initialClasses);
  const [preferences,setPreferences] = useState<Record<string,boolean>>({ "Class reminders":true,"New followers":true,"Group activity":true,"Messages":true,"Email updates":false,"Public profile":true,"Allow messages":true,"Approve followers":false });
  const [away,setAway] = useState({ start:"",end:"",note:"",reply:"" });
  const [following,setFollowing] = useState<string[]>([]);
  const [saved,setSaved] = useState<string[]>([]);
  const [connections,setConnections] = useState<string[]>([]);
  const [roles,setRoles] = useState<Record<string,string>>({"Freddie Morgan":"Editor","Erin Clyne":"Editor"});
  const [timezone,setTimezone] = useState("America/New_York");
  const [messages,setMessages] = useState(["See you at Asana Lab!"]);
  const [stack,setStack] = useState<Destination[]>([]);
  return { profile,setProfile,schedule,setSchedule,preferences,setPreferences,away,setAway,following,setFollowing,saved,setSaved,connections,setConnections,messages,setMessages,roles,setRoles,timezone,setTimezone,stack,open:(route:Destination)=>setStack(s=>[...s,route]),back:()=>setStack(s=>s.slice(0,-1)),reset:()=>setStack([]) };
}
type Store = ReturnType<typeof useStateStore>;
const Context = createContext<Store|null>(null);
export function PrototypeProvider({children}:{children:ReactNode}) { const value=useStateStore(); return <Context.Provider value={value}>{children}</Context.Provider>; }
export function usePrototype() { const value=useContext(Context); if(!value) throw new Error("PrototypeProvider is required"); return value; }
export const dateLabel = (date:string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
export const timeLabel = (time:string) => new Date(`2026-09-20T${time}:00`).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
