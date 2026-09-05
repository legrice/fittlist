"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import styles from "./MarketingPhoneDemo.module.css";

const studios = ["Northline Yoga", "Harbor Athletic Club", "Common Ground"];
const classes = ["Morning Flow", "Strength Circuit", "Mobility & Restore"];

function HubRow({ initials, badge, name }: { initials: string; badge: string; name: string }) {
  return <div className={styles.row}><span className={styles.avatar}>{initials}</span><span><small>{badge}</small><strong>{name}</strong></span><Icon name="chevron_right" size={17} /></div>;
}

export function MarketingPhoneDemo() {
  const root = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    change(); query.addEventListener("change", change);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (root.current) observer.observe(root.current);
    return () => { observer.disconnect(); query.removeEventListener("change", change); };
  }, []);
  return <figure ref={root} className={styles.demo} data-running={!paused && visible && !reduced}>
    <div className={styles.phone} aria-hidden="true">
      <div className={styles.status}><strong>9:41</strong><span className={styles.island} /><span>••• ▰</span></div>
      {[false, true].map(following => <div key={String(following)} className={`${styles.scene} ${following ? styles.following : styles.you}`}>
        <div className={styles.top}><span className={styles.circle}><Icon name="notifications" size={19} /></span><div className={styles.tabs}><span data-active={!following}>You</span><span data-active={following}>Explore</span></div><span className={styles.circle}><Icon name="search" size={19} /></span></div>
        <h3 className={styles.summary}>{following ? "You’re following 8 people, 2 studios, and 3 groups." : "You’re teaching 14 classes across 3 studios this week."}</h3>
        <div className={styles.chevron}><Icon name="expand_more" size={22} /></div>
        <div className={styles.schedule}><div className={styles.scroll}>
          {following ? ["Avery Brooks", "Jordan Lee", "Sam Rivera", "Alex Chen"].map((name, index) => <div key={name}><h4>{index === 0 ? "Today" : "Tomorrow"}</h4><article className={styles.activity}><span className={styles.avatar}>{name[0]}</span><div><strong>{name}</strong> is teaching <strong>{classes[index % 3]}</strong><p>{studios[index % 3]}<br />5:00pm · 60 min</p><span>♡ &nbsp; <Icon name="chat_bubble" size={16} /></span></div></article></div>) : Array.from({ length: 7 }, (_, day) => <div key={day}><h4>{["Mon, Sep 7", "Tue, Sep 8", "Wed, Sep 9", "Thu, Sep 10", "Fri, Sep 11", "Sat, Sep 12", "Sun, Sep 13"][day]}</h4>{[0, 1].map(slot => <article key={slot} className={styles.classCard}><small>Teaching</small><div><strong>{classes[(day + slot) % 3]}</strong><b>{slot ? "5:00p" : "9:00a"}</b></div><p>{studios[(day + slot) % 3]}<span>60 min</span></p></article>)}</div>)}
        </div></div>
        <div className={styles.sheet}><div className={styles.handle} />{following ? <><div className={styles.discovery}><strong>People</strong><span>Studios</span><span>Groups</span></div><h4>People near you</h4>{["Avery Brooks", "Jordan Lee", "Sam Rivera"].map(name => <div className={styles.row} key={name}><span className={styles.avatar}>{name[0]}</span><span><strong>{name}</strong><p>Jersey City, NJ</p></span><b className={styles.followPill}>Following</b></div>)}</> : <><div className={styles.quick}><span><Icon name="reply" size={16} />Share week</span><span><Icon name="qr_code_2" size={16} />Share profile</span></div><h4>Profile</h4><HubRow initials="MC" badge="@mayacole" name="Maya Cole" /><h4>Studios</h4><HubRow initials="N" badge="Admin" name="Northline Yoga" /><h4>Groups</h4><HubRow initials="S" badge="Member" name="Saturday Crew" /><h4>Updates</h4><HubRow initials="M" badge="Your conversations" name="Messages" /></>}</div>
        <div className={styles.dock}><span><Icon name="calendar_view_day" size={20} /><Icon name="calendar_month" size={20} /></span>{!following && <b><Icon name="add" size={23} /></b>}</div>
      </div>)}
      <div className={styles.home} />
    </div>
    <figcaption>Fictional names and schedules · A look inside FittList</figcaption>
    <button type="button" className={styles.control} onClick={() => setPaused(value => !value)} disabled={reduced}>{reduced ? "Reduced-motion preview" : paused ? "Play app preview" : "Pause app preview"}</button>
  </figure>;
}
