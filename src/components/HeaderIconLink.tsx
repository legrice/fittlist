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
  /** The pathname that counts as "here". "?acct" means the settings overlay,
   *  which lives in the query string rather than the path. */
  match: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const on =
    match === "?acct"
      ? params.has("acct")
      : pathname === match || pathname.startsWith(`${match}/`);
  return (
    <Link
      className={`iconbtn inboxbtn ${className}${on ? " onroute" : ""}`}
      aria-label={label}
      aria-current={on ? "page" : undefined}
      href={href}
    >
      <Icon name={icon} size={22} />
      {badge}
    </Link>
  );
}
