"use client";
import { BackButton } from "@/components/BackButton";
import Link from "next/link";
import { PLACE_KIND_LABELS, PLACE_KINDS } from "@/lib/studio";

import { useEffect, useRef, useState } from "react";
import PreviewClassCard from "./class-card";
import GroupCreator from "./group-creator";
import GroupSampleUpdates from "./group-sample-updates";
import ProfileHero from "./profile-hero";
import ProfileInfo from "./profile-info";
import DetailScreens from "./detail-screens";
import { PrototypeProvider, usePrototype, dateLabel, timeLabel, type Destination } from "./prototype-state";
import { logout } from "@/app/actions/auth";
import { clearClientMemory } from "@/lib/client-memory";
import { Activity, Check, ArrowUpRight, Bell, House, MessageCircle, CalendarDays, ChevronDown, Copy, X, ChevronLeft, ChevronRight, Clock, CreditCard, GlobeLock, List, LockKeyhole, LogOut, Map as MapIcon, MapPin, Moon, Plus, Search, Share2, ShieldUser, SlidersHorizontal, Storefront, UserRound, Users } from "@/components/PhosphorIcons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { calendarActivitySummary } from "@/lib/calendar-summary";
import SharePreview from "./share-preview";
import SavedClassSheet from "./saved-class-sheet";
import StudioMap, { type MapStudio } from "./studio-map";
import styles from "./preview.module.css";

type Screen = "calendar" | "people" | "studios" | "groups" | "you";
type AppearanceMode = "automatic" | "light" | "dark";

const screens: { id: Screen; label: string; icon: typeof CalendarDays }[] = [
  { id: "calendar", label: "Home", icon: House },
  { id: "people", label: "People", icon: UserRound },
  { id: "studios", label: "Studios", icon: Storefront },
  { id: "groups", label: "Groups", icon: Users },
  { id: "you", label: "Profile", icon: UserRound },
];

const classes = [
  { day: "Today · Sep 19", time: "8:00 AM", name: "Asana Lab", place: "Asana Soul Practice", coach: "Erin Clyne", duration: "60 min", color: "#D8C6B4" },
  { day: "Tomorrow · Sep 20", time: "10:30 AM", name: "Sculpt", place: "Jane DO Jersey City", coach: "Freddie Morgan", duration: "50 min", color: "#AFCFEC" },
  { day: "Mon · Sep 21", time: "6:00 PM", name: "Guns, Buns, and Lungs", place: "Ironbound Performance Athletics", coach: "Matt LeGrice", duration: "60 min", color: "#C8C3DB" },
];

function Face({ initials, color, photo, size = 36 }: { initials: string; color: string; photo?:string|null; size?: number }) {
  if(photo) return <img src={photo} alt="" style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>;
  return <Avatar style={{ width: size, height: size, background: color }}><AvatarFallback style={{ background: color, color: "var(--preview-avatar-ink)", fontWeight: 600 }}>{initials}</AvatarFallback></Avatar>;
}

function SectionTitle({ children, aside, target }: { children: React.ReactNode; aside?: React.ReactNode; target?: string }) {
  return <div className={styles.sectionTitle} data-collection-target={target}><h2>{children}</h2>{aside}</div>;
}

function ClassCard({ item }: { item: typeof classes[number] & {id?:string} }) {
  const p = usePrototype();
  const found=p.schedule.find(c=>item.id ? c.id===item.id : c.name===item.name && c.place===item.place);
  return found ? <PreviewClassCard item={found}/> : null;
}

function CalendarScreen({ onShare, firstTime, onNavigate, onOpenGroup, appearance, onAppearanceChange, returnScreen }: { onShare: () => void; firstTime:boolean; onNavigate:(screen:Screen)=>void; onOpenGroup:(id:string)=>void; appearance:AppearanceMode; onAppearanceChange:(value:AppearanceMode)=>void; returnScreen:Screen }) {
  const p = usePrototype();
  const [dayPart,setDayPart]=useState<"morning"|"midday"|"evening">("morning");
  const [homeMenuOpen,setHomeMenuOpen]=useState(false);
  const profileReturnDepth=useRef<number|null>(null);
  const calendarOpenedFromProfile=useRef(false);
  const [calendarOpen,setCalendarOpen]=useState(false);
  const [calendarView,setCalendarView]=useState<"day"|"month">("day");
  const [calendarMonthCount,setCalendarMonthCount]=useState(18);
  const [selectedCalendarDate,setSelectedCalendarDate]=useState("2026-09-19");
  const calendarWorkspaceRef=useRef<HTMLDivElement>(null);
  const calendarMonthSentinelRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{const hour=new Date().getHours();setDayPart(hour<12?"morning":hour<17?"midday":"evening");},[]);
  useEffect(()=>{const open=()=>setCalendarOpen(true);window.addEventListener("preview-open-calendar",open);return()=>window.removeEventListener("preview-open-calendar",open);},[]);
  useEffect(()=>{if(profileReturnDepth.current!==null&&p.stack.length<=profileReturnDepth.current){profileReturnDepth.current=null;setHomeMenuOpen(true);}},[p.stack.length]);
  useEffect(()=>{if(!calendarOpen||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;calendarWorkspaceRef.current?.animate([{transform:"translateX(100%)"},{transform:"translateX(0)"}],{duration:240,easing:"cubic-bezier(.2,.8,.2,1)"});},[calendarOpen]);
  useEffect(()=>{if(!calendarOpen||calendarView!=="month"||!calendarMonthSentinelRef.current)return;const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))setCalendarMonthCount(count=>count+12);},{root:calendarWorkspaceRef.current,rootMargin:"600px 0px"});observer.observe(calendarMonthSentinelRef.current);return()=>observer.disconnect();},[calendarOpen,calendarView,calendarMonthCount]);
  const personalClasses=p.schedule.filter(c=>(c.own ?? (c.coach===p.profile.name || c.coach==="Matt LeGrice")) || p.saved.includes(c.id));
  const homeWeekStart=p.live?new Date().toISOString().slice(0,10):personalClasses.map(item=>item.date).sort()[0];
  const homeWeekEnd=homeWeekStart?new Date(`${homeWeekStart}T12:00:00`):null;
  if(homeWeekEnd)homeWeekEnd.setDate(homeWeekEnd.getDate()+7);
  const homeWeekClasses=homeWeekStart&&homeWeekEnd?personalClasses.filter(item=>item.date>=homeWeekStart&&new Date(`${item.date}T12:00:00`)<homeWeekEnd):personalClasses;
  const homeWeekDates=[...new Set(homeWeekClasses.map(item=>item.date))].sort();
  const joinedGroupUpdates=Object.entries(p.joinedGroups).map(([id,name],index)=>({id:`group-${id}`,priority:100-index,title:`New plan from ${name}`,meta:"Group update",icon:<Users size={19}/>,open:()=>onOpenGroup(id)}));
  const savedActivityClass=p.schedule.find(item=>p.saved.includes(item.id));
  const savedClassActivity=savedActivityClass?[{id:`saved-${savedActivityClass.id}`,priority:85,title:`${p.live?.people.find(person=>person.name!==p.profile.name)?.name||"Erin Clyne"} saved ${savedActivityClass.name}`,meta:`Class activity · ${savedActivityClass.place}`,icon:<CalendarDays size={19}/>,open:()=>p.open({kind:"class",name:savedActivityClass.id})}]:[];
  const followedClass=p.schedule.find(item=>p.following.includes(item.coach));
  const followedActivity=followedClass?[{id:`person-${followedClass.id}`,priority:65,title:`${followedClass.coach} is teaching ${followedClass.name}`,meta:`People you follow · ${dateLabel(followedClass.date)}`,icon:<UserRound size={19}/>,open:()=>p.open({kind:"class",name:followedClass.id})}]:[];
  const studioClass=p.schedule.find(item=>p.savedStudios.includes(item.place));
  const studioActivity=studioClass?[{id:`studio-${studioClass.id}`,priority:45,title:`${studioClass.name} is coming up at ${studioClass.place}`,meta:`Saved studio · ${dateLabel(studioClass.date)}`,icon:<Storefront size={19}/>,open:()=>p.open({kind:"class",name:studioClass.id})}]:[];
  const openCalendar=()=>setCalendarOpen(true);
  const sampleActivity=[
    {id:"notification-follow",priority:58,title:"Erin Clyne followed you",meta:"Today",icon:<UserRound size={19}/>,open:()=>p.open({kind:"person",name:"Erin Clyne"})},
    {id:"notification-class",priority:54,title:"Freddie added Sculpt & Strength",meta:"Gals who like to move · Yesterday",icon:<CalendarDays size={19}/>,open:()=>p.open({kind:"class",name:"sculpt"})},
    {id:"notification-plan",priority:50,title:"Alex shared a new class plan",meta:"Sunday Sweat Crew · 2 days ago",icon:<Users size={19}/>,open:()=>onNavigate("groups")},
    {id:"notification-save",priority:46,title:"Jordan saved Morning Flow",meta:"Class activity · 3 days ago",icon:<CalendarDays size={19}/>,open:()=>p.open({kind:"notifications"})},
    {id:"notification-join",priority:42,title:"Sam joined your group",meta:"Gals who like to move · 4 days ago",icon:<Users size={19}/>,open:()=>onNavigate("groups")},
    {id:"notification-studio",priority:38,title:"Asana Lab posted a new class",meta:"Studio update · 5 days ago",icon:<Storefront size={19}/>,open:()=>p.open({kind:"notifications"})},
    {id:"notification-comment",priority:34,title:"Erin commented on your plan",meta:"Group activity · 6 days ago",icon:<MessageCircle size={19}/>,open:()=>p.open({kind:"notifications"})},
    {id:"notification-reminder",priority:30,title:"Your Saturday class is coming up",meta:"Calendar reminder · 1 week ago",icon:<CalendarDays size={19}/>,open:openCalendar},
  ];
  const activityFeed=[...joinedGroupUpdates,...savedClassActivity,...followedActivity,...studioActivity,...sampleActivity].sort((a,b)=>b.priority-a.priority).slice(0,8);
  const openProfileDetail=(destination:Destination)=>{profileReturnDepth.current=p.stack.length;setHomeMenuOpen(false);p.open(destination);};
  const calendarMonths=Array.from({length:calendarMonthCount},(_,index)=>new Date(2026,8+index,1));
  const calendarDates=new Set(personalClasses.map(item=>item.date));
  const dayListDates=[...new Set([...personalClasses.map(item=>item.date),selectedCalendarDate])].sort();
  const selectCalendarDate=(date:string)=>{setSelectedCalendarDate(date);setCalendarView("day");window.requestAnimationFrame(()=>document.querySelector(`[data-calendar-date="${date}"]`)?.scrollIntoView({behavior:"smooth",block:"start"}));};
  if(calendarOpen)return <div ref={calendarWorkspaceRef} className={`${styles.subpage} ${styles.calendarWorkspace}`}>
    <div className={styles.calendarWorkspaceNav}><BackButton label={calendarOpenedFromProfile.current||returnScreen==="you"?"Back to Profile":"Back to Home"} onClick={()=>{setCalendarOpen(false);if(calendarOpenedFromProfile.current){calendarOpenedFromProfile.current=false;setHomeMenuOpen(true);}else if(returnScreen!=="calendar")onNavigate(returnScreen);}}/><button aria-label="Share my calendar" onClick={onShare}><Share2 size={21}/></button></div>
    <div className={styles.calendarWorkspaceHeader}><h1 className={styles.pageTitle}>My Calendar</h1><div className={styles.personalCalendarToolbar} role="group" aria-label="Calendar view"><button aria-label="Day list view" title="Day list" aria-pressed={calendarView==="day"} onClick={()=>setCalendarView("day")}><List size={18}/></button><button aria-label="Month view" title="Month" aria-pressed={calendarView==="month"} onClick={()=>setCalendarView("month")}><CalendarDays size={18}/></button></div></div>
    {calendarView==="day"?<section className={styles.calendarAgenda}>{dayListDates.map(date=>{const dateClasses=personalClasses.filter(item=>item.date===date);return <div className={styles.calendarWorkspaceDay} data-calendar-date={date} key={date}><h2>{dateLabel(date)}</h2>{dateClasses.length?dateClasses.map(item=><ClassCard key={item.id} item={{...item,day:dateLabel(item.date),color:"#C8C3DB"}}/>):<p className={styles.calendarDateEmpty}>Nothing scheduled.</p>}</div>;})}</section>:<section className={styles.personalMonth}>{calendarMonths.map(month=>{const year=month.getFullYear();const monthIndex=month.getMonth();const days=Array.from({length:new Date(year,monthIndex+1,0).getDate()},(_,index)=>index+1);const blanks=month.getDay();return <div className={styles.scrollMonth} key={`${year}-${monthIndex}`}><h2>{month.toLocaleDateString("en-US",{month:"long",year:"numeric"})}</h2><div className={styles.monthWeekdays}>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day=><span key={day}>{day}</span>)}</div><div className={styles.monthGrid}>{Array.from({length:blanks},(_,index)=><span key={`blank-${index}`} aria-hidden="true"/>)}{days.map(day=>{const date=`${year}-${String(monthIndex+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;return <button key={day} className={calendarDates.has(date)?styles.monthHasClass:undefined} aria-label={`${month.toLocaleDateString("en-US",{month:"long"})} ${day}, ${year}${calendarDates.has(date)?", has classes":""}`} onClick={()=>selectCalendarDate(date)}><span>{day}</span>{calendarDates.has(date)&&<i/>}</button>;})}</div></div>;})}<div ref={calendarMonthSentinelRef} className={styles.calendarMonthSentinel} aria-hidden="true"/></section>}
    <button onClick={()=>p.open({kind:"add-class"})} className={styles.addFab} aria-label="Add a class"><Plus size={28}/></button>
  </div>;
  const homeDayPart=appearance==="light"?"midday":appearance==="dark"?"evening":dayPart;
  return <div className={`${styles.swipeCalendar} ${homeDayPart==="morning"?styles.morningHome:homeDayPart==="midday"?styles.middayHome:styles.eveningHome}`}>
    <div className={styles.calendarHero}>
      <h1 className={styles.visuallyHidden}>Home</h1><div className={styles.homeTopRow}><div className={styles.homeNavIdentity}><button aria-label="Open profile menu" aria-expanded={homeMenuOpen} onClick={()=>setHomeMenuOpen(value=>!value)}><Face initials={p.profile.name.split(/\s+/).filter(Boolean).map(part=>part[0]).slice(0,2).join("")} color="#C8C3DB" photo={p.profile.photo} size={44}/></button></div><div className={styles.homeUtilities}><button aria-label="Notifications" onClick={()=>{p.setSampleNotificationsSeen(true);p.open({kind:"notifications"});}}><Bell size={21}/>{!p.live&&!p.sampleNotificationsSeen&&<span aria-label="2 unread notifications">2</span>}</button><button aria-label="Messages" onClick={()=>{p.setSampleMessagesSeen(true);p.open({kind:"messages"});}}><MessageCircle size={21}/>{!p.live&&!p.sampleMessagesSeen&&<span aria-label="1 unread message">1</span>}</button></div></div>
      {homeMenuOpen&&<div className={styles.homeAccountOverlay} onMouseDown={event=>{if(event.target===event.currentTarget)setHomeMenuOpen(false);}}><aside className={styles.homeAccountDrawer} aria-label="Profile"><div className={styles.homeDrawerCloseRow}><button aria-label="Close profile" onClick={()=>setHomeMenuOpen(false)}><X size={20}/></button></div><div className={styles.homeDrawerProfile}><YouScreen appearance={appearance} onAppearanceChange={onAppearanceChange} onOpenDetail={openProfileDetail} onOpenCalendar={()=>{calendarOpenedFromProfile.current=true;setHomeMenuOpen(false);openCalendar();}}/></div></aside></div>}
      {firstTime?<div className={`${styles.calendarSummary} ${styles.yourCalendarSummary} ${styles.firstTimeSummary}`}><strong>Your week starts here.</strong><p>Add classes you teach or plan to take. Follow people to discover what’s on their calendars.</p><div className={styles.firstTimeActions}><button type="button" onClick={()=>p.open({kind:"add-class"})}><Plus size={18}/>Add a class</button></div></div>:<div className={`${styles.calendarSummary} ${styles.yourCalendarSummary}`}><strong>{calendarActivitySummary({ teaching: p.schedule.filter(c=>c.own ?? (c.coach===p.profile.name || c.coach==="Matt LeGrice")).length, attending: personalClasses.filter(c=>!c.personal && !(c.own ?? (c.coach===p.profile.name || c.coach==="Matt LeGrice"))).length, personal: p.schedule.filter(c=>c.personal).length })}</strong><div className={`${styles.heroActions} ${styles.homeSummaryActions}`}><button type="button" onClick={onShare} className={styles.shareWeekButton} aria-label="Share your week"><Share2 size={15}/><span>Share your week</span></button><button type="button" onClick={openCalendar} className={styles.homeManageButton}><CalendarDays size={15}/>Manage calendar</button></div></div>}
    </div>
    {firstTime?<section className={styles.homeDiscovery}><h2>Explore your community</h2><button onClick={()=>onNavigate("people")}><span><UserRound size={20}/></span><div><strong>People near you</strong><small>Follow calendars and discover classes</small></div><ChevronRight size={18}/></button><button onClick={()=>onNavigate("studios")}><span><Storefront size={20}/></span><div><strong>Studios near you</strong><small>Find places you’ll want to revisit</small></div><ChevronRight size={18}/></button><button onClick={()=>onNavigate("groups")}><span><Users size={20}/></span><div><strong>Groups to join</strong><small>Meet people who like to move</small></div><ChevronRight size={18}/></button></section>:<div className={`${styles.calendarYouPanel} ${styles.homeDashboard}`}><section className={styles.homeCalendarPreview}>{homeWeekClasses.length===0?<p className={styles.sectionIntro}>Nothing scheduled in the next seven days.</p>:homeWeekDates.map(date=><div className={styles.homeClassItem} key={date}><h3>{dateLabel(date)}</h3><div className={styles.dateClassStack}>{homeWeekClasses.filter(item=>item.date===date).map(item=><div className={styles.homeStandaloneClass} key={item.id}><ClassCard item={{...item,day:dateLabel(item.date),color:"#C8C3DB"}}/></div>)}</div></div>)}<button className={styles.homeCardFooter} onClick={openCalendar}>View full calendar<ChevronRight size={14}/></button></section><section className={styles.homeActivitySection}><SectionTitle>Activity</SectionTitle><div className={`${styles.homeActivityList} ${styles.communityList}`}>{activityFeed.map(item=><button data-kind={item.id.split("-")[0]} key={item.id} onClick={item.open}><span>{item.icon}</span><div><strong>{item.title}</strong><small>{item.meta}</small></div><ChevronRight size={17}/></button>)}</div><button className={styles.homeCardFooter} onClick={()=>p.open({kind:"notifications"})}>See all activity<ChevronRight size={14}/></button></section><button onClick={() => p.open({kind:"add-class"})} className={styles.addFab} aria-label="Add a class"><Plus size={28}/></button></div>}
  </div>;
}

function FollowingPeople({focusPerson,onDiscover}:{focusPerson:string|null;onDiscover:()=>void}) {
  const p=usePrototype();
  const [selectedPerson,setSelectedPerson]=useState("All");
  useEffect(()=>{if(focusPerson)setSelectedPerson(focusPerson);},[focusPerson]);
  const samplePeople: {name:string;initials:string;color:string;photo?:string|null}[]=[{name:"Erin Clyne",initials:"EC",color:"#D8C6B4"},{name:"Freddie Morgan",initials:"FM",color:"#AFCFEC"},{name:"Alex Lee",initials:"AL",color:"#C8C3DB"},{name:"Jordan Rivera",initials:"JR",color:"#BBD4C5"},{name:"Sam Chen",initials:"SC",color:"#E3CEAE"}];
  const followingClasses=p.schedule.filter(c=>!(c.own ?? (c.coach===p.profile.name||c.coach==="Matt LeGrice"))&&p.following.includes(c.coach));
  const rawPeople=p.live?p.live.people.filter(person=>person.name!==p.profile.name&&p.following.includes(person.name)):samplePeople.filter(person=>p.following.includes(person.name));
  const nextClassTime=(name:string)=>followingClasses.filter(item=>item.coach===name).map(item=>new Date(`${item.date}T${item.time}:00`).getTime()).sort((a,b)=>a-b)[0]??Number.POSITIVE_INFINITY;
  const people=[...rawPeople].sort((a,b)=>nextClassTime(a.name)-nextClassTime(b.name));
  const visible=followingClasses.filter(item=>selectedPerson==="All"||item.coach===selectedPerson);
  const visibleDates=[...new Set(visible.map(item=>item.date))].sort();
  const firstName=selectedPerson.split(" ")[0];
  return <section className={styles.followingPeople}>{people.length>0&&<div className={styles.peopleRail} aria-label="Filter by person"><button type="button" className={styles.personFilter} aria-pressed={selectedPerson==="All"} onClick={()=>setSelectedPerson("All")}><span className={styles.personRing}><span className={styles.allFace}><Users size={22}/></span></span><small>All</small></button>{people.map(person=><button key={person.name} type="button" className={styles.personFilter} aria-pressed={selectedPerson===person.name} onClick={()=>setSelectedPerson(person.name)}><span className={styles.personRing}><Face initials={person.initials} color={person.color} photo={person.photo} size={80}/></span><small>{person.name.split(" ")[0]}</small></button>)}<button type="button" className={`${styles.personFilter} ${styles.personAdd}`} aria-label="Discover more people" onClick={onDiscover}><span className={styles.personRing}><span className={styles.allFace}><Plus size={27}/></span></span><small>Add</small></button></div>}{people.length>0&&selectedPerson!=="All"&&<div className={styles.calendarPersonContext}><SectionTitle aside={<button className={styles.calendarProfileButton} onClick={()=>p.open({kind:"person",name:selectedPerson})}>View profile<ChevronRight size={16}/></button>}>{`${selectedPerson}’s calendar`}</SectionTitle></div>}{visible.length===0?(selectedPerson!=="All"?<div className={styles.personPlansEmpty}><span><MessageCircle size={24}/></span><h3>{firstName} has no plans coming up.</h3><p>Message them to ask what they’re doing.</p><button onClick={()=>p.open({kind:"messages",name:selectedPerson})}><MessageCircle size={17}/>Message {firstName}</button></div>:<p className={styles.sectionIntro}>{people.length===0?"Add people to see their upcoming classes here.":"No upcoming classes from the people you follow yet."}</p>):visibleDates.map(date=><section className={styles.daySection} key={date}><h3>{dateLabel(date)}</h3><div className={styles.dateClassStack}>{visible.filter(item=>item.date===date).map(item=><ClassCard key={item.id} item={{...item,day:dateLabel(item.date),color:"#C8C3DB"}}/>)}</div></section>)}</section>;
}

type ExplorePage = "people" | "studios";
const explorePeople = [
  { name: "Erin Clyne", title: "Yoga Teacher + Clinical Sports Massage", initials: "EC", color: "#D8C6B4", specialty: "Yoga", location:"Jersey City, NJ" },
  { name: "Freddie Morgan", title: "Strength & mobility coach", initials: "FM", color: "#AFCFEC", specialty: "Strength", location:"Jersey City, NJ" },
  { name: "Alex Lee", title: "Pilates instructor", initials: "AL", color: "#C8C3DB", specialty: "Pilates", location:"Jersey City, NJ" },
  { name: "Jordan Rivera", title: "Running coach", initials: "JR", color: "#BBD4C5", specialty: "Running", location:"Jersey City, NJ" },
  { name: "Sam Chen", title: "Strength coach", initials: "SC", color: "#E3CEAE", specialty: "Strength", location:"Jersey City, NJ" },
];
const exploreStudios: MapStudio[] = [
  { name: "Asana Soul Practice", type: "Yoga", location: "Jersey City, NJ", coordinates: [40.722, -74.044] },
  { name: "Jane DO Jersey City", type: "Sculpt", location: "Jersey City, NJ", coordinates: [40.725, -74.047] },
  { name: "Ironbound Performance Athletics", type: "Strength", location: "Jersey City, NJ", coordinates: [40.731, -74.057] },
];
function ExplorePerson({ person }: { person: typeof explorePeople[number] & {photo?:string|null;location?:string} }) {
  const p = usePrototype();
  const following=p.following.includes(person.name);
  const activity=p.schedule.filter(item=>item.coach===person.name).length;
  return <div className={styles.directoryPerson}>
    <button className={styles.directoryPersonMain} onClick={()=>p.open({kind:"person",name:person.name})}>
      <Face initials={person.initials} color={person.color} photo={person.photo} size={46}/>
      <span className={styles.directoryPersonCopy}><strong>{person.name}</strong><small>{activity ? `${activity} this week` : person.title} · {person.location || (p.live ? "Location not added" : "Jersey City, NJ")}</small></span>
    </button>
    <button className={styles.directoryFollow} aria-label={`${following?"Followed":"Follow"}: ${person.name}`} aria-pressed={following} onClick={()=>following?p.unfollow(person.name):p.follow(person.name)}>{following?<><Check size={14} aria-hidden="true"/>Followed</>:"Follow"}</button>
  </div>;
}
function ExploreStudio({ place }: { place: typeof exploreStudios[number] }) {
  const p=usePrototype();
  return <button className={styles.cardLink} onClick={()=>p.open({kind:"studio",name:place.name})}><Card className={styles.simpleCard}><CardContent className={styles.menuRow}><span className={styles.studioListAvatar}><Face initials={place.name.split(" ").map(word=>word[0]).slice(0,2).join("")} color="#C8C3DB" photo={place.photo} size={46}/></span><div><strong>{place.name}</strong><span>{place.type} · {place.location}</span></div><ChevronRight size={18}/></CardContent></Card></button>;
}
function nearbySuggestions<T extends {location?:string|null}>(items:T[],location:string|undefined|null){
  const city=location?.split(",")[0]?.trim().toLowerCase();
  return [...items].sort((a,b)=>Number(!!city&&!!b.location?.toLowerCase().includes(city))-Number(!!city&&!!a.location?.toLowerCase().includes(city))).slice(0,3);
}
function SuggestionRow({name,detail,avatar,action,target,onOpen,onAction}:{name:string;detail:string;avatar:React.ReactNode;action:string;target:"people"|"studios"|"groups";onOpen:()=>void;onAction:(confirmationDelayMs?:number)=>void}){
  const row=useRef<HTMLElement>(null);
  const [moving,setMoving]=useState(false);
  const commit=()=>{
    if(moving)return;
    const source=row.current;
    const destination=source?.closest(`.${styles.collectionPage}`)?.querySelector(`[data-collection-target="${target}"]`);
    if(!source||!destination||window.matchMedia("(prefers-reduced-motion: reduce)").matches){onAction();return;}
    setMoving(true);
    const start=source.getBoundingClientRect();
    const end=destination.getBoundingClientRect();
    const ghost=source.cloneNode(true) as HTMLElement;
    ghost.setAttribute("aria-hidden","true");
    ghost.style.cssText=`position:fixed;left:${start.left}px;top:${start.top}px;width:${start.width}px;height:${start.height}px;z-index:80;pointer-events:none;box-shadow:0 14px 32px #1a252322;`;
    source.closest(`.${styles.preview}`)?.appendChild(ghost);
    source.style.opacity="0.25";
    const dx=end.left-start.left;
    const dy=end.top-start.top;
    const animation=ghost.animate([{transform:"translate(0,0) scale(1)",opacity:1},{transform:`translate(${dx}px,${dy}px) scale(.72)`,opacity:0}],{duration:480,easing:"cubic-bezier(.22,.8,.2,1)",fill:"forwards"});
    animation.finished.catch(()=>{}).then(()=>{ghost.remove();source.style.opacity="";setMoving(false);onAction(280);});
  };
  return <article ref={row} className={styles.suggestionRow}><button className={styles.suggestionMain} onClick={onOpen}><span className={styles.suggestionAvatar}>{avatar}</span><span><strong>{name}</strong><small>{detail}</small></span></button><button className={styles.suggestionAction} aria-pressed="false" onClick={commit} disabled={moving}>{action}</button></article>;
}
function ExploreScreen({ page, initialQuery="" }: { page: ExplorePage; initialQuery?:string }) {
  const p=usePrototype();
  const peopleSource=p.live?.people || explorePeople.map((person,index)=>({...person,disciplines:[person.specialty],coordinates:[40.72+index*.004,-74.045] as [number,number]}));
  const studiosSource=p.live?.studios || exploreStudios.map(place=>({...place,types:[place.type],placeKind:"studio"}));
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState("");
  const [mapView, setMapView] = useState(false);
  const [distance,setDistance]=useState("");
  const [placeKind,setPlaceKind]=useState("");
  const [geo,setGeo]=useState<[number,number]|null>(null);
  const [locationPending,setLocationPending]=useState(false);
  const [locationError,setLocationError]=useState("");
  const chooseDistance=(value:string)=>{
    setLocationError("");
    if(!value||geo){setDistance(value);return;}
    if(!navigator.geolocation){setLocationError("Location is unavailable. Showing all distances.");return;}
    setLocationPending(true);
    navigator.geolocation.getCurrentPosition(position=>{setGeo([position.coords.latitude,position.coords.longitude]);setDistance(value);setLocationPending(false);},()=>{setLocationPending(false);setLocationError("Location wasn’t shared. Showing all distances.");},{timeout:10000,maximumAge:300000});
  };
  const withinDistance=(coordinates:number[]|null)=>{
    if(!distance)return true;
    if(!geo||!coordinates)return false;
    const radians=(n:number)=>n*Math.PI/180;
    const a=Math.sin(radians(coordinates[0]-geo[0])/2)**2+Math.cos(radians(geo[0]))*Math.cos(radians(coordinates[0]))*Math.sin(radians(coordinates[1]-geo[1])/2)**2;
    return 3958.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))<=Number(distance);
  };

  const matches = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const shownPeople = peopleSource.filter(person => matches(`${person.name} ${person.title}`) && (!filter || person.disciplines.includes(filter)) && withinDistance(person.coordinates));
  const shownStudios = studiosSource.filter(place => matches(`${place.name} ${place.type} ${place.location}`) && (!filter || place.types.includes(filter)) && (!placeKind || place.placeKind===placeKind) && withinDistance(place.coordinates));
  const title = page.charAt(0).toUpperCase() + page.slice(1);
  const options = [...new Set(page === "people" ? peopleSource.flatMap(person=>person.disciplines) : studiosSource.flatMap(studio=>studio.types))];
  const count = page === "people" ? shownPeople.length : shownStudios.length;
  const controls=<>
    <div className={styles.topControls}><label className={styles.search}><Search size={19}/><Input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${page}`} aria-label={`Search ${page}`}/></label></div>
    <div className={styles.directoryFilters} aria-label={`${title} filters`}>
      <label><select aria-label="Distance" value={distance} disabled={locationPending} onChange={event=>chooseDistance(event.target.value)}><option value="">{locationPending?"Locating…":"Distance"}</option>{[1,2,5,10,25].map(miles=><option key={miles} value={miles}>Within {miles} {miles===1?"mile":"miles"}</option>)}</select><ChevronDown size={14}/></label>
      <label><select aria-label={page==="people"?"Specialty":"Category"} value={filter} onChange={event=>setFilter(event.target.value)}><option value="">{page==="people"?"Specialty":"Category"}</option>{options.map(option=><option key={option}>{option}</option>)}</select><ChevronDown size={14}/></label>
      {page==="studios"&&<label><select aria-label="Studio type" value={placeKind} onChange={event=>setPlaceKind(event.target.value)}><option value="">Type</option>{PLACE_KINDS.map(kind=><option key={kind} value={kind}>{PLACE_KIND_LABELS[kind]}</option>)}</select><ChevronDown size={14}/></label>}
    </div>
    {locationError&&<p role="status" className={styles.sectionIntro}>{locationError}</p>}
  </>;
  return <div className={styles.directoryWorkspace}>
    {!mapView && <div className={styles.directoryHeader}>{controls}</div>}
    {count === 0 && !mapView && <p className={styles.sectionIntro}>No matches. Try another search or filter.</p>}
    <div className={page === "studios" && mapView ? styles.mapResults : undefined}><div aria-hidden={page === "studios" && mapView || undefined} inert={page === "studios" && mapView} className={`${styles.directoryList} ${page === "people" ? styles.peopleList : styles.stack}`}>{page === "people" ? shownPeople.map(person => <ExplorePerson key={person.name} person={person}/>) : shownStudios.map(place => <ExploreStudio key={place.name} place={place}/>)}</div>{page === "studios" && mapView && <StudioMap studios={shownStudios} filters={controls} onClose={() => setMapView(false)}/>}</div>
    {page === "studios" && !mapView && <button className={styles.mapToggle} onClick={event => {event.currentTarget.closest("main")?.scrollTo({top:0});setMapView(true);}}><MapIcon size={19}/>Map</button>}
  </div>;
}

function PeopleScreen({focusPerson,firstTime}:{focusPerson:string|null;firstTime:boolean}) {
  const p=usePrototype();
  const [discover,setDiscover]=useState(false);
  const searchSeed="";
  const suggestions=nearbySuggestions((p.live?.people||explorePeople).filter(person=>person.name!==p.profile.name&&!p.following.includes(person.name)),p.profile.location);
  const city=p.profile.location?.split(",")[0]?.trim();
  const nearby=!!city&&suggestions.some(person=>person.location?.toLowerCase().includes(city.toLowerCase()));
  return discover?<div className={styles.subpage}><div className={styles.discoveryHeader}><BackButton className={styles.backButton} label="Back to People" onClick={()=>setDiscover(false)}/><h1 className={styles.pageTitle}>Search people</h1></div><ExploreScreen page="people" initialQuery={searchSeed}/></div>:<div className={styles.collectionPage}><div className={styles.collectionPageHeader}><h1 className={styles.pageTitle}>People</h1><div className={styles.collectionHeaderActions}><button className={styles.collectionDiscover} aria-label="Search people" onClick={()=>setDiscover(true)}><Search size={19}/></button></div></div>{!firstTime&&p.following.length?<FollowingPeople focusPerson={focusPerson} onDiscover={()=>setDiscover(true)}/>:<section className={`${styles.collectionEmpty} ${styles.peopleEmpty}`}><div className={styles.emptyPeopleRail} data-collection-target="people" aria-label="Add people to your Following rail">{Array.from({length:5},(_,index)=><button key={index} type="button" aria-label={`Discover a person for spot ${index+1}`} onClick={()=>setDiscover(true)}><Plus size={24} aria-hidden="true"/></button>)}</div>{suggestions.length>0&&<div className={styles.suggestionSection}><h3>{nearby?"People near you":"People to follow"}</h3><div className={styles.suggestionList}>{suggestions.map(person=><SuggestionRow key={person.name} name={person.name} detail={person.title||person.location||"FittList member"} avatar={<Face initials={person.initials} color={person.color||"#C8C3DB"} photo={(person as {photo?:string|null}).photo} size={42}/>} action="Follow" target="people" onOpen={()=>p.open({kind:"person",name:person.name})} onAction={delay=>p.follow(person.name,delay)}/>)}</div></div>}<button className={styles.discoverMore} onClick={()=>setDiscover(true)}>Discover more people <ArrowUpRight size={16}/></button></section>}</div>;
}

function StudiosScreen({firstTime,initialView="All studios"}:{firstTime:boolean;initialView?:string}) {
  const p=usePrototype();
  const [view,setView]=useState(initialView);
  const [query,setQuery]=useState("");
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [mapView,setMapView]=useState(false);
  const [placeKind,setPlaceKind]=useState("");
  const [distance,setDistance]=useState("");
  const [geo,setGeo]=useState<[number,number]|null>(null);
  const allStudios=p.live?.studios||exploreStudios;
  const visibleSaved=firstTime?[]:p.savedStudios;
  const studioType=(studio:typeof allStudios[number])=>{const type=studio.type.toLowerCase();return /yoga/.test(type)?"Yoga":/pilates/.test(type)?"Pilates":/cycle|spin/.test(type)?"Cycling":/strength|sculpt|conditioning|fitness/.test(type)?"Strength & conditioning":"Other";};
  const types=["Yoga","Strength & conditioning","Pilates","Cycling",...new Set(allStudios.map(studioType).filter(type=>!["Yoga","Strength & conditioning","Pilates","Cycling"].includes(type)))];
  const chooseDistance=(value:string)=>{setDistance(value);if(value&&!geo&&navigator.geolocation)navigator.geolocation.getCurrentPosition(position=>setGeo([position.coords.latitude,position.coords.longitude]),()=>setDistance(""),{timeout:10000,maximumAge:300000});};
  const withinDistance=(studio:typeof allStudios[number])=>{if(!distance)return true;if(!geo||!studio.coordinates)return false;const radians=(n:number)=>n*Math.PI/180;const a=Math.sin(radians(studio.coordinates[0]-geo[0])/2)**2+Math.cos(radians(geo[0]))*Math.cos(radians(studio.coordinates[0]))*Math.sin(radians(studio.coordinates[1]-geo[1])/2)**2;return 3958.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))<=Number(distance);};
  const filteredStudios=allStudios.filter(studio=>(view==="All studios"||view==="Saved"&&visibleSaved.includes(studio.name)||studioType(studio)===view)&&`${studio.name} ${studio.type} ${studio.location||""}`.toLowerCase().includes(query.trim().toLowerCase())&&(!placeKind||("placeKind" in studio&&studio.placeKind===placeKind))&&withinDistance(studio));
  const controls=<>{filtersOpen&&<div className={styles.directoryFilters}><label><select aria-label="Distance" value={distance} onChange={event=>chooseDistance(event.target.value)}><option value="">Any distance</option>{[1,2,5,10,25].map(miles=><option key={miles} value={miles}>Within {miles} {miles===1?"mile":"miles"}</option>)}</select><ChevronDown size={14}/></label><label><select aria-label="Studio type" value={placeKind} onChange={event=>setPlaceKind(event.target.value)}><option value="">All studio types</option>{PLACE_KINDS.map(kind=><option key={kind} value={kind}>{PLACE_KIND_LABELS[kind]}</option>)}</select><ChevronDown size={14}/></label></div>}</>;
  return <div className={`${styles.collectionPage} ${styles.studiosDirectory}`}>
    <h1 className={styles.visuallyHidden}>Studios</h1><div className={`${styles.collectionPageHeader} ${styles.directorySearchHeader}`}><label className={styles.search}><Search size={19}/><Input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search studios" aria-label="Search studios"/></label><button className={styles.collectionDiscover} aria-label="Filter studios" aria-pressed={filtersOpen||!!placeKind||!!distance} onClick={()=>setFiltersOpen(value=>!value)}><SlidersHorizontal size={19}/></button></div>
    <div className={styles.studioDirectoryControls}>{controls}<div className={styles.discoveryCategories} role="group" aria-label="Studio views">{["All studios","Saved",...types].map(label=><button key={label} data-collection-target={label==="Saved"?"studios":undefined} aria-pressed={view===label} onClick={()=>setView(label)}>{label}</button>)}</div></div>
    {mapView?<section className={styles.studioMapSlot}><StudioMap studios={filteredStudios as MapStudio[]} filters={null} onClose={()=>setMapView(false)}/></section>:<section className={styles.studioResults}>{filteredStudios.length?<div className={styles.suggestionList}>{filteredStudios.map(studio=>{const saved=visibleSaved.includes(studio.name);return <article key={studio.name} className={styles.suggestionRow}><button className={styles.suggestionMain} onClick={()=>p.open({kind:"studio",name:studio.name})}><span className={styles.suggestionAvatar}><Storefront size={21}/></span><span><strong>{studio.name}</strong><small>{studio.type} · {studio.location||"Location not added"}</small></span></button><button className={styles.suggestionAction} aria-pressed={saved} onClick={()=>saved?p.unsaveStudio(studio.name):p.saveStudio(studio.name)}>{saved?<><Check size={14}/>Saved</>:"Save"}</button></article>;})}</div>:<div className={styles.collectionEmpty}><p>{view==="Saved"?"No saved studios yet. Save a studio to find it here.":"No studios match these filters."}</p></div>}</section>}
    {!mapView&&<button className={styles.mapToggle} onClick={()=>setMapView(true)}><MapIcon size={19}/>Map</button>}
  </div>;
}

const sampleGroups = [
  { id: "gals", location:"Jersey City, NJ", coordinates:[40.72,-74.045] as [number,number]|null, banner:null as string|null, name: "Gals who like to move", category: "Group fitness", description: "Find a class, make a plan, and bring your people.", image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1000&q=85", members: ["Erin Clyne", "Freddie Morgan", "Alex Lee", "Matt LeGrice"], classIndexes: [1, 2] },
  { id: "run", location:"Jersey City, NJ", coordinates:[40.72,-74.045] as [number,number]|null, banner:null as string|null, name: "Jersey City Run Club", category: "Running", description: "Easy miles, good company, and a reason to get outside. All paces welcome.", image: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1000&q=85", members: ["Jordan Rivera", "Sam Chen", "Taylor Brooks"], classIndexes: [] },
  { id: "sweat", location:"Jersey City, NJ", coordinates:[40.72,-74.045] as [number,number]|null, banner:null as string|null, name: "Sunday Sweat Crew", category: "Strength & mobility", description: "Make Sunday your day to move. Try local classes together and meet your next workout buddy.", image: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1000&q=85", members: ["Freddie Morgan", "Alex Lee", "Jamie Park"], classIndexes: [1] },
];
function GroupsScreen({selected,setSelected,firstTime}:{selected:string|null;setSelected:(value:string|null)=>void;firstTime:boolean}) {
  const p=usePrototype();
  const groupClasses=p.schedule.map(c=>({id:c.id,name:c.name,place:c.place,coach:c.coach,day:dateLabel(c.date),time:timeLabel(c.time),duration:`${c.duration} min`,color:"#C8C3DB"}));
  const [groups, setGroups] = useState(sampleGroups);
  const joined=Object.keys(p.joinedGroups);
  const visibleJoined=firstTime?[]:joined;
  const [discover,setDiscover]=useState(false);
  const [groupLandingView,setGroupLandingView]=useState("All groups");
  const [groupQuery,setGroupQuery]=useState("");
  const [groupCategory,setGroupCategory]=useState("All");
  const [distance,setDistance]=useState("");
  const [geo,setGeo]=useState<[number,number]|null>(null);
  const [locationPending,setLocationPending]=useState(false);
  const [locationError,setLocationError]=useState("");
  const chooseDistance=(value:string)=>{
    setLocationError("");
    if(!value||geo){setDistance(value);return;}
    if(!navigator.geolocation){setLocationError("Location is unavailable. Showing all distances.");return;}
    setLocationPending(true);
    navigator.geolocation.getCurrentPosition(position=>{setGeo([position.coords.latitude,position.coords.longitude]);setDistance(value);setLocationPending(false);},()=>{setLocationPending(false);setLocationError("Location wasn’t shared. Showing all distances.");},{timeout:10000,maximumAge:300000});
  };
  const withinDistance=(coordinates:[number,number]|null)=>{
    if(!distance)return true;
    if(!geo||!coordinates)return false;
    const radians=(n:number)=>n*Math.PI/180;
    const a=Math.sin(radians(coordinates[0]-geo[0])/2)**2+Math.cos(radians(geo[0]))*Math.cos(radians(coordinates[0]))*Math.sin(radians(coordinates[1]-geo[1])/2)**2;
    return 3958.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))<=Number(distance);
  };
  const [seenUpdates,setSeenUpdates]=useState<string[]>([]);
  const [leaveGroupId,setLeaveGroupId]=useState<string|null>(null);
  const [groupView,setGroupView]=useState<"schedule"|"members"|"updates">("updates");
  useEffect(()=>{setGroupView("updates");},[selected]);
  useEffect(()=>{if(selected&&groupView==="members")window.dispatchEvent(new Event("preview-subpage"));},[groupView,selected]);
  const categories=["All","Run clubs","Fitness","Wellness"];
  const categoryOf=(value:string)=>/run/i.test(value)?"Run club":/wellness|yoga|mindful/i.test(value)?"Wellness":"Fitness";
  const results=groups.filter(g=>withinDistance(g.coordinates)&&(`${g.name} ${g.description} ${g.category}`).toLowerCase().includes(groupQuery.trim().toLowerCase())&&(groupCategory==="All"||categoryOf(g.category)===(groupCategory==="Run clubs"?"Run club":groupCategory)));
  const openGroup=(id:string)=>{setSelected(id);};
  const toggleMembership=(id:string,confirmationDelayMs=0)=>{
    const leaving=joined.includes(id);
    if(leaving){setLeaveGroupId(id);return;}
    p.joinGroup(id,groups.find(group=>group.id===id)?.name || "this group",confirmationDelayMs);
    setGroups(items=>items.map(group=>group.id===id?{
      ...group,
      members:[...new Set([...group.members,p.profile.name])],
    }:group));
  };
  const confirmLeaveGroup=()=>{if(!leaveGroupId)return;p.leaveGroup(leaveGroupId);setGroups(items=>items.map(group=>group.id===leaveGroupId?{...group,members:group.members.filter(member=>member!==p.profile.name)}:group));setLeaveGroupId(null);};
  useEffect(()=>{if(p.live)setGroups(p.live.groups);},[p.live]);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { top.current?.closest("main")?.scrollTo({ top: 0 }); }, [selected]);
  const group = groups.find(item => item.id === selected);
  const landingGroups=groups.filter(item=>groupLandingView==="Joined"?visibleJoined.includes(item.id):groupLandingView==="All groups"||categoryOf(item.category)===(groupLandingView==="Run clubs"?"Run club":groupLandingView));
  const groupCard=(item:typeof groups[number])=>{const isJoined=visibleJoined.includes(item.id);const upcoming=item.classIndexes.length;return <article key={item.id} className={styles.exploreGroupCard}><div className={styles.groupListImage}><button className={styles.groupImageOpen} onClick={()=>openGroup(item.id)} aria-label={`View ${item.name}`}>{item.image?<img src={item.image} alt="" loading="lazy"/>:<Users size={40}/>}</button><span className={styles.groupTypePill}>{categoryOf(item.category)}</span></div><div className={styles.exploreGroupCopy}><div className={styles.groupListTitleRow}><button className={styles.groupListName} onClick={()=>openGroup(item.id)}>{item.name}</button><button className={styles.groupListJoin} aria-pressed={isJoined} aria-label={`${isJoined?"Joined":"Join"} ${item.name}`} onClick={()=>toggleMembership(item.id)}>{isJoined?<><Check size={14} aria-hidden="true"/>Joined</>:"Join"}</button></div><button className={styles.groupListCopyButton} onClick={()=>openGroup(item.id)}><span>{upcoming?`${upcoming} upcoming ${upcoming===1?"class":"classes"}`:"No upcoming classes"} · {item.location||"Location not added"}</span><span>{item.description}</span></button></div></article>;};
  const back = <BackButton className={styles.backButton} label="Back to Groups" onClick={() => setSelected(null)}/>;
  return <div ref={top}>{leaveGroupId&&<div className={styles.followOverlay} onMouseDown={event=>{if(event.target===event.currentTarget)setLeaveGroupId(null);}}><section className={`${styles.followDialog} ${styles.leaveGroupDialog}`} role="alertdialog" aria-modal="true" aria-labelledby="leave-group-title"><button className={styles.followClose} aria-label="Cancel leaving group" onClick={()=>setLeaveGroupId(null)}><X size={20}/></button><h2 id="leave-group-title">Are you sure you want to leave this group?</h2><p>You’ll no longer see its classes or updates with your groups.</p><button className={styles.leaveGroupConfirm} onClick={confirmLeaveGroup}>Leave group</button><button className={styles.leaveGroupCancel} onClick={()=>setLeaveGroupId(null)}>Stay in group</button></section></div>}
    {!selected ? (discover ? <>
      <div className={styles.discoveryHeader}><BackButton className={styles.backButton} label="Back to Groups" onClick={()=>setDiscover(false)}/><h1 className={styles.pageTitle}>Search groups</h1></div>
      <div className={styles.discoveryCategories} role="group" aria-label="Group category">{categories.map(category=><button key={category} aria-pressed={groupCategory===category} onClick={()=>setGroupCategory(category)}>{category}</button>)}</div>
      <div className={styles.topControls}><label className={styles.search}><Search size={19}/><Input aria-label="Search groups" placeholder="Search groups" value={groupQuery} onChange={e=>setGroupQuery(e.target.value)}/></label><button className={styles.groupSearchAdd} onClick={()=>setSelected("create")} aria-label="Start a new group"><Plus size={22}/></button></div>
      <div className={styles.directoryFilters} aria-label="Group filters">
        <label><select aria-label="Distance" value={distance} disabled={locationPending} onChange={event=>chooseDistance(event.target.value)}><option value="">{locationPending?"Locating…":"Distance"}</option>{[1,2,5,10,25].map(miles=><option key={miles} value={miles}>Within {miles} {miles===1?"mile":"miles"}</option>)}</select><ChevronDown size={14}/></label>
      </div>
      {locationError&&<p role="status" className={styles.sectionIntro}>{locationError}</p>}
      {results.length===0&&<p className={styles.sectionIntro}>No matching groups. Try another category or search.</p>}
      <div className={styles.exploreGroupList}>{results.map(item=><article key={item.id} className={styles.exploreGroupCard}><div className={styles.groupListImage}><button className={styles.groupImageOpen} onClick={()=>openGroup(item.id)} aria-label={`View ${item.name}`}>{item.image?<img src={item.image} alt="" loading="lazy"/>:<Users size={40}/>}</button><span className={styles.groupTypePill}>{categoryOf(item.category)}</span></div><div className={styles.exploreGroupCopy}><div className={styles.groupListTitleRow}><button className={styles.groupListName} onClick={()=>openGroup(item.id)}>{item.name}</button><button className={styles.groupListJoin} aria-pressed={joined.includes(item.id)} aria-label={`${joined.includes(item.id)?"Joined":"Join"} ${item.name}`} onClick={()=>toggleMembership(item.id)}>{joined.includes(item.id)?<><Check size={14} aria-hidden="true"/>Joined</>:"Join"}</button></div><button className={styles.groupListCopyButton} onClick={()=>openGroup(item.id)}><span>{item.location || "Location not added"}</span><span>{item.description}</span></button></div></article>)}</div>
    </> : <div className={styles.collectionPage}>
      <div className={styles.collectionPageHeader}><h1 className={styles.pageTitle}>Groups</h1><div className={styles.collectionHeaderActions}><button className={styles.collectionDiscover} aria-label="Search groups" onClick={()=>setDiscover(true)}><Search size={19}/></button><button className={styles.collectionDiscover} aria-label="Create a group" onClick={()=>setSelected("create")}><Plus size={20}/></button></div></div>
      <div className={styles.discoveryCategories} role="group" aria-label="Group views">{["All groups","Joined","Run clubs","Fitness","Wellness"].map(label=><button key={label} data-collection-target={label==="Joined"?"groups":undefined} aria-pressed={groupLandingView===label} onClick={()=>setGroupLandingView(label)}>{label}</button>)}</div>
      {landingGroups.length?<div className={styles.exploreGroupList}>{landingGroups.map(groupCard)}</div>:<div className={styles.collectionEmpty}><p>{groupLandingView==="Joined"?"You haven’t joined a group yet.":"No groups in this category yet."}</p><button className={styles.discoverMore} onClick={()=>setDiscover(true)}>Find groups <ArrowUpRight size={16}/></button></div>}
    </div>) : selected === "create" ? <GroupCreator location={p.profile.location || ""} people={(p.live?.people || explorePeople).filter(person=>person.name!==p.profile.name)} onCancel={()=>setSelected(null)} onCreate={draft=>{const id=`group-${Date.now()}`;setGroups(items=>[...items,{id,coordinates:null,banner:null,location:draft.location,name:draft.name,category:draft.category,description:draft.description,image:draft.image,members:[p.profile.name],classIndexes:[],purpose:draft.purpose,invitees:draft.invitees}]);p.joinGroup(id,draft.name,0,true);setSelected(id);}}/>
    : group && groupView==="members" ? <>
      <BackButton className={styles.backButton} label={`Back to ${group.name}`} onClick={()=>setGroupView("schedule")}/>
      <h1 className={styles.pageTitle}>Members</h1>
      <p className={styles.sectionIntro}>{group.name}</p>
      <div className={styles.stack}>{group.members.map((member,index)=><div className={styles.groupMemberRow} key={member}><Face initials={member.split(" ").map(part=>part[0]).join("")} color={["#D8C6B4","#AFCFEC","#C8C3DB"][index%3]} size={44}/><strong>{member}</strong></div>)}</div>
    </> : group ? <>
      <ProfileHero type="Group" name={group.name} id={group.id} banner={group.banner} photo={group.image} onBack={()=>setSelected(null)}/>
      <ProfileInfo kind="group" id={group.id} name={group.name} type={categoryOf(group.category)} location={group.location} about={group.description}/>
      <div className={styles.groupJoinFooter}><button className={styles.groupMemberCount} onClick={()=>setGroupView("members")}><span className={styles.groupAvatarStack}>{group.members.slice(0,3).map((member,index)=><Face key={member} initials={member.split(" ").map(part=>part[0]).join("")} color={["#D8C6B4","#AFCFEC","#C8C3DB"][index%3]} size={24}/>)}</span><strong>{group.members.length} members</strong><ChevronRight size={14}/></button><button className={styles.groupJoinButton} aria-pressed={joined.includes(group.id)} onClick={()=>toggleMembership(group.id)}>{joined.includes(group.id)?<><Check size={14} aria-hidden="true"/>Joined</>:"Join"}</button></div>
      <div className={styles.groupFooterSpace}>
      <div className={styles.groupContentToggle} role="tablist" aria-label={`${group.name} content`}>
        <button role="tab" aria-selected={groupView==="updates"} onClick={()=>{setGroupView("updates");setSeenUpdates(ids=>ids.includes(group.id)?ids:[...ids,group.id]);}}>Updates{!p.live&&!seenUpdates.includes(group.id)&&<Badge aria-label="2 new updates">2</Badge>}</button>
        <button role="tab" aria-selected={groupView==="schedule"} onClick={()=>setGroupView("schedule")}>Schedule</button>
      </div>
      <div role="tabpanel" className={styles.groupContentPanel}>{groupView==="updates"?<GroupSampleUpdates live={!!p.live} running={categoryOf(group.category)==="Run club"}/>:group.classIndexes.length ? group.classIndexes.map(index => <section className={styles.daySection} key={index}><h3 className={styles.groupDateTitle}>{groupClasses[index].day}</h3><ClassCard item={groupClasses[index]}/></section>) : <p className={styles.sectionIntro}>{p.live ? "No classes have been added to this group yet." : "No classes planned yet. Check back for the next group plan."}</p>}</div>
      </div>
    </> : <>{back}<p className={styles.sectionIntro}>Group unavailable.</p>    </>}
  </div>;
}

function YouScreen({ appearance, onAppearanceChange, onOpenCalendar, onOpenDetail }: { appearance: AppearanceMode; onAppearanceChange: (value: AppearanceMode) => void; onOpenCalendar: () => void; onOpenDetail?:(destination:Destination)=>void }) {
  const p=usePrototype();
  const openDetail=onOpenDetail??p.open;
  const sheet = useRef<HTMLDialogElement>(null);
  const [qr, setQr] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [appearanceOpen,setAppearanceOpen]=useState(false);
  const profileUrl = `https://fittlist.co/${p.profile.handle}`;
  const openShare = async () => {
    setCopyStatus("");
    sheet.current?.showModal();
    try {
      const QRCode = (await import("qrcode")).default;
      setQr(await QRCode.toDataURL(profileUrl, { width: 640, margin: 4, errorCorrectionLevel: "M" }));
    } catch { setCopyStatus("QR code unavailable. You can still copy your link below."); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(profileUrl); setCopyStatus("Profile link copied."); }
    catch { setCopyStatus("Select the link below to copy it manually."); }
  };
  if(appearanceOpen)return <div className={styles.youPage}><BackButton label="Back to Profile" onClick={()=>setAppearanceOpen(false)}/><h1 className={styles.pageTitle}>Appearance</h1><div className={styles.appearanceSetting}><div><span className={styles.settingsIcon}><Moon size={22}/></span><div><strong>Theme</strong><span>{appearance==="automatic"?"Changes with the time of day":appearance==="light"?"Always use the light appearance":"Always use the dark appearance"}</span></div></div><div className={styles.appearanceOptions} role="group" aria-label="Appearance">{(["automatic","light","dark"] as AppearanceMode[]).map(option=><button key={option} aria-pressed={appearance===option} onClick={()=>onAppearanceChange(option)}>{option==="automatic"?"Automatic":option==="light"?"Light":"Dark"}</button>)}</div></div></div>;
  return <div className={styles.youPage}>
    <header className={styles.profileHeader}>
      <Face initials={p.profile.name.split(" ").map(part=>part[0]).join("").slice(0,2)} color="#C8C3DB" photo={p.profile.photo} size={80}/>
      <h1 className={styles.pageTitle}>{p.profile.name}</h1>
      <div className={styles.profileActions}>
        <Button data-variant="outline" variant="outline" onClick={openShare} aria-haspopup="dialog">@{p.profile.handle}<ChevronDown size={16}/></Button>
        <Button data-variant="outline" variant="outline" onClick={()=>openDetail({kind:"edit-profile"})}>Edit profile</Button>
      </div>
      <p>{p.profile.bio} · {p.profile.location}</p>{p.profile.about&&<details className={styles.profileExtra}><summary>About</summary><p>{p.profile.about}</p></details>}
    </header>
    <dialog ref={sheet} className={styles.profileSheet} aria-labelledby="profile-share-title" onClick={event => { if (event.target === event.currentTarget) sheet.current?.close(); }}>
      <div className={styles.sheetBody}>
        <button className={styles.sheetClose} aria-label="Close profile sharing" onClick={() => sheet.current?.close()}><X size={22}/></button>
        <h2 id="profile-share-title">Share your profile</h2>
        <p>Scan to find @{p.profile.handle} on FittList.</p>
        {qr ? <img className={styles.profileQr} src={qr} alt={`QR code linking to ${p.profile.name}’s FittList profile`}/> : <p>Preparing your QR code…</p>}
        <button className={styles.copyProfile} onClick={copyLink}><Copy size={18}/>Copy profile link</button>
        <input aria-label="Profile link" value={profileUrl} readOnly onFocus={event => event.target.select()}/>
        <p className={styles.copyStatus} role="status">{copyStatus}</p>
      </div>
    </dialog>
    <section><SectionTitle>Calendars you manage</SectionTitle><div className={styles.stack}>
      {[{name:"My calendar",initials:"ML",detail:"Classes, shifts, and saved plans",photo:p.profile.photo},...(p.live ? p.live.managed : [{name:"Ironbound Performance Athletics",initials:"IP",detail:"Studio calendar · You’re an admin",photo:null},{name:"Gals who like to move",initials:"GM",detail:"Group calendar · 4 members",photo:null}])].map(calendar=><button key={calendar.name} className={styles.cardLink} onClick={()=>calendar.name==="My calendar"?onOpenCalendar():openDetail({kind:"manage",name:calendar.name})}><Card className={styles.simpleCard}><CardContent className={styles.settingsRow}><span className={styles.settingsIcon}><Face initials={calendar.initials} photo={calendar.photo} color="#C8C3DB" size={40}/></span><div><strong>{calendar.name}</strong><span>{calendar.detail}</span></div><ChevronRight size={18}/></CardContent></Card></button>)}
    </div></section>
    {[
      { title: "Tools", rows: [
        { icon: Activity, title: "Insights", detail: "Your teaching, classes, and sharing" },
        { icon: CalendarDays, title: "Calendar & sync", detail: "Connect Google, Apple, or Outlook" },
      ] },
      { title: "Settings", rows: [
        { icon: CreditCard, title: "Membership", detail: p.membershipPlan === "studio" ? "Studio" : p.pro ? "Pro" : "Free" },
        { icon: Clock, title: "Set yourself as away", detail: "Add away dates, a profile note, and an automatic reply" },
        { icon: GlobeLock, title: "Privacy & communication", detail: "Messages, visibility, and follower approvals" },
        { icon: Bell, title: "Notification settings", detail: "Choose which alerts you receive" },
        { icon: LockKeyhole, title: "Account & preferences", detail: "Login and account details" },
        { icon: Moon, title: "Appearance", detail: appearance==="automatic"?"Changes with the time of day":appearance==="light"?"Always use the light appearance":"Always use the dark appearance" },
      ] },
      { title: "Admin", rows: [
        { icon: ShieldUser, title: "Admin dashboard", detail: "Manage people, studios, and event registration access" },
      ] },
    ].map((section) => <section key={section.title}>
      <SectionTitle>{section.title}</SectionTitle>
      <div className={styles.stack}>{section.rows.map(({ icon: Icon, title, detail }) =>
        <button key={title} className={styles.cardLink} onClick={()=>title==="Appearance"?setAppearanceOpen(true):openDetail(title==="Membership"?{kind:"membership"}:{kind:"settings",name:title})}><Card className={styles.simpleCard}><CardContent className={styles.settingsRow}>
          {Icon && <span className={styles.settingsIcon}><Icon size={22}/></span>}
          <div><strong>{title}</strong><span>{detail}</span></div>
          <ChevronRight size={18}/>
        </CardContent></Card></button>
      )}</div>
    </section>)}
    <form action={logout} onSubmit={clearClientMemory} className={styles.logoutForm}><Button type="submit" data-variant="outline" variant="outline"><LogOut size={19}/>Log out</Button></form>
  </div>;
}

function PreviewShell() {
  const p=usePrototype();
  const [appDayPart,setAppDayPart]=useState<"morning"|"midday"|"evening">("morning");
  const detail=p.stack.at(-1);
  const mainRef=useRef<HTMLElement>(null);
  const replayBack=useRef(false);
  const goingBack=useRef(false);
  const motionBusy=useRef(false);
  const animateEntry=()=>{if(goingBack.current){goingBack.current=false;return;}if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;mainRef.current?.animate([{transform:"translateX(100%)"},{transform:"translateX(0)"}],{duration:240,easing:"cubic-bezier(.2,.8,.2,1)"});};
  const captureBack=(event:React.MouseEvent<HTMLElement>)=>{
    const button=(event.target as HTMLElement).closest("button");
    if(!button||button.hasAttribute("data-local-back")||!/^back(?:\s|$)/i.test(button.getAttribute("aria-label")||button.textContent?.trim()||""))return;
    if(replayBack.current){replayBack.current=false;return;}
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    event.preventDefault();event.stopPropagation();if(motionBusy.current)return;
    motionBusy.current=true;goingBack.current=true;
    const animation=mainRef.current?.animate([{transform:"translateX(0)"},{transform:"translateX(100%)"}],{duration:200,easing:"ease-in",fill:"forwards"});
    void (animation?.finished||Promise.resolve()).then(()=>{replayBack.current=true;button.click();requestAnimationFrame(()=>{animation?.cancel();motionBusy.current=false;});}).catch(()=>{motionBusy.current=false;});
  };

  const [screen,setScreen]=useState<Screen>("calendar");
  const [calendarReturnScreen,setCalendarReturnScreen]=useState<Screen>("calendar");
  const [firstTime,setFirstTime]=useState(false);
  const [collectionViewVersion,setCollectionViewVersion]=useState(0);
  const [studioLandingView,setStudioLandingView]=useState("All studios");
  const [focusPerson,setFocusPerson]=useState<string|null>(null);
  useEffect(()=>{if(!p.followConfirmation)return;const dismiss=(event:KeyboardEvent)=>{if(event.key==="Escape")p.setFollowConfirmation(null);};window.addEventListener("keydown",dismiss);return()=>window.removeEventListener("keydown",dismiss);},[p.followConfirmation,p.setFollowConfirmation]);
  useEffect(()=>{if(!p.collectionConfirmation)return;const dismiss=(event:KeyboardEvent)=>{if(event.key==="Escape")p.setCollectionConfirmation(null);};window.addEventListener("keydown",dismiss);return()=>window.removeEventListener("keydown",dismiss);},[p.collectionConfirmation,p.setCollectionConfirmation]);
  const [sharing, setSharing] = useState(false);
  useEffect(()=>{const open=()=>{setScreen("calendar");setSharing(true);};window.addEventListener("preview-open-share",open);return()=>window.removeEventListener("preview-open-share",open);},[]);
  const [appearance,setAppearance]=useState<AppearanceMode>("automatic");
  useEffect(()=>{const updateDayPart=()=>{const hour=new Date().getHours();setAppDayPart(hour<12?"morning":hour<17?"midday":"evening");};updateDayPart();const timer=window.setInterval(updateDayPart,60000);return()=>window.clearInterval(timer);},[]);
  useEffect(() => { try { const saved=localStorage.getItem("fittlist-preview-appearance");if(saved==="automatic"||saved==="light"||saved==="dark")setAppearance(saved);else if(localStorage.getItem("fittlist-preview-dark")==="true")setAppearance("dark"); } catch {} }, []);
  const changeAppearance = (value: AppearanceMode) => { setAppearance(value); try { localStorage.setItem("fittlist-preview-appearance",value); } catch {} };

  const [selectedGroup,setSelectedGroup]=useState<string|null>(null);
  useEffect(()=>{const params=new URLSearchParams(window.location.search);if(params.get("detail")==="group"&&params.get("name")){setScreen("groups");setSelectedGroup(params.get("name"));}},[]);
  const takeover=!!detail || sharing || !!selectedGroup;
  useEffect(()=>{mainRef.current?.scrollTo({top:0});if(takeover)animateEntry();else goingBack.current=false;},[detail,screen,sharing,selectedGroup]);
  useEffect(()=>{const enter=()=>animateEntry();window.addEventListener("preview-subpage",enter);return()=>window.removeEventListener("preview-subpage",enter);},[]);
  useEffect(()=>{const viewSavedCalendar=()=>{setFocusPerson(null);setScreen("calendar");};window.addEventListener("preview-view-saved-calendar",viewSavedCalendar);return()=>window.removeEventListener("preview-view-saved-calendar",viewSavedCalendar);},[]);
  const effectiveDayPart=appearance==="light"?"midday":appearance==="dark"?"evening":appDayPart;
  return <div className={`${styles.preview} ${styles.apple} ${effectiveDayPart==="morning"?styles.morningTheme:effectiveDayPart==="midday"?styles.middayTheme:styles.eveningTheme} ${effectiveDayPart==="evening" ? styles.dark : ""}`}><div className={styles.notice}>{p.live ? "Live account data · edits stay local" : "Apple-inspired · Delight · sample content"}</div><div className={styles.phone}><SavedClassSheet onCreateGroup={()=>{p.reset();setScreen("groups");setSelectedGroup("create");}}/>{p.followConfirmation && <div className={styles.followOverlay} onMouseDown={event=>{if(event.target===event.currentTarget)p.setFollowConfirmation(null);}}><section className={styles.followDialog} role="dialog" aria-modal="true" aria-labelledby="follow-title"><button className={styles.followClose} aria-label="Close follow confirmation" onClick={()=>p.setFollowConfirmation(null)}><X size={20}/></button><span className={styles.followSuccess}><Check size={27} weight="bold"/></span><h2 id="follow-title">You’re following {p.followConfirmation}</h2><button className={styles.followGoHome} onClick={()=>{setFocusPerson(p.followConfirmation);setCollectionViewVersion(value=>value+1);setScreen("people");setSharing(false);p.reset();p.setFollowConfirmation(null);}}>See their calendar <ArrowUpRight size={18}/></button><label className={styles.followRemember}><input type="checkbox" checked={p.skipFollowConfirmation} onChange={event=>p.setFollowConfirmationPreference(event.target.checked)}/> Don’t show me again</label></section></div>}{p.collectionConfirmation && <div className={styles.followOverlay} onMouseDown={event=>{if(event.target===event.currentTarget)p.setCollectionConfirmation(null);}}><section className={styles.followDialog} role="dialog" aria-modal="true" aria-labelledby="collection-title"><button className={styles.followClose} aria-label="Close confirmation" onClick={()=>p.setCollectionConfirmation(null)}><X size={20}/></button><span className={styles.followSuccess}><Check size={27} weight="bold"/></span><h2 id="collection-title">{p.collectionConfirmation.kind==="studio"?"Saved":p.collectionConfirmation.created?`You created ${p.collectionConfirmation.name}`:`You joined ${p.collectionConfirmation.name}`}</h2><button className={styles.followGoHome} onClick={async()=>{const confirmation=p.collectionConfirmation;if(confirmation?.created){try{await navigator.clipboard.writeText(`Join ${confirmation.name} on FittList: ${window.location.origin}/ui-preview?detail=group&name=${encodeURIComponent(confirmation.id||"")}`);}catch{}p.setCollectionConfirmation(null);return;}p.setCollectionConfirmation(null);p.reset();if(confirmation?.kind==="studio"){setStudioLandingView("Saved");setCollectionViewVersion(value=>value+1);setScreen("studios");}else{setSelectedGroup(confirmation?.id || null);setScreen("groups");}}}>{p.collectionConfirmation.created?<><Copy size={18}/>Invite people</>:<>{p.collectionConfirmation.kind==="studio"?"See saved studios":"Open group"} <ArrowUpRight size={18}/></>}</button>{!p.collectionConfirmation.created&&<label className={styles.followRemember}><input type="checkbox" checked={p.skipCollectionConfirmation[p.collectionConfirmation.kind]} onChange={event=>p.setCollectionConfirmationPreference(p.collectionConfirmation!.kind,event.target.checked)}/> Don’t show me again</label>}</section></div>}{p.saveNotice && <div className={styles.saveNotice} role="status"><span>{p.saveNotice}</span><button aria-label="Dismiss schedule notice" onClick={()=>p.setSaveNotice("")}><X size={18}/></button></div>}
    <div className={styles.dataBanner} role="status">{p.dataStatus==="loading"?"Loading your account…":p.live?"Live data · changes stay in this preview":p.dataStatus==="error"?"Couldn’t load account data. Showing samples.":<>Sample data · <Link href="/?join=login&next=/ui-preview">Sign in</Link> to load your account.</>}{p.dataStatus!=="loading" && <button onClick={()=>void p.reloadData()}>{p.live?"Refresh":"Retry"}</button>}</div>
    <div className={styles.prototypeMode}><span>Prototype state</span><button type="button" role="switch" aria-label="First-time view" aria-checked={firstTime} onClick={()=>{setFirstTime(value=>!value);p.reset();setSelectedGroup(null);}}><span>First-time</span><i/></button></div>
    <main ref={mainRef} onClickCapture={captureBack} className={`${styles.content} ${takeover ? styles.profileTakeover : ""} ${screen === "calendar" && !sharing && !detail ? styles.calendarContent : ""}`} aria-label={screens.find(({ id }) => id === screen)?.label}>{detail && <DetailScreens key={`${p.stack.length}-${detail.kind}-${detail.name}`} route={detail}/>}<div hidden={!!detail}>{sharing ? <SharePreview onBack={() => setSharing(false)}/> : screen==="calendar"?<CalendarScreen firstTime={firstTime} appearance={appearance} onAppearanceChange={changeAppearance} returnScreen={calendarReturnScreen} onNavigate={target=>setScreen(target)} onOpenGroup={id=>{setSelectedGroup(id);setScreen("groups");}} onShare={() => setSharing(true)}/>:screen==="people"?<PeopleScreen key={`people-${collectionViewVersion}`} focusPerson={focusPerson} firstTime={firstTime}/>:screen==="studios"?<StudiosScreen key={`studios-${collectionViewVersion}`} firstTime={firstTime} initialView={studioLandingView}/>:screen==="groups"?<GroupsScreen selected={selectedGroup} setSelected={setSelectedGroup} firstTime={firstTime}/>:<YouScreen appearance={appearance} onAppearanceChange={changeAppearance} onOpenCalendar={()=>{setCalendarReturnScreen("you");setScreen("calendar");window.requestAnimationFrame(()=>window.dispatchEvent(new Event("preview-open-calendar")));}}/>}</div></main>
    <nav className={`${styles.dock} ${takeover?styles.dockTakeover:""}`} aria-label="Preview screens">{screens.filter(item=>item.id!=="you"&&item.id!=="studios").map(({id,label,icon:Icon})=><button key={id} type="button" aria-current={screen===id?"page":undefined} onClick={()=>{if(id==="calendar")setCalendarReturnScreen("calendar");setScreen(id);setSharing(false);p.reset();}}><Icon size={21} weight={screen===id?"fill":"bold"}/><span className={styles.navLabel}>{label}</span></button>)}<div className={styles.managedNav}><h2>Managed studios</h2>{(p.live?.managed||[{name:"Ironbound Performance Athletics",photo:null}]).map(studio=><button key={studio.name} type="button" onClick={()=>p.open({kind:"manage",name:studio.name})}><span className={styles.managedNavAvatar}>{studio.photo?<img src={studio.photo} alt=""/>:<Storefront size={18}/>}</span><span>{studio.name}</span></button>)}</div></nav>
  </div></div>;
}

export default function UiPreview() { return <PrototypeProvider><PreviewShell/></PrototypeProvider>; }
