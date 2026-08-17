import { redirect } from "next/navigation";
import { youDashboardData } from "@/app/actions/you";
import { YouDashboard } from "@/components/YouDashboard";

export const dynamic = "force-dynamic";

export default async function YouPage() {
  const data = await youDashboardData();
  if (!data) redirect("/welcome");
  return <YouDashboard {...data} />;
}
