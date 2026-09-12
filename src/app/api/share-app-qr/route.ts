import { brandedQr } from "@/lib/qrimage";

/** A public, reusable event code: no account or session data is embedded. */
export async function GET(req: Request) {
  const response = await brandedQr("https://www.fittlist.co/?join=login", "light");
  if (new URL(req.url).searchParams.get("download") === "1") {
    response.headers.set("Content-Disposition", 'attachment; filename="fittlist-login-qr.png"');
  }
  return response;
}
