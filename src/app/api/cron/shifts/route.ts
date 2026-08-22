import { sendShiftReminders } from "@/lib/shift-reminders";

export const dynamic = "force-dynamic";

async function run(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET not configured", { status: 503 });
  const auth = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  if (auth !== `Bearer ${secret}` && key !== secret) return new Response("Unauthorized", { status: 401 });
  return Response.json({ ok: true, ...(await sendShiftReminders()) });
}

export const GET = run;
export const POST = run;
