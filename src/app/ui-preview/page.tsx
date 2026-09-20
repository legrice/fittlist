"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, Bell, CalendarDays, ChevronDown, Copy, X, ChevronRight, Clock, GlobeLock, LockKeyhole, Map as MapIcon, MapPin, Plus, Search, Share2, ShieldUser, UserRound, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calendarActivitySummary } from "@/lib/calendar-summary";
import StudioMap, { type MapStudio } from "./studio-map";
import styles from "./preview.module.css";

type Screen = "calendar" | "explore" | "groups" | "updates" | "you";

const screens: { id: Screen; label: string; icon: typeof CalendarDays }[] = [
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "explore", label: "Explore", icon: Search },
  { id: "groups", label: "Groups", icon: Users },
  { id: "updates", label: "Updates", icon: Bell },
  { id: "you", label: "You", icon: UserRound },
];

const classes = [
  { day: "Today · Sep 19", time: "8:00 AM", name: "Asana Lab", place: "Asana Soul Practice", coach: "Erin Clyne", duration: "60 min", color: "#D8C6B4" },
  { day: "Tomorrow · Sep 20", time: "10:30 AM", name: "Sculpt", place: "Jane DO Jersey City", coach: "Freddie Morgan", duration: "50 min", color: "#AFCFEC" },
  { day: "Mon · Sep 21", time: "6:00 PM", name: "Guns, Buns, and Lungs", place: "Ironbound Performance Athletics", coach: "Matt LeGrice", duration: "60 min", color: "#C8C3DB" },
];

function Face({ initials, color, size = 36 }: { initials: string; color: string; size?: number }) {
  return <Avatar style={{ width: size, height: size, background: color }}><AvatarFallback style={{ background: color, color: "var(--preview-on-soft)", fontWeight: 600 }}>{initials}</AvatarFallback></Avatar>;
}

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return <div className={styles.sectionTitle}><h2>{children}</h2>{aside}</div>;
}

function ClassCard({ item }: { item: typeof classes[number] }) {
  return <Card className={styles.classCard}>
    <CardContent className={styles.classCardBody}>
      <div className={styles.classAttribution}><Face initials={item.coach.split(" ").map((part) => part[0]).join("")} color={item.color} size={28}/><span>{item.coach}</span></div>
      <div className={styles.classDetails}>
        <div className={styles.classMeta}><strong>{item.time}</strong><span>{item.duration}</span></div>
        <div className={styles.classCopy}><strong>{item.name}</strong><span>{item.place}</span></div>
      </div>
    </CardContent>
  </Card>;
}

function CalendarScreen() {
  const [view, setView] = useState("you");
  const [selectedPerson, setSelectedPerson] = useState("All");
  const people = [{ name: "Erin", initials: "EC", color: "#D8C6B4" }, { name: "Freddie", initials: "FM", color: "#AFCFEC" }, { name: "Matt", initials: "ML", color: "#C8C3DB" }];
  return <>
    <Tabs value={view} onValueChange={value => setView(String(value))}>
      <div className={styles.calendarHero}>
        <TabsList className={`${styles.fullTabs} ${styles.calendarModeTabs}`} aria-label="Calendar view"><TabsTrigger value="you">You</TabsTrigger><TabsTrigger value="following">Following</TabsTrigger></TabsList>
        {view === "you" ? <div className={`${styles.calendarSummary} ${styles.yourCalendarSummary}`}><strong>{calendarActivitySummary({ teaching: 1, attending: 2, personal: 0 })}</strong><div className={styles.heroActions}><Link href="/share" className={styles.shareWeekButton} aria-label="Share your week"><Share2 size={18} aria-hidden="true"/>Share</Link></div></div> : <div className={styles.peopleRail} aria-label="Filter by person"><button type="button" className={styles.personFilter} aria-pressed={selectedPerson === "All"} onClick={() => setSelectedPerson("All")}><span className={styles.personRing}><span className={styles.allFace}><Users size={22}/></span></span><small>All</small></button>{people.map((person) => <button key={person.name} type="button" className={styles.personFilter} aria-pressed={selectedPerson === person.name} onClick={() => setSelectedPerson(person.name)}><span className={styles.personRing}><Face initials={person.initials} color={person.color} size={56}/></span><small>{person.name}</small></button>)}</div>}
      </div>
      <TabsContent value="you" className={styles.calendarYouPanel}>{classes.map((item) => <section className={styles.daySection} key={item.name}><h3>{item.day}</h3><ClassCard item={item}/></section>)}<Link href="/calendar?add=1" className={styles.addFab} aria-label="Add a class"><Plus size={28}/></Link></TabsContent>
      <TabsContent value="following"><SectionTitle aside={<Badge variant="secondary">{selectedPerson === "All" ? "3 classes" : "1 class"}</Badge>}>{selectedPerson === "All" ? "From people you follow" : `From ${selectedPerson}`}</SectionTitle>{classes.filter((item) => selectedPerson === "All" || item.coach.startsWith(selectedPerson)).map((item) => <section className={styles.daySection} key={item.name}><h3>{item.day}</h3><ClassCard item={item}/></section>)}</TabsContent>
    </Tabs>
  </>;
}

type ExplorePage = "people" | "studios";
const explorePeople = [
  { name: "Erin Clyne", title: "Yoga Teacher + Clinical Sports Massage", initials: "EC", color: "#D8C6B4", specialty: "Yoga" },
  { name: "Freddie Morgan", title: "Strength & mobility coach", initials: "FM", color: "#AFCFEC", specialty: "Strength" },
  { name: "Matt LeGrice", title: "Strength & mobility coach", initials: "ML", color: "#C8C3DB", specialty: "Strength" },
];
const exploreStudios: MapStudio[] = [
  { name: "Asana Soul Practice", type: "Yoga", location: "Jersey City, NJ", coordinates: [40.722, -74.044] },
  { name: "Jane DO Jersey City", type: "Sculpt", location: "Jersey City, NJ", coordinates: [40.725, -74.047] },
  { name: "Ironbound Performance Athletics", type: "Strength", location: "Jersey City, NJ", coordinates: [40.731, -74.057] },
];
function ExplorePerson({ person }: { person: typeof explorePeople[number] }) {
  return <Card className={styles.personCard}><CardContent className={styles.personCardBody}><Face initials={person.initials} color={person.color} size={48}/><div><strong>{person.name}</strong><span>{person.title}</span><small><MapPin size={13}/> Jersey City, NJ</small></div><Button data-variant="outline" variant="outline" size="sm">Follow</Button></CardContent></Card>;
}
function ExploreStudio({ place }: { place: typeof exploreStudios[number] }) {
  return <Card className={styles.simpleCard}><CardContent className={styles.menuRow}><div className={styles.discoverGroupIcon}><MapPin size={21}/></div><div><strong>{place.name}</strong><span>{place.type} · {place.location}</span></div><ChevronRight size={18}/></CardContent></Card>;
}
function ExploreScreen({ page, onNavigate }: { page: ExplorePage | null; onNavigate: (page: ExplorePage | null) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [mapView, setMapView] = useState(false);
  const matches = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const shownPeople = explorePeople.filter(person => matches(`${person.name} ${person.title}`) && (!filter || person.specialty === filter));
  const shownStudios = useMemo(() => exploreStudios.filter(place => `${place.name} ${place.type} ${place.location}`.toLowerCase().includes(query.trim().toLowerCase()) && (!filter || place.type === filter)), [query, filter]);
  const more = (target: ExplorePage) => <button className={styles.seeAll} onClick={() => onNavigate(target)} aria-label={`See all ${target}`}>See all<ChevronRight size={15}/></button>;
  if (!page) return <>
    <h1 className={styles.pageTitle}>Explore</h1>
    <div className={styles.topControls}><label className={styles.search}><Search size={19}/><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="People and studios" aria-label="Search Explore"/></label></div>
    {shownPeople.length + shownStudios.length === 0 && <p className={styles.sectionIntro}>No matches. Try another search.</p>}
    <section><SectionTitle aside={more("people")}>People to move with</SectionTitle><div className={styles.stack}>{shownPeople.slice(0,2).map(person => <ExplorePerson key={person.name} person={person}/>)}</div></section>
    <section><SectionTitle aside={more("studios")}>Studios nearby</SectionTitle><div className={styles.stack}>{shownStudios.slice(0,2).map(place => <ExploreStudio key={place.name} place={place}/>)}</div></section>
  </>;
  const title = page.charAt(0).toUpperCase() + page.slice(1);
  const options = page === "people" ? ["Yoga", "Strength"] : ["Yoga", "Sculpt", "Strength"];
  const count = page === "people" ? shownPeople.length : shownStudios.length;
  return <>
    <button className={styles.backButton} onClick={() => onNavigate(null)}><ArrowLeft size={19}/>Back to Explore</button>
    <h1 className={styles.pageTitle}>{title}</h1>
    <div className={styles.topControls}><label className={styles.search}><Search size={19}/><Input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${page}`} aria-label={`Search ${page}`}/></label></div>
    <label className={styles.categoryFilter}>{page === "people" ? "Specialty" : "Studio type"}<select value={filter} onChange={event => setFilter(event.target.value)}><option value="">All {page === "people" ? "specialties" : "types"}</option>{options.map(option => <option key={option}>{option}</option>)}</select></label>
    <SectionTitle aside={<Badge variant="secondary">{count}</Badge>}>{title} nearby</SectionTitle>
    {count === 0 && <p className={styles.sectionIntro}>No matches. Try another search or filter.</p>}
    {page === "studios" && mapView ? <StudioMap studios={shownStudios} onClose={() => setMapView(false)}/> : <div className={styles.stack}>{page === "people" ? shownPeople.map(person => <ExplorePerson key={person.name} person={person}/>) : shownStudios.map(place => <ExploreStudio key={place.name} place={place}/>)}</div>}
    {page === "studios" && !mapView && <button className={styles.mapToggle} onClick={() => setMapView(true)}><MapIcon size={19}/>Map</button>}
  </>;
}

const sampleGroups = [
  { id: "gals", name: "Gals who like to move", category: "Group fitness", description: "Find a class, make a plan, and bring your people.", image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1000&q=85", members: ["Erin Clyne", "Freddie Morgan", "Alex Lee", "Matt LeGrice"], classIndexes: [1, 2] },
  { id: "run", name: "Jersey City Run Club", category: "Running", description: "Easy miles, good company, and a reason to get outside. All paces welcome.", image: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1000&q=85", members: ["Jordan Rivera", "Sam Chen", "Taylor Brooks"], classIndexes: [] },
  { id: "sweat", name: "Sunday Sweat Crew", category: "Strength & mobility", description: "Make Sunday your day to move. Try local classes together and meet your next workout buddy.", image: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1000&q=85", members: ["Freddie Morgan", "Alex Lee", "Jamie Park"], classIndexes: [1] },
];
function GroupsScreen() {
  const [groups, setGroups] = useState(sampleGroups);
  const [joined, setJoined] = useState(["gals"]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { top.current?.closest("main")?.scrollTo({ top: 0 }); }, [selected]);
  const group = groups.find(item => item.id === selected);
  const back = <button className={styles.backButton} onClick={() => setSelected(null)}><ArrowLeft size={19}/>Back to Groups</button>;
  const ownGroups = groups.filter(item => joined.includes(item.id));
  return <div ref={top}>
    {selected === "create" ? <>
      {back}<h1 className={styles.pageTitle}>Start a group</h1><p className={styles.sectionIntro}>Give your people a place to make plans.</p>
      <form className={styles.groupForm} onSubmit={event => { event.preventDefault(); if (!name.trim()) return; const id = `group-${Date.now()}`; setGroups(items => [...items, { id, name: name.trim(), category: "Group fitness", description: description.trim() || "A new place to make plans together.", image: "", members: ["Matt LeGrice"], classIndexes: [] }]); setJoined(ids => [...ids, id]); setName(""); setDescription(""); setSelected(id); }}>
        <label>Group name<Input required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Your group’s name"/></label>
        <label>About your group<Input maxLength={240} value={description} onChange={event => setDescription(event.target.value)} placeholder="What brings you together?"/></label>
        <Button type="submit">Create group</Button><p className={styles.sectionIntro}>Preview only. Changes last while you’re on this page.</p>
      </form>
    </> : group ? <>
      {back}
      {group.image && <img className={styles.groupDetailPhoto} src={group.image} alt=""/>}
      <h1 className={styles.pageTitle}>{group.name}</h1><p className={styles.sectionIntro}>{group.description}</p>
      <div className={styles.groupDetailMeta}><span>{group.category} · Jersey City</span>{joined.includes(group.id) ? <Badge variant="secondary">Joined</Badge> : <Button onClick={() => { setJoined(ids => [...ids, group.id]); setGroups(items => items.map(item => item.id === group.id ? { ...item, members: [...item.members, "Matt LeGrice"] } : item)); }}>Join group</Button>}</div>
      <SectionTitle aside={<Badge variant="secondary">{group.members.length}</Badge>}>Who’s in the group</SectionTitle>
      <div className={styles.memberGrid}>{group.members.map((member,index) => <div key={member}><Face initials={member.split(" ").map(part => part[0]).join("")} color={["#D8C6B4", "#AFCFEC", "#C8C3DB"][index % 3]} size={44}/><span>{member}</span></div>)}</div>
      <SectionTitle>Upcoming classes</SectionTitle>
      {group.classIndexes.length ? group.classIndexes.map(index => <section className={styles.daySection} key={index}><h3>{classes[index].day}</h3><ClassCard item={classes[index]}/></section>) : <p className={styles.sectionIntro}>No classes planned yet. Check back for the next group plan.</p>}
    </> : <>
      <div className={styles.pageTitleRow}><h1 className={styles.pageTitle}>Groups</h1><button className={styles.addGroupButton} onClick={() => setSelected("create")} aria-label="Start a new group"><Plus size={24}/></button></div>
      <SectionTitle aside={<Badge variant="secondary">{ownGroups.length}</Badge>}>Your groups</SectionTitle>
      <div className={styles.stack}>{ownGroups.map(item => <button key={item.id} className={styles.ownedGroup} onClick={() => setSelected(item.id)}>
        {item.image ? <img src={item.image} alt=""/> : <span className={styles.groupPlaceholder}><Users size={28}/></span>}<span><strong>{item.name}</strong><small>{item.members.length} members</small></span><ChevronRight size={18}/>
      </button>)}</div>
      <SectionTitle>Groups to explore</SectionTitle>
      <div className={styles.exploreGroupList}>{groups.filter(item => !joined.includes(item.id)).map(item => <button key={item.id} className={styles.exploreGroupCard} onClick={() => setSelected(item.id)}>
        <img src={item.image} alt="" loading="lazy"/><span className={styles.exploreGroupCopy}><strong>{item.name}</strong><span>{item.category} · Jersey City</span><span>{item.description}</span><small><Users size={15}/>{item.members.length} members<ChevronRight size={17}/></small></span>
      </button>)}</div>
    </>}
  </div>;
}

function UpdatesScreen() {
  return <>
    <h1 className={styles.pageTitle}>Updates</h1>
    <Tabs defaultValue="notifications"><div className={styles.topControls}><TabsList className={`${styles.fullTabs} ${styles.calendarModeTabs}`}><TabsTrigger value="notifications">Notifications <Badge>2</Badge></TabsTrigger><TabsTrigger value="messages">Messages</TabsTrigger></TabsList></div>
      <TabsContent value="notifications"><SectionTitle>Today</SectionTitle><div className={styles.stack}><Card className={styles.simpleCard}><CardContent className={styles.notification}><Face initials="EC" color="#D8C6B4"/><div><strong>Erin Clyne followed you</strong><span>2 hours ago</span></div><span className={styles.unreadDot}/></CardContent></Card><Card className={styles.simpleCard}><CardContent className={styles.notification}><Face initials="FM" color="#AFCFEC"/><div><strong>Freddie added a class</strong><span>Gals who like to move · Yesterday</span></div><span className={styles.unreadDot}/></CardContent></Card></div></TabsContent>
      <TabsContent value="messages"><SectionTitle>Conversations</SectionTitle><Card className={styles.simpleCard}><CardContent className={styles.notification}><Face initials="EC" color="#D8C6B4"/><div><strong>Erin Clyne</strong><span>See you at Asana Lab!</span></div><Badge>1</Badge></CardContent></Card></TabsContent>
    </Tabs>
  </>;
}

function YouScreen() {
  const sheet = useRef<HTMLDialogElement>(null);
  const [qr, setQr] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const profileUrl = "https://fittlist.co/mattlegrice";
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
      <Face initials="ML" color="#C8C3DB" size={80}/>
      <h1 className={styles.pageTitle}>Matt LeGrice</h1>
      <div className={styles.profileActions}>
        <Button data-variant="outline" variant="outline" onClick={openShare} aria-haspopup="dialog">@mattlegrice<ChevronDown size={16}/></Button>
        <Button data-variant="outline" variant="outline">Edit profile</Button>
      </div>
      <p>Strength & mobility coach · Jersey City, NJ</p>
    </header>
    <dialog ref={sheet} className={styles.profileSheet} aria-labelledby="profile-share-title" onClick={event => { if (event.target === event.currentTarget) sheet.current?.close(); }}>
      <div className={styles.sheetBody}>
        <button className={styles.sheetClose} aria-label="Close profile sharing" onClick={() => sheet.current?.close()}><X size={22}/></button>
        <h2 id="profile-share-title">Share your profile</h2>
        <p>Scan to find @mattlegrice on FittList.</p>
        {qr ? <img className={styles.profileQr} src={qr} alt="QR code linking to Matt LeGrice’s FittList profile"/> : <p>Preparing your QR code…</p>}
        <button className={styles.copyProfile} onClick={copyLink}><Copy size={18}/>Copy profile link</button>
        <input aria-label="Profile link" value={profileUrl} readOnly onFocus={event => event.target.select()}/>
        <p className={styles.copyStatus} role="status">{copyStatus}</p>
      </div>
    </dialog>
    <SectionTitle>Your calendars</SectionTitle><div className={styles.stack}><Card className={styles.simpleCard}><CardContent className={styles.menuRow}><CalendarDays size={20}/><div><strong>Personal calendar</strong><span>Classes, shifts, and saved plans</span></div><ChevronRight size={18}/></CardContent></Card><Card className={styles.simpleCard}><CardContent className={styles.menuRow}><Users size={20}/><div><strong>Gals who like to move</strong><span>4 members</span></div><ChevronRight size={18}/></CardContent></Card></div>
    <SectionTitle>Notifications</SectionTitle><Card className={styles.simpleCard}><CardContent className={styles.menuRow}><Bell size={20}/><div><strong>Notifications</strong><span>Follows, saves, and account activity</span></div><ChevronRight size={18}/></CardContent></Card>
    {[
      { title: "Tools", rows: [
        { icon: Activity, title: "Insights", detail: "Your teaching, classes, and sharing" },
        { icon: CalendarDays, title: "Calendar & sync", detail: "Connect Google, Apple, or Outlook" },
      ] },
      { title: "Settings", rows: [
        { icon: Clock, title: "Set yourself as away", detail: "Add away dates, a profile note, and an automatic reply" },
        { icon: GlobeLock, title: "Privacy & communication", detail: "Messages, visibility, and follower approvals" },
        { icon: LockKeyhole, title: "Account & preferences", detail: "Login, notifications, and appearance" },
      ] },
      { title: "Admin", rows: [
        { icon: ShieldUser, title: "Admin dashboard", detail: "Manage people, studios, and event registration access" },
      ] },
    ].map((section) => <section key={section.title}>
      <SectionTitle>{section.title}</SectionTitle>
      <div className={styles.stack}>{section.rows.map(({ icon: Icon, title, detail }) =>
        <Card key={title} className={styles.simpleCard}><CardContent className={styles.settingsRow}>
          <span className={styles.settingsIcon}><Icon size={22}/></span>
          <div><strong>{title}</strong><span>{detail}</span></div>
          <ChevronRight size={18}/>
        </CardContent></Card>
      )}</div>
    </section>)}
  </div>;
}

export default function UiPreview() {
  const [screen,setScreen]=useState<Screen>("calendar");
  const [explorePage,setExplorePage]=useState<ExplorePage | null>(null);
  return <div className={`${styles.preview} ${styles.apple}`}><div className={styles.notice}>Apple-inspired · Delight · sample content</div><div className={styles.phone}>
    <main key={`${screen}-${explorePage ?? "home"}`} className={`${styles.content} ${screen === "calendar" ? styles.calendarContent : ""}`} aria-label={screens.find(({ id }) => id === screen)?.label}>{screen==="calendar"?<CalendarScreen/>:screen==="explore"?<ExploreScreen key={explorePage ?? "home"} page={explorePage} onNavigate={setExplorePage}/>:screen==="groups"?<GroupsScreen/>:screen==="updates"?<UpdatesScreen/>:<YouScreen/>}</main>
    <nav className={styles.dock} aria-label="Preview screens">{screens.map(({id,label,icon:Icon})=><button key={id} type="button" aria-current={screen===id?"page":undefined} onClick={()=>{setScreen(id);setExplorePage(null);}}><Icon size={21} strokeWidth={screen===id?2.4:1.9}/><span>{label}</span></button>)}</nav>
  </div></div>;
}
