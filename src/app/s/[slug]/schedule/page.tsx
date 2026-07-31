import { StudioView } from "@/components/StudioView";
export { generateMetadata } from "../page";

export const dynamic = "force-dynamic";

// The schedule as its own URL, so a link to it lands on it and the back button
// treats it as the same screen (samePage strips the suffix).
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { slug } = await params;
  const { from } = await searchParams;
  return <StudioView slug={slug} tab="schedule" from={from} />;
}
