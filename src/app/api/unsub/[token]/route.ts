import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { verifyUnsubToken } from "@/lib/notifier";

// RFC 8058 one-click unsubscribe target (List-Unsubscribe header). Mail
// clients POST here with no body context; humans following the header URL
// arrive via GET and are redirected to the confirmation page.

async function unsubscribe(token: string): Promise<boolean> {
  const subscriberId = await verifyUnsubToken(token);
  if (!subscriberId) return false;
  const db = await getDb();
  const [sub] = await db
    .select()
    .from(schema.subscribers)
    .where(eq(schema.subscribers.id, subscriberId));
  if (!sub) return false;
  if (!sub.optedOutAt) {
    await db
      .update(schema.subscribers)
      .set({ optedOutAt: new Date() })
      .where(eq(schema.subscribers.id, sub.id));
  }
  return true;
}

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await unsubscribe(token);
  return new NextResponse(ok ? "Unsubscribed" : "Invalid link", { status: ok ? 200 : 400 });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await unsubscribe(token);
  return NextResponse.redirect(new URL(`/u/${token}`, req.url));
}
