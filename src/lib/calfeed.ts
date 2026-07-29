import { SignJWT, jwtVerify } from "jose";

// A member's own calendar feed lives behind a signed token rather than a
// handle. The coach feed is public because their page is; a member's merged
// week is the list of coaches they follow, which is private (see
// MemberProfileView). The token is the key, and it doesn't expire: a calendar
// subscription that stops working in a month is worse than not offering one.

function secret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me");
}

export async function calendarToken(userId: string): Promise<string> {
  return new SignJWT({ aud: "calfeed" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .sign(secret());
}

export async function verifyCalendarToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.aud !== "calfeed" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}
