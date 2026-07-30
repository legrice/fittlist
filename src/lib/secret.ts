// The one signing secret. Sessions, unsubscribe links, inquiry replies, the
// personal calendar token, and both OAuth flows all sign with SESSION_SECRET,
// so a deployment that boots without it would sign every one of those with a
// string that sits in this repo, and anyone could mint a session for any
// account. Refuse to run rather than run open. Local production builds (the
// test suites run `next start`) keep the dev fallback; only a real Vercel
// deployment is held to it.
export function sessionSecretRaw(): string {
  const raw = process.env.SESSION_SECRET;
  if (raw) return raw;
  if (process.env.VERCEL) {
    throw new Error("SESSION_SECRET is not set; refusing to sign with the dev fallback");
  }
  return "dev-secret-change-me";
}

export function sessionSecret(): Uint8Array {
  return new TextEncoder().encode(sessionSecretRaw());
}
