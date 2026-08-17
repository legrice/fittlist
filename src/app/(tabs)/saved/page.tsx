import { redirect } from "next/navigation";
import { youDashboardData } from "@/app/actions/you";
import { groupClassOptions } from "@/app/actions/groups";
import { SavedScreen } from "@/components/SavedScreen";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const [data, classes] = await Promise.all([youDashboardData(), groupClassOptions()]);
  if (!data) redirect("/welcome");
  return <SavedScreen people={data.people} places={data.places} groups={data.groups} classes={classes} />;
}
