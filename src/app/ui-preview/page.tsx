"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, Bell, CalendarDays, ChevronRight, Clock, GlobeLock, LockKeyhole, MapPin, Plus, Search, Settings2, ShieldUser, UserRound, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calendarActivitySummary } from "@/lib/calendar-summary";
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
  return <Avatar style={{ width: size, height: size, background: color }}><AvatarFallback style={{ background: color, color: "#192126", fontWeight: 700 }}>{initials}</AvatarFallback></Avatar>;
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

function CalendarScreen({ onExplore }: { onExplore: () => void }) {
  const [selectedPerson, setSelectedPerson] = useState("All");
  const people = [{ name: "Erin", initials: "EC", color: "#D8C6B4" }, { name: "Freddie", initials: "FM", color: "#AFCFEC" }, { name: "Matt", initials: "ML", color: "#C8C3DB" }];
  return <>
    <Tabs defaultValue="you"><div className={styles.topControls}><TabsList className={`${styles.fullTabs} ${styles.calendarModeTabs}`} aria-label="Calendar view"><TabsTrigger value="you">You</TabsTrigger><TabsTrigger value="following">Following</TabsTrigger></TabsList></div>
      <TabsContent value="you"><div className={`${styles.calendarSummary} ${styles.yourCalendarSummary}`}><strong>{calendarActivitySummary({ teaching: 1, attending: 2, personal: 0 })}</strong><div className={styles.heroActions}><Link href="/share" className={styles.shareWeekButton} aria-label="Share your week">Share</Link><Link href="/calendar?add=1" className={`${styles.shareWeekButton} ${styles.secondaryHeroButton}`} aria-label="Add to your week">Add</Link></div></div>{classes.map((item) => <section className={styles.daySection} key={item.name}><h3>{item.day}</h3><ClassCard item={item}/></section>)}</TabsContent>
      <TabsContent value="following"><div className={`${styles.calendarSummary} ${styles.followingSummary}`}><strong>You’re following 3 people.</strong><button type="button" className={styles.discoverMoreButton} onClick={onExplore}>Explore More</button></div><div className={styles.peopleRail} aria-label="Filter by person"><button type="button" className={styles.personFilter} aria-pressed={selectedPerson === "All"} onClick={() => setSelectedPerson("All")}><span className={styles.personRing}><span className={styles.allFace}><Users size={22}/></span></span><small>All</small></button>{people.map((person) => <button key={person.name} type="button" className={styles.personFilter} aria-pressed={selectedPerson === person.name} onClick={() => setSelectedPerson(person.name)}><span className={styles.personRing}><Face initials={person.initials} color={person.color} size={56}/></span><small>{person.name}</small></button>)}</div><SectionTitle aside={<Badge variant="secondary">{selectedPerson === "All" ? "3 classes" : "1 class"}</Badge>}>{selectedPerson === "All" ? "From people you follow" : `From ${selectedPerson}`}</SectionTitle>{classes.filter((item) => selectedPerson === "All" || item.coach.startsWith(selectedPerson)).map((item) => <section className={styles.daySection} key={item.name}><h3>{item.day}</h3><ClassCard item={item}/></section>)}</TabsContent>
    </Tabs>
  </>;
}

function ExploreScreen() {
  return <>
    <div className={styles.topControls}><label className={styles.search}><Search size={19}/><Input placeholder="People, places, classes" aria-label="Search" /></label><Button variant="outline" size="icon-lg" aria-label="Filters"><Settings2 size={19}/></Button></div>
    <section><SectionTitle>Find your next class</SectionTitle><p className={styles.sectionIntro}>A few ways to move near Jersey City.</p>
      {classes.slice(0,2).map((item)=><section className={styles.daySection} key={item.name}><h3>{item.day}</h3><ClassCard item={item}/></section>)}
    </section>
    <section><SectionTitle>People to move with</SectionTitle><div className={styles.stack}>
      {[{name:"Erin Clyne", title:"Yoga Teacher + Clinical Sports Massage", initials:"EC", color:"#D8C6B4"},{name:"Freddie Morgan",title:"Strength & mobility coach",initials:"FM",color:"#AFCFEC"},{name:"Matt LeGrice",title:"Strength & mobility coach",initials:"ML",color:"#C8C3DB"}].map(person=><Card key={person.name} className={styles.personCard}><CardContent className={styles.personCardBody}><Face initials={person.initials} color={person.color} size={48}/><div><strong>{person.name}</strong><span>{person.title}</span><small><MapPin size={13}/> Jersey City, NJ</small></div><Button variant="outline" size="sm">Follow</Button></CardContent></Card>)}
    </div></section>
    <section><SectionTitle>Places nearby</SectionTitle><Card className={styles.simpleCard}><CardContent className={styles.menuRow}><div className={styles.discoverGroupIcon}><MapPin size={21}/></div><div><strong>Ironbound Performance Athletics</strong><span>Strength training · Jersey City</span></div><ChevronRight size={18}/></CardContent></Card></section>
  </>;
}

function GroupsScreen() {
  return <>
    <SectionTitle aside={<Button variant="outline" size="sm"><Plus size={16}/> Create</Button>}>Your groups</SectionTitle>
    <Card className={styles.groupHero}><CardHeader><div className={styles.groupSymbol}><Users size={28}/></div><Badge variant="secondary">Joined</Badge><CardTitle>Gals who like to move</CardTitle><p>Find a class, make a plan, and bring your people.</p></CardHeader><CardContent className={styles.groupHeroFooter}><div className={styles.faceStack}><Face initials="EC" color="#D8C6B4"/><Face initials="FM" color="#AFCFEC"/><Face initials="AL" color="#C8C3DB"/></div><span>4 members</span><ChevronRight size={18}/></CardContent></Card>
    <section><SectionTitle>Coming up together</SectionTitle>
      {classes.slice(1).map((item)=><section className={styles.daySection} key={item.name}><h3>{item.day}</h3><ClassCard item={item}/></section>)}
    </section>
    <section><SectionTitle>Latest from your group</SectionTitle><Card className={styles.simpleCard}><CardHeader><div className={styles.inlinePerson}><Face initials="FM" color="#AFCFEC"/><div><strong>Freddie Morgan</strong><span>Added Sculpt to the group calendar</span></div></div></CardHeader><CardContent><p>Anyone joining on Sunday?</p><Button variant="outline" size="sm">Reply</Button></CardContent></Card></section>
    <section className={styles.discoverySection}><SectionTitle>Groups near you</SectionTitle><p className={styles.sectionIntro}>Make your next class a group plan.</p><div className={styles.stack}>
      <Card className={styles.simpleCard}><CardContent className={styles.menuRow}><div className={styles.discoverGroupIcon}><Users size={21}/></div><div><strong>Jersey City Run Club</strong><span>Running · 28 members</span></div><ChevronRight size={18}/></CardContent></Card>
      <Card className={styles.simpleCard}><CardContent className={styles.menuRow}><div className={styles.discoverGroupIcon}><Users size={21}/></div><div><strong>Sunday Sweat Crew</strong><span>Group fitness · 16 members</span></div><ChevronRight size={18}/></CardContent></Card>
    </div></section>
  </>;
}

function UpdatesScreen() {
  return <>
    <Tabs defaultValue="notifications"><div className={styles.topControls}><TabsList className={`${styles.fullTabs} ${styles.calendarModeTabs}`}><TabsTrigger value="notifications">Notifications <Badge>2</Badge></TabsTrigger><TabsTrigger value="messages">Messages</TabsTrigger></TabsList></div>
      <TabsContent value="notifications"><SectionTitle>Today</SectionTitle><div className={styles.stack}><Card className={styles.simpleCard}><CardContent className={styles.notification}><Face initials="EC" color="#D8C6B4"/><div><strong>Erin Clyne followed you</strong><span>2 hours ago</span></div><span className={styles.unreadDot}/></CardContent></Card><Card className={styles.simpleCard}><CardContent className={styles.notification}><Face initials="FM" color="#AFCFEC"/><div><strong>Freddie added a class</strong><span>Gals who like to move · Yesterday</span></div><span className={styles.unreadDot}/></CardContent></Card></div></TabsContent>
      <TabsContent value="messages"><SectionTitle>Conversations</SectionTitle><Card className={styles.simpleCard}><CardContent className={styles.notification}><Face initials="EC" color="#D8C6B4"/><div><strong>Erin Clyne</strong><span>See you at Asana Lab!</span></div><Badge>1</Badge></CardContent></Card></TabsContent>
    </Tabs>
  </>;
}

function YouScreen() {
  return <>
    <Card className={styles.profileCard}><CardContent><Face initials="ML" color="#C8C3DB" size={68}/><div><h2>Matt LeGrice</h2><span>@mattlegrice</span><p>Strength & mobility coach · Jersey City, NJ</p></div><Button variant="outline">Edit profile</Button></CardContent></Card>
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
  </>;
}

export default function UiPreview() {
  const [screen,setScreen]=useState<Screen>("calendar");
  return <div className={styles.preview}><div className={styles.notice}>shadcn/ui mobile concept · sample content</div><div className={styles.phone}>
    <main key={screen} className={styles.content}><h1 className={styles.pageTitle}>{screens.find(({ id }) => id === screen)?.label}</h1>{screen==="calendar"?<CalendarScreen onExplore={() => setScreen("explore")}/>:screen==="explore"?<ExploreScreen/>:screen==="groups"?<GroupsScreen/>:screen==="updates"?<UpdatesScreen/>:<YouScreen/>}</main>
    <nav className={styles.dock} aria-label="Preview screens">{screens.map(({id,label,icon:Icon})=><button key={id} type="button" aria-current={screen===id?"page":undefined} onClick={()=>setScreen(id)}><Icon size={21} strokeWidth={screen===id?2.4:1.9}/><span>{label}</span></button>)}</nav>
  </div></div>;
}
