import { managedStudio } from "@/lib/managed-studio";
import Link from "next/link";
import { gymCounts } from "@/app/actions/gym";
import { GymCountsView } from "@/components/GymCountsView";

export const dynamic = "force-dynamic";

// The shift counter, counted from the rota. Manager only, reached from the
// studio's calendar workspace.
export default async function CountsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ m?: string; from?: string; to?: string }>;
}) {
  const { slug } = await params;
  const { m, from, to } = await searchParams;
  const { studio } = await managedStudio(slug);

  const base = `/s/${studio.slug ?? studio.id}/manage`;
  if (!studio.accountUserId) return <main className="studio-settings-page">
    <header><h1>Shift counter</h1><p>{studio.name}</p></header>
    <div className="studio-settings-panel">
      <h2>Start with your calendar</h2>
      <p>Turn on your studio calendar to track classes and coach totals here.</p>
      <Link className="btn" href={`${base}/calendar`} prefetch={false}>Open calendar</Link>
    </div>
  </main>;
  const counts = await gymCounts(studio.id, m, from, to);
  return (
    <GymCountsView
      studioName={studio.name}
      backHref={base}
      countsBase={`${base}/counts`}
      counts={counts}
    />
  );
}
