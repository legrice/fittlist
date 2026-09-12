import { brandedQr } from "@/lib/qrimage";

/** A public, reusable event code: no account or session data is embedded. */
export async function GET(req: Request) {
  const flyer = new URL(req.url).searchParams.get("campaign") === "flyer";
  const response = await brandedQr(flyer ? "https://www.fittlist.co/flyer" : "https://www.fittlist.co/?join=login", "light");
  if (new URL(req.url).searchParams.get("download") === "1") {
    response.headers.set("Content-Disposition", `attachment; filename="fittlist-${flyer ? "flyer" : "login"}-qr.png"`);
  }
  return response;
}
