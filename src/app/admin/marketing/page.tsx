import { notFound } from "next/navigation";
import { MarketingLanding } from "@/components/MarketingLanding";
import { currentAdmin } from "@/lib/admin";
import { lookMode } from "@/lib/darkmode";

export const dynamic = "force-dynamic";

export default async function MarketingPreviewPage() {
  const admin = await currentAdmin();
  if (!admin) notFound();

  return <MarketingLanding privatePreview mode={lookMode(admin.look)} />;
}
