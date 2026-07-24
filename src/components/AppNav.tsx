"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";

const ITEMS = [
  { href: "/app", ico: "▦", label: "Schedule" },
  { href: "/app/page", ico: "↗", label: "My page" },
];

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

export function SideNav({ handle }: { handle: string }) {
  const pathname = usePathname();
  return (
    <nav className="sidenav" aria-label="Main">
      <Wordmark />
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} className={isActive(pathname, it.href) ? "active" : ""}>
          <span className="ico">{it.ico}</span>
          {it.label}
        </Link>
      ))}
      <div className="sideuser">fittlist.co/{handle}</div>
    </nav>
  );
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} className={isActive(pathname, it.href) ? "active" : ""}>
          <span className="ico">{it.ico}</span>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
