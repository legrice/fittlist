import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { siteOrigin } from "@/lib/format";
import { brandedQr } from "@/lib/qrimage";

// A scannable QR code (PNG) that points at the coach's public page. Scans are
// tagged ?ref=qr so we can later tell in-person QR traffic apart from links.
// High-res (1024px) so it stays crisp when printed on a flyer or shown on a
// screen. Drawn by brandedQr, which puts the F mark in the middle.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const db = await getDb();
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.handle, handle));
  if (!user) return new Response("Not found", { status: 404 });

  return brandedQr(`${siteOrigin()}/${handle}?ref=qr`);
}
