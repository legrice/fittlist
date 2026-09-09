import { managedStudio } from "@/lib/managed-studio";
import { StudioAdminSheet } from "@/components/StudioAdminSheet";
import type { PlaceKind } from "@/lib/studio";

export const dynamic = "force-dynamic";

export default async function StudioSettingsPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { slug } = await params;
  const { studio } = await managedStudio(slug);
  const { view } = await searchParams;
  const initialView = view === "managers" ? "managers" : "settings";
  return <main className="studio-settings-page">
    <header><h1>{initialView === "managers" ? "Studio access" : "Profile and settings"}</h1><p>{studio.name}</p></header>
    <StudioAdminSheet key={`${studio.id}:${initialView}`} embedded initialView={initialView}
      slug={studio.slug ?? studio.id} canSchedule={!!studio.accountUserId}
      showCoaches={studio.showCoaches} approvalOn={studio.approveShiftChanges}
      studio={{ id: studio.id, name: studio.name, address: studio.address, timeZone: studio.timeZone,
        placeKind: studio.placeKind as PlaceKind, types: studio.types, about: studio.about ?? "", photo: studio.photo,
        contactEmail: studio.contactEmail ?? "", phone: studio.phone ?? "", website: studio.website ?? "", instagram: studio.instagram ?? "" }} />
  </main>;
}
