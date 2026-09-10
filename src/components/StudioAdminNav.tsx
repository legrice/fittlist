"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";

export function StudioAdminNav({ name, slug, photo, registrationPro }: { name: string; slug: string; photo: string | null; registrationPro: boolean }) {
  const pathname = usePathname();
  const query = useSearchParams();
  const base = `/s/${slug}/manage`;
  const path = pathname.split("/manage")[1] || "";
  const openShifts = path === "/calendar" && query.get("show") === "open";
  const sections = [
    { label: "Schedule", links: [
      { label: "Calendar", icon: "calendar_month", href: `${base}/calendar?show=all`, active: path === "/calendar" && !openShifts },
      { label: "Open shifts", icon: "event_available", href: `${base}/calendar?show=open&view=week`, active: openShifts },
      { label: "Standard week", icon: "calendar_view_day", href: `${base}/standard`, active: path === "/standard" },
    ] },
    { label: "People", links: [
      { label: "Staff", icon: "groups", href: `${base}/staff`, active: path.startsWith("/staff") },
    ] },
    { label: "Studio", links: [
      { label: "Dashboard", icon: "storefront", href: base, active: path === "" },
      ...(registrationPro ? [{ label: "Front desk", icon: "groups", href: `${base}/registrations`, active: path === "/registrations" }] : []),
      { label: "Class counts", icon: "activity", href: `${base}/counts`, active: path === "/counts" },
      { label: "Owner and managers", icon: "admin_panel_settings", href: `${base}/settings?view=managers`, active: path === "/settings" && query.get("view") === "managers" },
      { label: "Profile and settings", icon: "settings", href: `${base}/settings`, active: path === "/settings" && query.get("view") !== "managers" },
    ] },
  ];
  return <aside className="studio-admin-sidebar">
    <div className="studio-admin-identity">
      <span className="studio-admin-photo">{photo ? <img src={photo} alt="" /> : <Icon name="storefront" size={32} />}</span>
      <strong>{name}</strong>
      <span>Admin center</span>
    </div>
    <nav aria-label="Studio administration">
      {sections.map(section => <div className="studio-admin-nav-section" key={section.label}>
        <h2>{section.label}</h2>
        {section.links.map(link => <Link key={link.label} href={link.href} prefetch={false} className="studio-admin-nav-link" aria-current={link.active ? "page" : undefined}>
          <Icon name={link.icon} size={21} /><span>{link.label}</span>
        </Link>)}
      </div>)}
      <div className="studio-admin-nav-section studio-admin-nav-preview">
        <Link className="studio-admin-nav-link" href={`/s/${slug}`} prefetch={false}><Icon name="storefront" size={21}/><span>View public profile</span><Icon name="arrow_outward" size={17}/></Link>
        <Link className="studio-admin-nav-link" href={`/s/${slug}/shifts?preview=coach`} prefetch={false}><Icon name="visibility" size={21}/><span>Coach view</span><Icon name="arrow_outward" size={17}/></Link>
      </div>
    </nav>
  </aside>;
}
