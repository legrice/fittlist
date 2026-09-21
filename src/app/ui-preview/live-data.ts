"use server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/current-user";
import { runsOn, occurrenceEnded } from "@/lib/format";
import { loadPersonalCalendarData } from "@/app/actions/calendar-data";
import { discoverPeople, discoverStudios, discoverGroups, addBrowse } from "@/app/actions/discover";
import { myStaffStudios, staffView } from "@/app/actions/gym";
import type { PreviewClass } from "./prototype-state";

function clock(value:string) {
  const match=value.match(/(\d{1,2}):(\d{2})\s*(a|p)/i);
  if(!match) return /^\d\d:\d\d$/.test(value)?value:"00:00";
  return `${String(Number(match[1])%12+(match[3].toLowerCase()==="p"?12:0)).padStart(2,"0")}:${match[2]}`;
}
export async function loadLivePreview() {
  const me=await currentUser();
  if(!me) return null;
  const [personal,people,studios,groups,browse,staff]=await Promise.all([loadPersonalCalendarData(),discoverPeople(),discoverStudios(),discoverGroups(),addBrowse(),myStaffStudios()]);
  if(!personal) return null;
  const schedule:PreviewClass[]=[];
  for(let index=0;index<7;index++) {
    const date=new Date(`${personal.todayIso}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+index);
    const iso=date.toISOString().slice(0,10);
    for(const c of personal.classes) {
      if(!runsOn(c,iso,(date.getUTCDay()+6)%7)||occurrenceEnded(iso,c.startTime,c.durationMin,c.timeZone)) continue;
      schedule.push({id:`${c.id}.${iso}`,name:c.name,description:c.description,place:personal.studios.find(s=>s.id===c.studioId)?.name || c.location || "Location to come",coach:me.name,date:iso,time:c.startTime,duration:String(c.durationMin),own:true,inCalendar:true,photo:me.photo});
    }
  }
  const saved:string[]=[];
  for(const day of personal.savedDays) for(const c of day.items) {
    const id=`${c.classId}.${c.iso}`;saved.push(id);
    if(!schedule.some(item=>item.id===id)) schedule.push({id,name:c.name,place:c.where || "Location to come",coach:c.coachName,date:c.iso,time:clock(`${c.hm} ${c.ap}`),duration:String(c.durationMin),own:!!c.personal,inCalendar:true,photo:c.coachPhoto});
  }
  for(const day of browse?.days || []) for(const c of day.items) {
    const id=`${c.classId}.${c.iso}`;
    if(!schedule.some(item=>item.id===id)) schedule.push({id,name:c.name,place:c.where || "Location to come",coach:c.attributionName || c.coachName,date:c.iso,time:clock(`${c.hm} ${c.ap}`),duration:String(c.durationMin),own:c.own,inCalendar:c.own||c.saved,photo:c.coachPhoto});
  }
  const managed=staff.filter(s=>s.admin);
  const views=await Promise.all(managed.map(s=>staffView(s.id)));
  views.forEach(view=>view?.all.forEach(c=>{
    const id=`${c.classId}.${c.iso}`;
    if(!schedule.some(item=>item.id===id)) schedule.push({id,name:c.name,place:view.studioName,coach:c.onName || "Instructor to be confirmed",date:c.iso,time:clock(c.timeLabel),duration:String(c.durationMin),own:c.mine,inCalendar:c.mine});
  }));
  const db=await getDb();
  const [personAbout,studioAbout]=await Promise.all([
    people.people.length?db.select({id:schema.users.id,banner:schema.users.bannerPhoto,about:schema.users.about,disciplines:schema.users.disciplines,highlights:schema.users.highlights,certifications:schema.users.certifications}).from(schema.users).where(inArray(schema.users.id,people.people.map(p=>p.id))):[],
    studios.length?db.select({id:schema.studios.id,banner:schema.studios.bannerPhoto,about:schema.studios.about}).from(schema.studios).where(inArray(schema.studios.id,studios.map(s=>s.id))):[],
  ]);
  const memberships=await db.select({id:schema.groups.id,name:schema.groups.name,photo:schema.groups.photo,banner:schema.groups.bannerPhoto,description:schema.groups.description,purpose:schema.groups.purpose,location:schema.users.location}).from(schema.groupMembers).innerJoin(schema.groups,eq(schema.groups.id,schema.groupMembers.groupId)).innerJoin(schema.users,eq(schema.users.id,schema.groups.ownerUserId)).where(eq(schema.groupMembers.userId,me.id));
  const memberLists=await Promise.all(memberships.map(g=>db.select({name:schema.users.name}).from(schema.groupMembers).innerJoin(schema.users,eq(schema.users.id,schema.groupMembers.userId)).where(and(eq(schema.groupMembers.groupId,g.id)))));
  return {
    profile:{name:me.name,handle:me.handle || "",bio:me.title || "",location:me.location || "",email:me.email,photo:me.photo},
    schedule:schedule.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)),saved,
    people:people.people.map(person=>({...personAbout.find(p=>p.id===person.id),name:person.name,title:person.title,initials:person.name.split(" ").map(s=>s[0]).join("").slice(0,2),color:person.color,coordinates:person.lat!=null&&person.lng!=null?[person.lat,person.lng] as [number,number]:null,disciplines:person.disciplines,specialty:person.disciplines[0] || "Other",photo:person.photo,location:person.location,following:person.following})),
    studios:studios.map(s=>({banner:studioAbout.find(p=>p.id===s.id)?.banner || null,about:studioAbout.find(p=>p.id===s.id)?.about || "",name:s.name,placeKind:s.placeKind,types:s.types,type:s.types.join(" · ") || "Studio",location:s.address,photo:s.photo,coordinates:s.lat!=null&&s.lng!=null?[s.lat,s.lng] as [number,number]:null})),
    managed:managed.map(s=>({name:s.name,photo:s.photo,initials:s.name.split(" ").map(v=>v[0]).join("").slice(0,2),detail:"Studio calendar · You’re an admin"})),
    groups:[...memberships.map((g,index)=>({id:g.id,name:g.name,image:g.photo || "",banner:g.banner || null,description:g.description || "",category:g.purpose,location:g.location || "",members:memberLists[index].map(m=>m.name),classIndexes:[] as number[]})),...groups.filter(g=>!memberships.some(m=>m.id===g.id)).map(g=>({id:g.id,name:g.name,image:g.photo || "",banner:g.banner || null,description:g.description || "",category:g.purpose,location:g.location || "",members:[] as string[],classIndexes:[] as number[]}))],
    joined:memberships.map(g=>g.id),
  };
}
