"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Avatar, Button, Card, Chip, Label, Link, ListBox, SearchField, Select, Tabs } from "@heroui/react";
import { ArrowLeft, ArrowUpRight, CalendarDays, ChevronRight, MapPin, Plus, Search, Share2, Users } from "lucide-react";
import { calendarActivitySummary } from "@/lib/calendar-summary";

const frameDocument = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>FittList HeroUI comparison</title><link rel="stylesheet" href="/hero-preview/heroui-3.2.6.css"><link rel="stylesheet" href="/hero-preview/layout.css"></head><body><div id="preview-root"></div></body></html>`;
type Category = "classes" | "people" | "places";
const people = [
  { name: "Erin Clyne", initials: "EC", specialty: "Yoga", title: "Yoga teacher & sports massage", color: "warning" as const },
  { name: "Freddie Morgan", initials: "FM", specialty: "Strength", title: "Strength & mobility coach", color: "accent" as const },
  { name: "Matt LeGrice", initials: "ML", specialty: "Strength", title: "Strength & mobility coach", color: "success" as const },
];
const classes = [
  { day: "Today · Sep 19", time: "8:00 AM", name: "Asana Lab", place: "Asana Soul Practice", coach: people[0], duration: "60 min" },
  { day: "Tomorrow · Sep 20", time: "10:30 AM", name: "Sculpt", place: "Jane DO Jersey City", coach: people[1], duration: "50 min" },
  { day: "Mon · Sep 21", time: "6:00 PM", name: "Guns, Buns, and Lungs", place: "Ironbound Performance Athletics", coach: people[2], duration: "60 min" },
];
const places = [
  { name: "Asana Soul Practice", type: "Yoga" },
  { name: "Jane DO Jersey City", type: "Sculpt" },
  { name: "Ironbound Performance Athletics", type: "Strength" },
];
function Face({ person }: { person: typeof people[number] }) {
  return <Avatar color={person.color} size="sm"><Avatar.Fallback>{person.initials}</Avatar.Fallback></Avatar>;
}
function Heading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="section-heading"><h2>{children}</h2>{action}</div>;
}
function ClassCard({ item }: { item: typeof classes[number] }) {
  return <Card><Card.Header className="attribution"><Face person={item.coach}/><span>{item.coach.name}</span></Card.Header><Card.Content className="class-details"><div><strong>{item.time}</strong><span>{item.duration}</span></div><div><strong>{item.name}</strong><span>{item.place}</span></div></Card.Content></Card>;
}
function ClassList({ items }: { items: typeof classes }) {
  return <div className="class-list">{items.map(item => <section key={item.name}><h3 className="day-label">{item.day}</h3><ClassCard item={item}/></section>)}</div>;
}
function Calendar() {
  const [person, setPerson] = useState("All");
  return <Tabs defaultSelectedKey="you" className="calendar-tabs"><Tabs.ListContainer><Tabs.List aria-label="Calendar view"><Tabs.Tab id="you">You<Tabs.Indicator/></Tabs.Tab><Tabs.Tab id="following">Following<Tabs.Indicator/></Tabs.Tab></Tabs.List></Tabs.ListContainer>
    <Tabs.Panel id="you"><Card className="week-card"><Card.Header><Card.Title>{calendarActivitySummary({ teaching: 1, attending: 2, personal: 0 })}</Card.Title></Card.Header><Card.Footer><Button onPress={() => { window.location.href = "/share"; }}><Share2 size={17}/>Share</Button><Button variant="secondary" onPress={() => { window.location.href = "/calendar?add=1"; }}><Plus size={17}/>Add</Button></Card.Footer></Card><ClassList items={classes}/><Button isIconOnly size="lg" className="add-fab" aria-label="Add a class" onPress={() => { window.location.href = "/calendar?add=1"; }}><Plus/></Button></Tabs.Panel>
    <Tabs.Panel id="following"><div className="people-rail" aria-label="Filter by person"><Button variant={person === "All" ? "secondary" : "ghost"} className="person-filter" aria-pressed={person === "All"} onPress={() => setPerson("All")}><Avatar size="sm"><Avatar.Fallback><Users size={18}/></Avatar.Fallback></Avatar><span>All</span></Button>{people.map(item => <Button key={item.name} variant={person === item.name ? "secondary" : "ghost"} className="person-filter" aria-label={item.name} aria-pressed={person === item.name} onPress={() => setPerson(item.name)}><Face person={item}/><span>{item.name.split(" ")[0]}</span></Button>)}</div><Heading action={<Chip size="sm" variant="soft">{person === "All" ? "3 classes" : "1 class"}</Chip>}>{person === "All" ? "From people you follow" : `From ${person.split(" ")[0]}`}</Heading><ClassList items={classes.filter(item => person === "All" || item.coach.name === person)}/></Tabs.Panel>
  </Tabs>;
}
function PersonCard({ person }: { person: typeof people[number] }) {
  const [followed, setFollowed] = useState(false);
  return <Card><Card.Content className="person-row"><Face person={person}/><div className="row-copy"><strong>{person.name}</strong><span>{person.title}</span><small><MapPin size={12}/>Jersey City, NJ</small></div><Button size="sm" variant={followed ? "secondary" : "primary"} onPress={() => setFollowed(!followed)}>{followed ? "Following" : "Follow"}</Button></Card.Content></Card>;
}
function PlaceCard({ place }: { place: typeof places[number] }) {
  return <Card><Card.Content className="person-row"><Avatar color="accent" size="sm"><Avatar.Fallback><MapPin size={18}/></Avatar.Fallback></Avatar><div className="row-copy"><strong>{place.name}</strong><span>{place.type} · Jersey City</span></div></Card.Content></Card>;
}
function Explore({ category, navigate, portalContainer }: { category: Category | null; navigate: (category: Category | null) => void; portalContainer: HTMLElement }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const match = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const shownClasses = classes.filter(item => match(`${item.name} ${item.place} ${item.coach.name}`) && (filter === "all" || item.duration === filter));
  const shownPeople = people.filter(item => match(`${item.name} ${item.title}`) && (filter === "all" || item.specialty === filter));
  const shownPlaces = places.filter(item => match(`${item.name} ${item.type}`) && (filter === "all" || item.type === filter));
  const more = (target: Category) => <Button size="sm" variant="ghost" aria-label={`See all ${target}`} onPress={() => navigate(target)}>See all<ChevronRight size={15}/></Button>;
  const options = category === "classes" ? ["50 min", "60 min"] : category === "people" ? ["Yoga", "Strength"] : ["Yoga", "Sculpt", "Strength"];
  const filterLabel = category === "classes" ? "Duration" : category === "people" ? "Specialty" : "Place type";
  const count = category === "classes" ? shownClasses.length : category === "people" ? shownPeople.length : shownPlaces.length;
  return <>
    {category && <Button variant="ghost" className="back-button" onPress={() => navigate(null)}><ArrowLeft size={17}/>Back to Explore</Button>}
    <SearchField aria-label={category ? `Search ${category}` : "Search Explore"} value={query} onChange={setQuery} fullWidth><SearchField.Group><SearchField.SearchIcon/><SearchField.Input placeholder={category ? `Search ${category}` : "People, places, classes"}/><SearchField.ClearButton/></SearchField.Group></SearchField>
    {category ? <>
      <Select aria-label={filterLabel} className="category-select" value={filter} onChange={value => setFilter(String(value ?? "all"))}><Label>{filterLabel}</Label><Select.Trigger><Select.Value/><Select.Indicator/></Select.Trigger><Select.Popover UNSTABLE_portalContainer={portalContainer}><ListBox><ListBox.Item id="all" textValue="All">All<ListBox.ItemIndicator/></ListBox.Item>{options.map(option => <ListBox.Item key={option} id={option} textValue={option}>{option}<ListBox.ItemIndicator/></ListBox.Item>)}</ListBox></Select.Popover></Select>
      <Heading action={<Chip size="sm" variant="soft">{count}</Chip>}>{category.charAt(0).toUpperCase() + category.slice(1)} nearby</Heading>
      {!count && <p className="supporting">No matches. Try another search or filter.</p>}
      {category === "classes" ? <ClassList items={shownClasses}/> : <div className="stack">{category === "people" ? shownPeople.map(person => <PersonCard key={person.name} person={person}/>) : shownPlaces.map(place => <PlaceCard key={place.name} place={place}/>)}</div>}
    </> : <>
      {!shownClasses.length && !shownPeople.length && !shownPlaces.length && <p className="supporting">No matches. Try another search.</p>}
      <Heading action={more("classes")}>Find your next class</Heading><p className="supporting">A few ways to move near Jersey City.</p><ClassList items={shownClasses.slice(0, 2)}/>
      <Heading action={more("people")}>People to move with</Heading><div className="stack">{shownPeople.slice(0, 2).map(person => <PersonCard key={person.name} person={person}/>)}</div>
      <Heading action={more("places")}>Places nearby</Heading><div className="stack">{shownPlaces.slice(0, 2).map(place => <PlaceCard key={place.name} place={place}/>)}</div>
    </>}
  </>;
}
function Demo({ portalContainer }: { portalContainer: HTMLElement }) {
  const [screen, setScreen] = useState<"calendar" | "explore">("calendar");
  const [category, setCategory] = useState<Category | null>(null);
  return <div className="phone"><aside className="comparison"><span>HeroUI · sample content</span><Link href="/ui-preview" target="_top">Original<ArrowUpRight size={13}/></Link></aside><main key={`${screen}-${category}`} className="content" aria-label={screen === "calendar" ? "Calendar" : "Explore"}>{screen === "calendar" ? <Calendar/> : <Explore category={category} navigate={setCategory} portalContainer={portalContainer}/>}</main><nav className="dock" aria-label="Preview screens"><Button variant={screen === "calendar" ? "secondary" : "ghost"} aria-current={screen === "calendar" ? "page" : undefined} onPress={() => { setScreen("calendar"); setCategory(null); }}><CalendarDays size={20}/>Calendar</Button><Button variant={screen === "explore" ? "secondary" : "ghost"} aria-current={screen === "explore" ? "page" : undefined} onPress={() => { setScreen("explore"); setCategory(null); }}><Search size={20}/>Explore</Button></nav></div>;
}
export default function HeroPreview() {
  const ref = useRef<HTMLIFrameElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const frame = ref.current;
    const mount = () => setRoot(frame?.contentDocument?.getElementById("preview-root") ?? null);
    mount();
    frame?.addEventListener("load", mount);
    return () => frame?.removeEventListener("load", mount);
  }, []);
  return <><iframe ref={ref} title="HeroUI mobile comparison" srcDoc={frameDocument} onLoad={() => setRoot(ref.current?.contentDocument?.getElementById("preview-root") ?? null)} style={{ position: "fixed", inset: 0, width: "100%", height: "100dvh", border: 0, zIndex: 1 }}/>{root && createPortal(<Demo portalContainer={root}/>, root)}</>;
}
