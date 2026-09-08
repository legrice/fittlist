import Link from "next/link";
import { Icon } from "@/components/Icon";
import { redirect } from "next/navigation";
import { youDashboardData } from "@/app/actions/you";
import { YouDashboard } from "@/components/YouDashboard";

export const dynamic = "force-dynamic";

export default async function YouPage() {
  const data = await youDashboardData();
  if (!data) redirect("/welcome");
  return <>
    <nav className="you-route-nav" aria-label="Account navigation">
      <Link href="/calendar" className="you-route-back"><Icon name="arrow_back" size={22} /><span>Calendar</span></Link>
    </nav>
    <YouDashboard {...data} />
  </>;
}
