"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";

const ITEMS = [
  { href: "/app", ico: "view_week", label: "Schedule" },
  { href: "/app/page", ico: "open_in_new", label: "My page" },
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
          <span className="ico"><Icon name={it.ico} size={18} /></span>
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
          <span className="ico"><Icon name={it.ico} size={18} /></span>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
