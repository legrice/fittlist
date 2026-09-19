"use client";

import { useState } from "react";
import { Bell, CalendarDays, ChevronRight, Compass, Mail, MapPin, Plus, Search, Settings2, UserRound, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calendarActivitySummary } from "@/lib/calendar-summary";
import styles from "./preview.module.css";

type Screen = "calendar" | "discover" | "groups" | "inbox" | "you";

const screens: { id: Screen; label: string; icon: typeof CalendarDays }[] = [
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "discover", label: "Discover", icon: Compass },
  { id: "groups", label: "Groups", icon: Users },
  { id: "inbox", label: "Inbox", icon: Mail },
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

function ClassCard({ item, profile = false }: { item: typeof classes[number]; profile?: boolean }) {
  return <Card className={styles.classCard}>
    <CardContent className={profile ? styles.profileClassBody : styles.classCardBody}>
      <div className={styles.classAttribution}><Face initials={item.coach.split(" ").map((part) => part[0]).join("")} color={item.color} size={28}/><span>{item.coach}</span></div>
      {profile ? <div className={styles.profileClassDetails}>
        <div className={styles.profileClassMeta}><strong>{item.time}</strong><span>{item.duration}</span></div>
        <div className={styles.profileClassCopy}><strong>{item.name}</strong><span>{item.place}</span></div>
      </div> : <div className={styles.classDetails}>
        <div><strong>{item.name}</strong><strong>{item.time}</strong></div>
        <div><span>{item.place}</span><span>{item.duration}</span></div>
      </div>}
    </CardContent>
  </Card>;
}

function CalendarScreen() {
  const [selectedPerson, setSelectedPerson] = useState("All");
  const people = [{ name: "Erin", initials: "EC", color: "#D8C6B4" }, { name: "Freddie", initials: "FM", color: "#AFCFEC" }, { name: "Matt", initials: "ML", color: "#C8C3DB" }];
  return <>
    <Tabs defaultValue="you"><div className={styles.topControls}><TabsList className={`${styles.fullTabs} ${styles.calendarModeTabs}`} aria-label="Calendar view"><TabsTrigger value="you">You</TabsTrigger><TabsTrigger value="explore">Explore</TabsTrigger></TabsList><Button size="icon-lg" aria-label="Add to calendar"><Plus size={20}/></Button></div>
      <TabsContent value="you"><div className={styles.calendarSummary}><strong>{calendarActivitySummary({ teaching: 1, attending: 2, personal: 0 })}</strong></div><SectionTitle aside={<Badge variant="secondary">3 plans</Badge>}>Coming up</SectionTitle>{classes.map((item) => <section className={styles.daySection} key={item.name}><h3>{item.day}</h3><ClassCard item={item}/></section>)}</TabsContent>
      <TabsContent value="explore"><div className={styles.calendarSummary}><strong>You’re following 3 people.</strong></div><div className={styles.peopleRail} aria-label="Filter by person"><button type="button" className={styles.personFilter} aria-pressed={selectedPerson === "All"} onClick={() => setSelectedPerson("All")}><span className={styles.personRing}><span className={styles.allFace}><Users size={22}/></span></span><small>All</small></button>{people.map((person) => <button key={person.name} type="button" className={styles.personFilter} aria-pressed={selectedPerson === person.name} onClick={() => setSelectedPerson(person.name)}><span className={styles.personRing}><Face initials={person.initials} color={person.color} size={56}/></span><small>{person.name}</small></button>)}</div><SectionTitle aside={<Badge variant="secondary">{selectedPerson === "All" ? "3 classes" : "1 class"}</Badge>}>{selectedPerson === "All" ? "From people you follow" : `From ${selectedPerson}`}</SectionTitle>{classes.filter((item) => selectedPerson === "All" || item.coach.startsWith(selectedPerson)).map((item) => <section className={styles.daySection} key={item.name}><h3>{item.day}</h3><ClassCard item={item}/></section>)}</TabsContent>
    </Tabs>
  </>;
}

function DiscoverScreen() {
  return <>
    <div className={styles.topControls}><label className={styles.search}><Search size={19}/><Input placeholder="People, places, classes" aria-label="Search" /></label><Button variant="outline" size="icon-lg" aria-label="Filters"><Settings2 size={19}/></Button></div>
    <Tabs defaultValue="people"><TabsList className={styles.fullTabs}><TabsTrigger value="people">People</TabsTrigger><TabsTrigger value="studios">Studios</TabsTrigger><TabsTrigger value="classes">Classes</TabsTrigger></TabsList>
      <TabsContent value="people"><SectionTitle>People near you</SectionTitle><div className={styles.stack}>
        {[{name:"Erin Clyne", title:"Yoga Teacher + Clinical Sports Massage", initials:"EC", color:"#D8C6B4"},{name:"Freddie Morgan",title:"Strength & mobility coach",initials:"FM",color:"#AFCFEC"},{name:"Matt LeGrice",title:"Strength & mobility coach",initials:"ML",color:"#C8C3DB"}].map(person=><Card key={person.name} className={styles.personCard}><CardContent className={styles.personCardBody}><Face initials={person.initials} color={person.color} size={48}/><div><strong>{person.name}</strong><span>{person.title}</span><small><MapPin size={13}/> Jersey City, NJ</small></div><Button variant="outline" size="sm">Follow</Button></CardContent></Card>)}</div></TabsContent>
      <TabsContent value="studios"><SectionTitle>Studios nearby</SectionTitle><Card className={styles.simpleCard}><CardContent><strong>Ironbound Performance Athletics</strong><p>Strength training · Jersey City</p></CardContent></Card></TabsContent>
      <TabsContent value="classes"><SectionTitle>Classes nearby</SectionTitle>{classes.slice(0,2).map((item)=><div className={styles.daySection} key={item.name}><ClassCard item={item}/></div>)}</TabsContent>
    </Tabs>
  </>;
}

function GroupsScreen() {
  return <>
    <Tabs defaultValue="yours"><div className={styles.topControls}><TabsList className={`${styles.fullTabs} ${styles.calendarModeTabs}`} aria-label="Groups view"><TabsTrigger value="yours">Your groups</TabsTrigger><TabsTrigger value="discover">Discover groups</TabsTrigger></TabsList><Button size="icon-lg" aria-label="Create a group"><Plus size={20}/></Button></div>
      <TabsContent value="yours"><Card className={styles.groupHero}><CardHeader><div className={styles.groupSymbol}><Users size={28}/></div><Badge variant="secondary">Joined</Badge><CardTitle>Gals who like to move</CardTitle><p>Find a class, make a plan, and bring your people.</p></CardHeader><CardContent className={styles.groupHeroFooter}><div className={styles.faceStack}><Face initials="EC" color="#D8C6B4"/><Face initials="FM" color="#AFCFEC"/><Face initials="AL" color="#C8C3DB"/></div><span>4 members</span><ChevronRight size={18}/></CardContent></Card>
        <Tabs defaultValue="schedule"><TabsList className={styles.fullTabs}><TabsTrigger value="schedule">Schedule</TabsTrigger><TabsTrigger value="updates">Updates</TabsTrigger></TabsList>
          <TabsContent value="schedule"><SectionTitle>Group schedule</SectionTitle>{classes.slice(1).map((item)=><section className={styles.daySection} key={item.name}><h3>{item.day}</h3><ClassCard item={item} profile/></section>)}</TabsContent>
          <TabsContent value="updates"><SectionTitle>Latest updates</SectionTitle><Card className={styles.simpleCard}><CardHeader><div className={styles.inlinePerson}><Face initials="FM" color="#AFCFEC"/><div><strong>Freddie Morgan</strong><span>Added Sculpt to the group calendar</span></div></div></CardHeader><CardContent><p>Anyone joining on Sunday?</p><Button variant="outline" size="sm">Reply</Button></CardContent></Card></TabsContent>
        </Tabs>
      </TabsContent>
      <TabsContent value="discover"><SectionTitle>Groups near you</SectionTitle><div className={styles.stack}>
        <Card className={styles.simpleCard}><CardContent className={styles.menuRow}><div className={styles.discoverGroupIcon}><Users size={21}/></div><div><strong>Jersey City Run Club</strong><span>Running · 28 members</span></div><ChevronRight size={18}/></CardContent></Card>
        <Card className={styles.simpleCard}><CardContent className={styles.menuRow}><div className={styles.discoverGroupIcon}><Users size={21}/></div><div><strong>Sunday Sweat Crew</strong><span>Group fitness · 16 members</span></div><ChevronRight size={18}/></CardContent></Card>
      </div></TabsContent>
    </Tabs>
  </>;
}

function InboxScreen() {
  return <>
    <Tabs defaultValue="notifications"><div className={styles.topControls}><TabsList className={`${styles.fullTabs} ${styles.calendarModeTabs}`}><TabsTrigger value="notifications">Notifications <Badge>2</Badge></TabsTrigger><TabsTrigger value="messages">Messages</TabsTrigger></TabsList><Button variant="outline" size="icon-lg" aria-label="New message"><Plus size={20}/></Button></div>
      <TabsContent value="notifications"><SectionTitle>Today</SectionTitle><div className={styles.stack}><Card className={styles.simpleCard}><CardContent className={styles.notification}><Face initials="EC" color="#D8C6B4"/><div><strong>Erin Clyne followed you</strong><span>2 hours ago</span></div><span className={styles.unreadDot}/></CardContent></Card><Card className={styles.simpleCard}><CardContent className={styles.notification}><Face initials="FM" color="#AFCFEC"/><div><strong>Freddie added a class</strong><span>Gals who like to move · Yesterday</span></div><span className={styles.unreadDot}/></CardContent></Card></div></TabsContent>
      <TabsContent value="messages"><SectionTitle>Conversations</SectionTitle><Card className={styles.simpleCard}><CardContent className={styles.notification}><Face initials="EC" color="#D8C6B4"/><div><strong>Erin Clyne</strong><span>See you at Asana Lab!</span></div><Badge>1</Badge></CardContent></Card></TabsContent>
    </Tabs>
  </>;
}

function YouScreen() {
  return <>
    <div className={styles.topAction}><Button variant="outline" size="icon-lg" aria-label="Settings"><Settings2 size={19}/></Button></div>
    <Card className={styles.profileCard}><CardContent><Face initials="ML" color="#C8C3DB" size={68}/><div><h2>Matt LeGrice</h2><span>@mattlegrice</span><p>Strength & mobility coach · Jersey City, NJ</p></div><Button variant="outline">Edit profile</Button></CardContent></Card>
    <SectionTitle>Your calendars</SectionTitle><div className={styles.stack}><Card className={styles.simpleCard}><CardContent className={styles.menuRow}><CalendarDays size={20}/><div><strong>Personal calendar</strong><span>Classes, shifts, and saved plans</span></div><ChevronRight size={18}/></CardContent></Card><Card className={styles.simpleCard}><CardContent className={styles.menuRow}><Users size={20}/><div><strong>Gals who like to move</strong><span>4 members</span></div><ChevronRight size={18}/></CardContent></Card></div>
    <SectionTitle>Preferences</SectionTitle><Card className={styles.simpleCard}><CardContent className={styles.menuRow}><Bell size={20}/><div><strong>Notifications</strong><span>Choose what you hear about</span></div><ChevronRight size={18}/></CardContent></Card>
  </>;
}

export default function UiPreview() {
  const [screen,setScreen]=useState<Screen>("calendar");
  return <div className={styles.preview}><div className={styles.notice}>shadcn/ui mobile concept · sample content</div><div className={styles.phone}>
    <main className={styles.content}>{screen==="calendar"?<CalendarScreen/>:screen==="discover"?<DiscoverScreen/>:screen==="groups"?<GroupsScreen/>:screen==="inbox"?<InboxScreen/>:<YouScreen/>}</main>
    <nav className={styles.dock} aria-label="Preview screens">{screens.map(({id,label,icon:Icon})=><button key={id} type="button" aria-current={screen===id?"page":undefined} onClick={()=>setScreen(id)}><Icon size={21} strokeWidth={screen===id?2.4:1.9}/><span>{label}</span></button>)}</nav>
  </div></div>;
}
