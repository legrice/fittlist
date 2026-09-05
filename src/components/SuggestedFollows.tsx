"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { discoverPeople, type DiscoverData } from "@/app/actions/discover";
import { FavoritePersonButton } from "@/components/FavoritePersonButton";
import { withTimeout } from "@/lib/async";

export function SuggestedFollows() {
  const [data, setData] = useState<DiscoverData | null>(null);
  useEffect(() => {
    let active = true;
    void withTimeout(discoverPeople(25)).then(result => { if (active) setData(result); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const people = data?.people.filter(person => !person.following && !person.requested).slice(0, 4) ?? [];
  if (!people.length) return null;
  return <section className="suggested-follows" aria-label="Suggested follows">
    <h3>{data?.myLat != null && data.myLng != null ? "People near you" : "People to follow"}</h3>
    <div className="suggested-follow-grid">{people.map(person => <article key={person.id}>
      <Link href={`/${person.handle}`}><span className="suggested-face">{person.photo ?
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.photo} alt="" /> : person.name.charAt(0)}</span><strong>{person.name}</strong><small>{person.location || person.title || "View calendar"}</small></Link>
      <FavoritePersonButton person={person} />
    </article>)}</div>
  </section>;
}
