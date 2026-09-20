"use client";
import Link from "next/link";

import { useEffect, useMemo, useRef, useState } from "react";
import PreviewClassCard from "./class-card";
import GroupSampleUpdates from "./group-sample-updates";
import { useCalendarSwipe } from "./use-calendar-swipe";
import ProfileHero from "./profile-hero";
import DetailScreens from "./detail-screens";
import { PrototypeProvider, usePrototype, dateLabel, timeLabel } from "./prototype-state";
import { logout } from "@/app/actions/auth";
import { clearClientMemory } from "@/lib/client-memory";
import { Activity, ArrowLeft, ArrowUpRight, Bell, House, MessageCircle, CalendarDays, ChevronLeft, ChevronDown, Copy, X, ChevronRight, Clock, CreditCard, GlobeLock, LockKeyhole, LogOut, Map as MapIcon, MapPin, Moon, Plus, Search, Share2, ShieldUser, UserRound, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calendarActivitySummary } from "@/lib/calendar-summary";
import SharePreview from "./share-preview";
import StudioMap, { type MapStudio } from "./studio-map";
import styles from "./preview.module.css";

type Screen = "calendar" | "explore" | "groups" | "you";

const screens: { id: Screen; label: string; icon: typeof CalendarDays }[] = [
  { id: "calendar", label: "Home", icon: House },
  { id: "explore", label: "Explore", icon: Search },
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
  return <Avatar style={{ width: size, height: size, background: color }}><AvatarFallback style={{ background: color, color: "var(--preview-on-soft)", fontWeight: 600 }}>{initials}</AvatarFallback></Avatar>;
}

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return <div className={styles.sectionTitle}><h2>{children}</h2>{aside}</div>;
}

function ClassCard({ item }: { item: typeof classes[number] & {id?:string} }) {
  const p = usePrototype();
  const found=p.schedule.find(c=>item.id ? c.id===item.id : c.name===item.name && c.place===item.place);
  return found ? <PreviewClassCard item={found}/> : null;
}

function CalendarScreen({ onShare }: { onShare: () => void }) {
  const p = usePrototype();
  const calendarClasses = p.schedule.map(c => ({ id:c.id,name:c.name, place:c.place, coach:c.coach, day:dateLabel(c.date), time:timeLabel(c.time), duration:`${c.duration} min`, color:"#C8C3DB" }));
  const [view, setView] = useState("you");
  const swipe=useCalendarSwipe(view,setView);
  const [selectedPerson, setSelectedPerson] = useState("All");
  const samplePeople: {name:string;initials:string;color:string;photo?:string|null}[] = [{ name: "Erin", initials: "EC", color: "#D8C6B4" }, { name: "Freddie", initials: "FM", color: "#AFCFEC" }];
  const people=p.live ? p.live.people.filter(person=>person.name!==p.profile.name && p.following.includes(person.name)) : samplePeople;
  const personalClasses=calendarClasses.filter(c=>(p.schedule.find(item=>item.id===c.id)?.own ?? (c.coach===p.profile.name || c.coach==="Matt LeGrice")) || p.saved.includes(c.id));
  const followingClasses=calendarClasses.filter(c=>!(p.schedule.find(item=>item.id===c.id)?.own ?? (c.coach===p.profile.name || c.coach==="Matt LeGrice")) && (!p.live || p.following.includes(c.coach)));
  return <div ref={swipe.root} {...swipe.handlers} className={styles.swipeCalendar}>
    <Tabs value={view} onValueChange={value => setView(String(value))}>
      <div className={styles.calendarHero}>
        <div className={styles.homeTopRow}><TabsList className={`${styles.fullTabs} ${styles.calendarModeTabs}`} aria-label="Calendar view"><TabsTrigger value="you">You</TabsTrigger><TabsTrigger value="following">Following</TabsTrigger><span aria-hidden="true" className={styles.calendarIndicator} style={swipe.indicator}/></TabsList><div className={styles.homeUtilities}><button aria-label="Notifications" onClick={()=>{p.setSampleNotificationsSeen(true);p.open({kind:"notifications"});}}><Bell size={21}/>{!p.live&&!p.sampleNotificationsSeen&&<span aria-label="2 unread notifications">2</span>}</button><button aria-label="Messages" onClick={()=>{p.setSampleMessagesSeen(true);p.open({kind:"messages"});}}><MessageCircle size={21}/>{!p.live&&!p.sampleMessagesSeen&&<span aria-label="1 unread message">1</span>}</button></div></div>
        {view === "you" ? <div className={`${styles.calendarSummary} ${styles.yourCalendarSummary}`}><strong>{calendarActivitySummary({ teaching: p.schedule.filter(c=>c.own ?? (c.coach===p.profile.name || c.coach==="Matt LeGrice")).length, attending: personalClasses.filter(c=>!(p.schedule.find(item=>item.id===c.id)?.own ?? (c.coach===p.profile.name || c.coach==="Matt LeGrice"))).length, personal: 0 })}</strong><div className={styles.heroActions}><button type="button" onClick={onShare} className={styles.shareWeekButton} aria-label="Share your week">Share your week<ArrowUpRight size={16} aria-hidden="true"/></button></div></div> : <div className={styles.peopleRail} aria-label="Filter by person"><button type="button" className={styles.personFilter} aria-pressed={selectedPerson === "All"} onClick={() => setSelectedPerson("All")}><span className={styles.personRing}><span className={styles.allFace}><Users size={22}/></span></span><small>All</small></button>{people.map((person) => <button key={person.name} type="button" className={styles.personFilter} aria-pressed={selectedPerson === person.name} onClick={() => setSelectedPerson(person.name)}><span className={styles.personRing}><Face initials={person.initials} color={person.color} photo={person.photo} size={80}/></span><small>{person.name}</small></button>)}</div>}
      </div>
      <TabsContent value="you" className={styles.calendarYouPanel}>{personalClasses.length===0 && <p className={styles.sectionIntro}>No upcoming classes on your calendar.</p>}{personalClasses.map((item) => <section className={styles.daySection} key={item.id}><h3>{item.day}</h3><ClassCard item={item}/></section>)}<button onClick={() => p.open({kind:"add-class"})} className={styles.addFab} aria-label="Add a class"><Plus size={28}/></button></TabsContent>
      <TabsContent value="following">{selectedPerson !== "All" && <div className={styles.calendarPersonContext}><SectionTitle aside={<button className={styles.calendarProfileButton} onClick={()=>p.open({kind:"person",name:p.live ? selectedPerson : followingClasses.find(item=>item.coach.startsWith(selectedPerson))?.coach || selectedPerson})}>View Profile<ChevronRight size={16}/></button>}>{`${selectedPerson}’s calendar`}</SectionTitle></div>}{followingClasses.length===0 && <p className={styles.sectionIntro}>Follow people in Explore to see their upcoming classes.</p>}{followingClasses.filter((item) => selectedPerson === "All" || item.coach.startsWith(selectedPerson)).map((item) => <section className={styles.daySection} key={item.id}><h3>{item.day}</h3><ClassCard item={item}/></section>)}</TabsContent>
    </Tabs>
  </div>;
}

type ExplorePage = "people" | "studios";
const explorePeople = [
  { name: "Erin Clyne", title: "Yoga Teacher + Clinical Sports Massage", initials: "EC", color: "#D8C6B4", specialty: "Yoga" },
  { name: "Freddie Morgan", title: "Strength & mobility coach", initials: "FM", color: "#AFCFEC", specialty: "Strength" },
  { name: "Alex Lee", title: "Pilates instructor", initials: "AL", color: "#C8C3DB", specialty: "Pilates" },
  { name: "Jordan Rivera", title: "Running coach", initials: "JR", color: "#BBD4C5", specialty: "Running" },
  { name: "Sam Chen", title: "Strength coach", initials: "SC", color: "#E3CEAE", specialty: "Strength" },
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
    <button className={styles.directoryFollow} aria-label={`${following?"Following":"Follow"}: ${person.name}`} aria-pressed={following} onClick={()=>p.setFollowing(v=>following?v.filter(x=>x!==person.name):[...v,person.name])}>{following?"Following":"Follow"}</button>
  </div>;
}
function ExploreStudio({ place }: { place: typeof exploreStudios[number] }) {
  const p=usePrototype();
  return <button className={styles.cardLink} onClick={()=>p.open({kind:"studio",name:place.name})}><Card className={styles.simpleCard}><CardContent className={styles.menuRow}><div className={styles.discoverGroupIcon}><MapPin size={21}/></div><div><strong>{place.name}</strong><span>{place.type} · {place.location}</span></div><ChevronRight size={18}/></CardContent></Card></button>;
}
function ExploreScreen({ page, onNavigate, onGroups }: { page: ExplorePage | null; onNavigate: (page: ExplorePage | null) => void; onGroups: (id?:string) => void }) {
  const p=usePrototype();
  const peopleSource=p.live?.people || explorePeople;
  const studiosSource=p.live?.studios || exploreStudios;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [mapView, setMapView] = useState(false);
  const matches = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const shownPeople = peopleSource.filter(person => matches(`${person.name} ${person.title}`) && (!filter || person.specialty === filter));
  const shownStudios = useMemo(() => studiosSource.filter(place => `${place.name} ${place.type} ${place.location}`.toLowerCase().includes(query.trim().toLowerCase()) && (!filter || place.type === filter)), [query, filter, studiosSource]);
  const more = (target: ExplorePage) => <button className={styles.seeAll} onClick={() => { setFilter(""); onNavigate(target); }} aria-label={`See all ${target}`}>See all<ChevronRight size={15}/></button>;
  if (!page) return <>
    <h1 className={styles.pageTitle}>Explore</h1>
    <div className={styles.topControls}><label className={styles.search}><Search size={19}/><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="People, studios, and groups" aria-label="Search Explore"/></label></div>
    {shownPeople.length + shownStudios.length + (p.live?.groups || sampleGroups).filter(g=>matches(`${g.name} ${g.description} ${g.category}`)).length === 0 && <p className={styles.sectionIntro}>No matches. Try another search.</p>}
    <section><SectionTitle aside={more("people")}>{p.live ? "People" : "People near you"}</SectionTitle><div className={`${styles.peopleRail} ${styles.explorePeopleRail}`} role="region" aria-label="People near you" tabIndex={0}>{shownPeople.slice(0,10).map(person => <button key={person.name} className={styles.personRailCard} onClick={()=>p.open({kind:"person",name:person.name})}><Face initials={person.initials} color={person.color} photo={"photo" in person && typeof person.photo === "string" ? person.photo : null} size={64}/><strong>{person.name}</strong><small>{person.specialty}</small></button>)}</div></section>
    <section><SectionTitle aside={more("studios")}>{p.live ? "Studios" : "Studios near you"}</SectionTitle><div className={styles.studiosRail} role="region" aria-label="Studios near you" tabIndex={0}>{shownStudios.slice(0,8).map(place => <button key={place.name} className={`${styles.studioRailCard} ${styles.studioPhotoCard}`} onClick={()=>p.open({kind:"studio",name:place.name})}>{place.photo ? <img src={place.photo} alt=""/> : <div className={styles.studioRailPlaceholder}><MapPin size={32}/></div>}<span><strong>{place.name}</strong><small>{place.type}</small><small>{place.location}</small></span></button>)}</div></section>
    <section><SectionTitle aside={<button className={styles.seeAll} onClick={()=>onGroups()} aria-label="See all groups">See all<ChevronRight size={15}/></button>}>Groups</SectionTitle><div className={styles.studiosRail} role="region" aria-label="Explore groups" tabIndex={0}>{(p.live?.groups || sampleGroups).filter(g=>matches(`${g.name} ${g.description} ${g.category}`)).slice(0,8).map(g=><button key={g.id} className={styles.studioRailCard} onClick={()=>onGroups(g.id)}>{g.image ? <img src={g.image} alt="" loading="lazy"/> : <div className={styles.studioRailPlaceholder}><Users size={32}/></div>}<span><strong>{g.name}</strong><small>{g.category}</small></span></button>)}</div></section>
  </>;
  const title = page.charAt(0).toUpperCase() + page.slice(1);
  const options = [...new Set(page === "people" ? peopleSource.map(person=>person.specialty) : studiosSource.map(studio=>studio.type))];
  const count = page === "people" ? shownPeople.length : shownStudios.length;
  return <>
    <header className={styles.detailNav}><button aria-label="Back to Explore" onClick={()=>{setFilter("");onNavigate(null);}}><ChevronLeft size={22}/></button><h1 className={styles.directoryNavTitle}>{title}</h1><span aria-hidden="true"/></header>
    <div className={styles.topControls}><label className={styles.search}><Search size={19}/><Input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${page}`} aria-label={`Search ${page}`}/></label></div>
    <label className={styles.categoryFilter}>{page === "people" ? "Specialty" : "Studio type"}<select value={filter} onChange={event => setFilter(event.target.value)}><option value="">All {page === "people" ? "specialties" : "types"}</option>{options.map(option => <option key={option}>{option}</option>)}</select></label>
    <SectionTitle aside={<Badge variant="secondary">{count}</Badge>}>{title} nearby</SectionTitle>
    {count === 0 && <p className={styles.sectionIntro}>No matches. Try another search or filter.</p>}
    {page === "studios" && mapView ? <StudioMap studios={shownStudios} onClose={() => setMapView(false)}/> : <div className={page === "people" ? styles.peopleList : styles.stack}>{page === "people" ? shownPeople.map(person => <ExplorePerson key={person.name} person={person}/>) : shownStudios.map(place => <ExploreStudio key={place.name} place={place}/>)}</div>}
    {page === "studios" && !mapView && <button className={styles.mapToggle} onClick={() => setMapView(true)}><MapIcon size={19}/>Map</button>}
  </>;
}

const sampleGroups = [
  { id: "gals", location:"Jersey City, NJ", banner:null as string|null, name: "Gals who like to move", category: "Group fitness", description: "Find a class, make a plan, and bring your people.", image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1000&q=85", members: ["Erin Clyne", "Freddie Morgan", "Alex Lee", "Matt LeGrice"], classIndexes: [1, 2] },
  { id: "run", location:"Jersey City, NJ", banner:null as string|null, name: "Jersey City Run Club", category: "Running", description: "Easy miles, good company, and a reason to get outside. All paces welcome.", image: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1000&q=85", members: ["Jordan Rivera", "Sam Chen", "Taylor Brooks"], classIndexes: [] },
  { id: "sweat", location:"Jersey City, NJ", banner:null as string|null, name: "Sunday Sweat Crew", category: "Strength & mobility", description: "Make Sunday your day to move. Try local classes together and meet your next workout buddy.", image: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1000&q=85", members: ["Freddie Morgan", "Alex Lee", "Jamie Park"], classIndexes: [1] },
];
function GroupsScreen({selected,setSelected}:{selected:string|null;setSelected:(value:string|null)=>void}) {
  const p=usePrototype();
  const groupClasses=p.schedule.map(c=>({id:c.id,name:c.name,place:c.place,coach:c.coach,day:dateLabel(c.date),time:timeLabel(c.time),duration:`${c.duration} min`,color:"#C8C3DB"}));
  const [groups, setGroups] = useState(sampleGroups);
  const [joined, setJoined] = useState(["gals"]);
  const [groupQuery,setGroupQuery]=useState("");
  const [groupCategory,setGroupCategory]=useState("All groups");
  const [seenUpdates,setSeenUpdates]=useState<string[]>([]);
  const [groupView,setGroupView]=useState<"schedule"|"members"|"updates">("schedule");
  useEffect(()=>{setGroupView("schedule");},[selected]);
  useEffect(()=>{window.dispatchEvent(new Event("preview-subpage"));},[groupView]);
  const categories=["All groups","New groups","Your groups","Fitness","Wellness","Run club"];
  const categoryOf=(value:string)=>/run/i.test(value)?"Run club":/wellness|yoga|mindful/i.test(value)?"Wellness":"Fitness";
  const results=groups.filter(g=>(`${g.name} ${g.description} ${g.category}`).toLowerCase().includes(groupQuery.trim().toLowerCase())&&(groupCategory==="All groups"||(groupCategory==="New groups"?!joined.includes(g.id):groupCategory==="Your groups"?joined.includes(g.id):categoryOf(g.category)===groupCategory)));
  const openGroup=(id:string)=>{setSelected(id);};
  useEffect(()=>{if(p.live){setGroups(p.live.groups);setJoined(p.live.joined);}},[p.live]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [groupLocation,setGroupLocation]=useState(p.profile.location || "");
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { top.current?.closest("main")?.scrollTo({ top: 0 }); }, [selected]);
  const group = groups.find(item => item.id === selected);
  const back = <button className={styles.backButton} onClick={() => setSelected(null)}><ArrowLeft size={19}/>Back to Groups</button>;
  return <div ref={top}>
    {!selected || selected === "browse" ? <>
      <div className={styles.pageTitleRow}><h1 className={styles.pageTitle}>Groups</h1><button className={styles.addGroupButton} onClick={()=>setSelected("create")} aria-label="Start a new group"><Plus size={24}/></button></div>
      <div className={styles.topControls}><label className={styles.search}><Search size={19}/><Input aria-label="Search groups" placeholder="Search groups" value={groupQuery} onChange={e=>setGroupQuery(e.target.value)}/></label></div>
      <div className={styles.groupCategories} role="group" aria-label="Group categories">{categories.map(c=><button key={c} aria-pressed={groupCategory===c} onClick={()=>setGroupCategory(c)}>{c}</button>)}</div>
      {results.length===0&&<p className={styles.sectionIntro}>No matching groups. Try another category or search.</p>}
      <div className={styles.exploreGroupList}>{results.map(item=><article key={item.id} className={styles.exploreGroupCard}><div className={styles.groupListImage}><button className={styles.groupImageOpen} onClick={()=>openGroup(item.id)} aria-label={`View ${item.name}`}>{item.image?<img src={item.image} alt="" loading="lazy"/>:<Users size={40}/>}</button><span className={styles.groupTypePill}>{categoryOf(item.category)}</span><button className={styles.groupImageJoin} disabled={joined.includes(item.id)} aria-label={`${joined.includes(item.id)?"Joined":"Join"} ${item.name}`} onClick={()=>{setJoined(ids=>[...ids,item.id]);setGroups(items=>items.map(g=>g.id===item.id?{...g,members:[...g.members,p.profile.name]}:g));}}>{joined.includes(item.id)?"Joined":"Join"}</button></div><button className={styles.groupListCopyButton} onClick={()=>openGroup(item.id)}><span className={styles.exploreGroupCopy}><strong>{item.name}</strong><span>{item.location || "Location not added"}</span><span>{item.description}</span></span></button></article>)}</div>
    </> : selected === "create" ? <>
      {back}<h1 className={styles.pageTitle}>Start a group</h1><p className={styles.sectionIntro}>Give your people a place to make plans.</p>
      <form className={styles.groupForm} onSubmit={event => { event.preventDefault(); if (!name.trim()) return; const id = `group-${Date.now()}`; setGroups(items => [...items, { id, banner:null, location:groupLocation.trim(), name: name.trim(), category: "Group fitness", description: description.trim() || "A new place to make plans together.", image: "", members: [p.profile.name], classIndexes: [] }]); setJoined(ids => [...ids, id]); setName(""); setDescription(""); setSelected(id); }}>
        <label>Group name<Input required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Your group’s name"/></label>
        <label>Location<Input required value={groupLocation} onChange={event=>setGroupLocation(event.target.value)} placeholder="City or neighborhood"/></label>
        <label>About your group<Input maxLength={240} value={description} onChange={event => setDescription(event.target.value)} placeholder="What brings you together?"/></label>
        <Button type="submit">Create group</Button><p className={styles.sectionIntro}>Preview only. Changes last while you’re on this page.</p>
      </form>
    </> : group && groupView!=="schedule" ? <>
      <button className={styles.backButton} onClick={()=>setGroupView("schedule")}><ArrowLeft size={19}/>Back to {group.name}</button>
      <h1 className={styles.pageTitle}>{groupView==="members"?"Members":"Updates"}</h1>
      <p className={styles.sectionIntro}>{group.name}</p>
      {groupView==="members" ? <div className={styles.stack}>{group.members.map((member,index)=><div className={styles.groupMemberRow} key={member}><Face initials={member.split(" ").map(part=>part[0]).join("")} color={["#D8C6B4","#AFCFEC","#C8C3DB"][index%3]} size={44}/><strong>{member}</strong></div>)}</div> : <GroupSampleUpdates live={!!p.live} running={categoryOf(group.category)==="Run club"}/>}
    </> : group ? <>
      <ProfileHero type="Group" name={group.name} id={group.id} banner={group.banner || (!p.live?group.image:null)} photo={group.image} category={categoryOf(group.category)} onBack={()=>setSelected(null)}/>
      <h1 className={styles.pageTitle}>{group.name}</h1><p className={styles.sectionIntro}>{group.description}</p>
      <div className={styles.groupJoinFooter}><button className={styles.groupMemberCount} onClick={()=>setGroupView("members")}><span className={styles.groupAvatarStack}>{group.members.slice(0,3).map((member,index)=><Face key={member} initials={member.split(" ").map(part=>part[0]).join("")} color={["#D8C6B4","#AFCFEC","#C8C3DB"][index%3]} size={24}/>)}</span><strong>{group.members.length} members</strong><ChevronRight size={14}/></button><button className={styles.groupJoinButton} disabled={joined.includes(group.id)} onClick={()=>{setJoined(ids=>[...ids,group.id]);setGroups(items=>items.map(item=>item.id===group.id?{...item,members:[...item.members,p.profile.name]}:item));}}>{joined.includes(group.id)?"Joined":"Join"}</button></div>
      <div className={styles.groupFooterSpace}>

      <button className={styles.groupUpdatesLink} onClick={()=>{setGroupView("updates");setSeenUpdates(ids=>[...ids,group.id]);}}><strong>Updates</strong>{!p.live&&!seenUpdates.includes(group.id)&&<Badge aria-label="2 new updates">2</Badge>}<ChevronRight size={18}/></button>
      <SectionTitle>Upcoming classes</SectionTitle>
      {group.classIndexes.length ? group.classIndexes.map(index => <section className={styles.daySection} key={index}><h3 className={styles.groupDateTitle}>{groupClasses[index].day}</h3><ClassCard item={groupClasses[index]}/></section>) : <p className={styles.sectionIntro}>{p.live ? "Group class plans aren’t connected in this preview yet." : "No classes planned yet. Check back for the next group plan."}</p>}
      </div>
    </> : <>{back}<p className={styles.sectionIntro}>Group unavailable.</p>    </>}
  </div>;
}

function YouScreen({ dark, onDarkChange }: { dark: boolean; onDarkChange: (value: boolean) => void }) {
  const p=usePrototype();
  const sheet = useRef<HTMLDialogElement>(null);
  const [qr, setQr] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
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
  return <div className={styles.youPage}>
    <header className={styles.profileHeader}>
      <Face initials={p.profile.name.split(" ").map(part=>part[0]).join("").slice(0,2)} color="#C8C3DB" photo={p.profile.photo} size={80}/>
      <h1 className={styles.pageTitle}>{p.profile.name}</h1>
      <div className={styles.profileActions}>
        <Button data-variant="outline" variant="outline" onClick={openShare} aria-haspopup="dialog">@{p.profile.handle}<ChevronDown size={16}/></Button>
        <Button data-variant="outline" variant="outline" onClick={()=>p.open({kind:"edit-profile"})}>Edit profile</Button>
      </div>
      <p>{p.profile.bio} · {p.profile.location}</p>
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
      {[{name:"My classes",initials:"ML",detail:"Classes, shifts, and saved plans",photo:p.profile.photo},...(p.live ? p.live.managed : [{name:"Ironbound Performance Athletics",initials:"IP",detail:"Studio calendar · You’re an admin",photo:null},{name:"Gals who like to move",initials:"GM",detail:"Group calendar · 4 members",photo:null}])].map(calendar=><button key={calendar.name} className={styles.cardLink} onClick={()=>p.open({kind:"manage",name:calendar.name})}><Card className={styles.simpleCard}><CardContent className={styles.settingsRow}><span className={styles.settingsIcon}><Face initials={calendar.initials} photo={calendar.photo} color="#C8C3DB" size={40}/></span><div><strong>{calendar.name}</strong><span>{calendar.detail}</span></div><ChevronRight size={18}/></CardContent></Card></button>)}
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
      ] },
      { title: "Admin", rows: [
        { icon: ShieldUser, title: "Admin dashboard", detail: "Manage people, studios, and event registration access" },
      ] },
    ].map((section) => <section key={section.title}>
      <SectionTitle>{section.title}</SectionTitle>
      <div className={styles.stack}>{section.rows.map(({ icon: Icon, title, detail }) =>
        <button key={title} className={styles.cardLink} onClick={()=>p.open(title==="Membership"?{kind:"membership"}:{kind:"settings",name:title})}><Card className={styles.simpleCard}><CardContent className={styles.settingsRow}>
          {Icon && <span className={styles.settingsIcon}><Icon size={22}/></span>}
          <div><strong>{title}</strong><span>{detail}</span></div>
          <ChevronRight size={18}/>
        </CardContent></Card></button>
      )}</div>
    </section>)}
    <section><SectionTitle>Appearance</SectionTitle><div className={styles.settingsRow}><span className={styles.settingsIcon}><Moon size={22}/></span><div><strong>Dark mode</strong><span>Use a darker appearance across the app</span></div><button type="button" role="switch" aria-label="Dark mode" aria-checked={dark} className={styles.themeSwitch} onClick={() => onDarkChange(!dark)}><span/></button></div></section>
    <form action={logout} onSubmit={clearClientMemory} className={styles.logoutForm}><Button type="submit" data-variant="outline" variant="outline"><LogOut size={19}/>Log out</Button></form>
  </div>;
}

function PreviewShell() {
  const p=usePrototype();
  const detail=p.stack.at(-1);
  const mainRef=useRef<HTMLElement>(null);
  const replayBack=useRef(false);
  const goingBack=useRef(false);
  const motionBusy=useRef(false);
  const animateEntry=()=>{if(goingBack.current){goingBack.current=false;return;}if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;mainRef.current?.animate([{transform:"translateX(100%)"},{transform:"translateX(0)"}],{duration:240,easing:"cubic-bezier(.2,.8,.2,1)"});};
  const captureBack=(event:React.MouseEvent<HTMLElement>)=>{
    const button=(event.target as HTMLElement).closest("button");
    if(!button||!/^back(?:\s|$)/i.test(button.getAttribute("aria-label")||button.textContent?.trim()||""))return;
    if(replayBack.current){replayBack.current=false;return;}
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    event.preventDefault();event.stopPropagation();if(motionBusy.current)return;
    motionBusy.current=true;goingBack.current=true;
    const animation=mainRef.current?.animate([{transform:"translateX(0)"},{transform:"translateX(100%)"}],{duration:200,easing:"ease-in",fill:"forwards"});
    void (animation?.finished||Promise.resolve()).then(()=>{replayBack.current=true;button.click();requestAnimationFrame(()=>{animation?.cancel();motionBusy.current=false;});}).catch(()=>{motionBusy.current=false;});
  };

  const [screen,setScreen]=useState<Screen>("calendar");
  const [sharing, setSharing] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => { try { setDark(localStorage.getItem("fittlist-preview-dark") === "true"); } catch {} }, []);
  const changeDark = (value: boolean) => { setDark(value); try { localStorage.setItem("fittlist-preview-dark", String(value)); } catch {} };

  const [explorePage,setExplorePage]=useState<ExplorePage | null>(null);
  const [selectedGroup,setSelectedGroup]=useState<string|null>(null);
  useEffect(()=>{const params=new URLSearchParams(window.location.search);if(params.get("detail")==="group"&&params.get("name")){setScreen("groups");setSelectedGroup(params.get("name"));}},[]);
  const takeover=!!detail || sharing || !!explorePage || !!selectedGroup;
  useEffect(()=>{mainRef.current?.scrollTo({top:0});if(takeover)animateEntry();else goingBack.current=false;},[detail,screen,explorePage,sharing,selectedGroup]);
  useEffect(()=>{const enter=()=>animateEntry();window.addEventListener("preview-subpage",enter);return()=>window.removeEventListener("preview-subpage",enter);},[]);
  return <div className={`${styles.preview} ${styles.apple} ${dark ? styles.dark : ""}`}><div className={styles.notice}>{p.live ? "Live account data · edits stay local" : "Apple-inspired · Delight · sample content"}</div><div className={styles.phone}>{p.saveNotice && <div className={styles.saveNotice} role="status"><span>{p.saveNotice}</span><button aria-label="Dismiss schedule notice" onClick={()=>p.setSaveNotice("")}><X size={18}/></button></div>}
    <div className={styles.dataBanner} role="status">{p.dataStatus==="loading"?"Loading your account…":p.live?"Live data · changes stay in this preview":p.dataStatus==="error"?"Couldn’t load account data. Showing samples.":<>Sample data · <Link href="/?join=login&next=/ui-preview">Sign in</Link> to load your account.</>}{p.dataStatus!=="loading" && <button onClick={()=>void p.reloadData()}>{p.live?"Refresh":"Retry"}</button>}</div>
    <main ref={mainRef} onClickCapture={captureBack} className={`${styles.content} ${takeover ? styles.profileTakeover : ""} ${screen === "calendar" && !sharing && !detail ? styles.calendarContent : ""}`} aria-label={screens.find(({ id }) => id === screen)?.label}>{detail && <DetailScreens key={`${p.stack.length}-${detail.kind}-${detail.name}`} route={detail}/>}<div hidden={!!detail}>{sharing ? <SharePreview onBack={() => setSharing(false)}/> : screen==="calendar"?<CalendarScreen onShare={() => setSharing(true)}/>:screen==="explore"?<ExploreScreen key={explorePage ?? "home"} page={explorePage} onNavigate={setExplorePage} onGroups={id=>{setSelectedGroup(id || null);setScreen("groups");}}/>:screen==="groups"?<GroupsScreen selected={selectedGroup} setSelected={setSelectedGroup}/>:<YouScreen dark={dark} onDarkChange={changeDark}/>}</div></main>
    {!takeover && <nav className={styles.dock} aria-label="Preview screens">{screens.map(({id,label,icon:Icon})=><button key={id} type="button" aria-current={screen===id?"page":undefined} onClick={()=>{setScreen(id);setExplorePage(null);setSharing(false);p.reset();}}><Icon size={21} strokeWidth={screen===id?2.4:1.9}/><span>{label}</span></button>)}</nav>}
  </div></div>;
}

export default function UiPreview() { return <PrototypeProvider><PreviewShell/></PrototypeProvider>; }
