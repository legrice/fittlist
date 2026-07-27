import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { verifyDigestUnsubToken } from "@/lib/notifier";

// One-click unsubscribe for the merged weekly digest. This only silences the
// email — the account keeps following its coaches, so the feed is untouched.

async function optOut(token: string): Promise<boolean> {
  const userId = await verifyDigestUnsubToken(token);
  if (!userId) return false;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return false;
  if (!user.digestOptOutAt) {
    await db
      .update(schema.users)
      .set({ digestOptOutAt: new Date() })
      .where(eq(schema.users.id, user.id));
  }
  return true;
}

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await optOut(token);
  return new NextResponse(ok ? "Unsubscribed" : "Invalid link", { status: ok ? 200 : 400 });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await optOut(token);
  return NextResponse.redirect(new URL(`/u/digest/${token}`, req.url));
}
