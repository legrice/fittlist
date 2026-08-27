import Link from "next/link";
import { Icon } from "@/components/Icon";

type StudioManageSection = "calendar" | "staff";

const sections: { key: StudioManageSection; label: string; suffix: string; icon: "calendar_month" | "groups" }[] = [
  { key: "calendar", label: "Calendar", suffix: "/manage/calendar", icon: "calendar_month" },
  { key: "staff", label: "Staff", suffix: "/manage/staff", icon: "groups" },
];

/**
 * The two day-to-day parts of running a studio. They remain separate routes
 * so opening the calendar never downloads the roster, but the same navigation
 * makes them feel like one operating workspace.
 */
export function StudioManageNav({
  slug,
  active,
}: {
  slug: string;
  /** `shifts` is accepted only by the legacy coach screen; managers are
   * redirected before it renders, so the visible workspace remains two tabs. */
  active: StudioManageSection | "shifts";
}) {
  return (
    <nav
      className="studio-manage-nav"
      aria-label="Studio management"
    >
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
