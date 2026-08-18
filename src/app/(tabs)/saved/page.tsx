import { redirect } from "next/navigation";
import { youDashboardData } from "@/app/actions/you";
import { SavedScreen } from "@/components/SavedScreen";

export const dynamic = "force-dynamic";

export default async function SavedPage({ searchParams }: { searchParams:Promise<{highlight?:string}> }) {
  const data = await youDashboardData();
  if (!data) redirect("/welcome");
  const { highlight } = await searchParams;
  return <SavedScreen people={data.people} places={data.places} yourGroups={data.yourGroups} favoriteGroups={data.favoriteGroups} invitations={data.groupInvitations} highlight={highlight?.toLowerCase() ?? null} />;
}
