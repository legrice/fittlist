"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";

const ITEMS = [
  { href: "/app", label: "Schedule" },
  { href: "/app/page", label: "My page" },
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
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

// Mobile: a sticky header with the wordmark and a Schedule/My page toggle,
// sitting where each screen's page title used to be.
export function TopNav({ theme }: { theme: string }) {
  const pathname = usePathname();
  return (
    <div className="topnav">
      <Wordmark variant={theme === "poster" ? "cloud" : "ink"} />
      <nav className="pagetoggle" aria-label="Main">
        {ITEMS.map((it) => (
          <Link key={it.href} href={it.href} className={isActive(pathname, it.href) ? "active" : ""}>
            {it.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
