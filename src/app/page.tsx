import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { AuthFlow } from "@/components/AuthFlow";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ via?: string }>;
}) {
  const { via } = await searchParams;
  const viaHandle = via?.trim() || null;
  const userId = await getSessionUserId();
  if (userId) {
    const db = await getDb();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (user?.handle) redirect("/app");
    // Signed in but never claimed a handle: resume onboarding at the claim step.
    if (user) return <AuthFlow startStage="claim" via={viaHandle} />;
  }
  return <AuthFlow startStage="email" via={viaHandle} />;
}
