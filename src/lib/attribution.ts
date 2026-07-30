import { cookies } from "next/headers";

// The first-touch source cookie, written by src/middleware.ts. Read once, at
// account creation, and stored on the user; null reads as "direct".
export async function signupSource(): Promise<string | null> {
  const jar = await cookies();
  const v = jar.get("fl_src")?.value?.trim();
  return v ? v.slice(0, 120) : null;
}
