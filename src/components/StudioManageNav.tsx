import Link from "next/link";
import { Icon } from "@/components/Icon";

type StudioManageSection = "calendar" | "shifts" | "staff";

const sections: { key: StudioManageSection; label: string; suffix: string; icon: "calendar_month" | "schedule" | "groups" }[] = [
  { key: "calendar", label: "Calendar", suffix: "/manage", icon: "calendar_month" },
  { key: "shifts", label: "Shifts", suffix: "/shifts", icon: "schedule" },
  { key: "staff", label: "Staff", suffix: "/manage/staff", icon: "groups" },
];

/**
 * The three day-to-day parts of running a studio. They remain separate routes
 * so opening the calendar never downloads the roster or every shift request,
 * but the same navigation makes them feel like one operating workspace.
 */
export function StudioManageNav({
  slug,
  active,
}: {
  slug: string;
  active: StudioManageSection;
}) {
  return (
    <nav className="studio-manage-nav" aria-label="Studio management">
      {sections.map((section) => (
        <Link
          key={section.key}
          className={`studio-manage-tab${active === section.key ? " on" : ""}`}
          href={`/s/${slug}${section.suffix}`}
          aria-current={active === section.key ? "page" : undefined}
          prefetch={false}
        >
          <Icon name={section.icon} size={18} />
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
