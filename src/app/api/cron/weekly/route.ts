import { sendWeeklyDigests } from "@/lib/notifier";

// Weekly job: email every active subscriber their trainer's upcoming-week
// schedule. Trigger it once a week from a scheduler (Vercel Cron, GitHub
// Actions, cron-job.org, …). Protected by CRON_SECRET: the caller must send
// `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends automatically)
// or `?key=<CRON_SECRET>`. Returns 503 until the secret is configured so the
// endpoint is never open.

export const dynamic = "force-dynamic";

async function run(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("CRON_SECRET not configured", { status: 503 });

  const auth = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendWeeklyDigests();
  return Response.json({ ok: true, ...result });
}

export const GET = run;
export const POST = run;
