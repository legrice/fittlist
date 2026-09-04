import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Give the editor a crop preview without serialising a possible multi-megabyte
 * development data URL into the client payload. Blob URLs redirect directly;
 * local data URLs are decoded here.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return new Response("Not found", { status:404 });

  const db = await getDb();
  const [user] = await db
    .select({ storyPrefs:schema.users.storyPrefs })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  const background = user?.storyPrefs?.background;
  if (!background) return new Response("Not found", { status:404 });

  // This URL identifies the current session, not an immutable public image.
  // Persisting it can show a previous account's background after sign-out.
  const cacheControl = "private, no-store";
  if (/^https:\/\//i.test(background)) {
    return new Response(null, {
      status:302,
      headers:{ Location:background, "Cache-Control":cacheControl },
    });
  }

  const match = background.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return new Response("Not found", { status:404 });
  return new Response(Buffer.from(match[2], "base64"), {
    headers:{
      "Cache-Control":cacheControl,
      "Content-Type":match[1],
      "X-Content-Type-Options":"nosniff",
    },
  });
}
