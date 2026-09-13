import { flushNativePush } from "@/lib/native-push";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return new Response("Cron unavailable", { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  return Response.json(await flushNativePush());
}
