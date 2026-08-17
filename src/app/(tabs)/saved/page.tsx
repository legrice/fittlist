import { redirect } from "next/navigation";
import { youDashboardData } from "@/app/actions/you";
import { SavedScreen } from "@/components/SavedScreen";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const data = await youDashboardData();
  if (!data) redirect("/welcome");
  return <SavedScreen people={data.people} places={data.places} />;
}
