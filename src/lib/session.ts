import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "fl_session";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days

function secret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me");
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}

export async function destroySession() {
  const jar = await cookies();
  // Overwrite with an already-expired cookie using the SAME path the session
  // was set with, so the browser actually drops it.
  jar.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}
