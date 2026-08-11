"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";

// A header icon that knows when you are standing on its own screen, and fills
// in to say so. The glyphs are outlines everywhere else; the filled one reads
// as "you are here" the way the tab bar's active tab does, without inventing a
// second treatment for the same idea.
export function HeaderIconLink({
  href,
  label,
  icon,
  className = "",
  badge,
  match,
}: {
  href: string;
  label: string;
  icon: string;
  className?: string;
  /** The unread count bubble, when the door carries one. */
  badge?: ReactNode;
  /** The pathname or pathnames that count as "here". "?acct" means a
   *  query-backed overlay rather than a route. */
  match: string | string[];
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const matches = Array.isArray(match) ? match : [match];
  const on = matches.some((candidate) =>
    candidate === "?acct"
      ? params.has("acct")
      : pathname === candidate || pathname.startsWith(`${candidate}/`),
  );
  return (
    <Link
      className={`iconbtn inboxbtn ${className}${on ? " onroute" : ""}`}
      aria-label={label}
      aria-current={on ? "page" : undefined}
      href={href}
    >
      {/* 23, with the search and the gear: one size across the corner. */}
      <Icon name={icon} size={23} />
      {badge}
    </Link>
  );
}
