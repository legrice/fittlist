import { sendDailyAdminStats } from "@/lib/adminstats";

// Daily job: the stats email to the admin(s). Same guard as the weekly
// digest: `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends) or
// `?key=<CRON_SECRET>`, and 503 until the secret exists so it's never open.

export const dynamic = "force-dynamic";

async function run(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET not configured", { status: 503 });

  const auth = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendDailyAdminStats();
  return Response.json({ ok: true, ...result });
}

export const GET = run;
export const POST = run;
