import { inviterByCode } from "@/lib/joinlink";
import { siteOrigin } from "@/lib/format";
import { brandedQr } from "@/lib/qrimage";

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

  return brandedQr(`${siteOrigin()}/j/${code.trim().toLowerCase()}`);
}
