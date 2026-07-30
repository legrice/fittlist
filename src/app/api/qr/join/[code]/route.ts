import QRCode from "qrcode";
import { inviterByCode } from "@/lib/joinlink";
import { siteOrigin } from "@/lib/format";

// The invite link as a QR code: point a camera at a phone and you're through
// the beta gate. Same rendering as the profile QR, and only real codes get
// one, so this can't be used to mint plausible-looking invites.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const inviter = await inviterByCode(code);
  if (!inviter) return new Response("Not found", { status: 404 });

  const target = `${siteOrigin()}/j/${code.trim().toLowerCase()}`;
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
