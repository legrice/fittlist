import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { siteOrigin } from "@/lib/format";

// A scannable QR code (PNG) that points at the coach's public page. Scans are
// tagged ?ref=qr so we can later tell in-person QR traffic apart from links.
// High-res (1024px) so it stays crisp when printed on a flyer or shown on a
// screen. Charcoal ink modules on white for the best scan reliability.
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

  const target = `${siteOrigin()}/${handle}?ref=qr`;
  const png = await QRCode.toBuffer(target, {
    type: "png",
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#191502", light: "#ffffff" },
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
