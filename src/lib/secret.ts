// The one signing secret. Sessions, unsubscribe links, inquiry replies, the
// personal calendar token, and both OAuth flows all sign with SESSION_SECRET,
// so a deployment that boots without it would sign every one of those with a
// string that sits in this repo, and anyone could mint a session for any
// account. Refuse to run rather than run open. A local `next start` test may
// opt in explicitly; hosting-provider detection is not a security boundary.
export function sessionSecretRaw(): string {
  const raw = process.env.SESSION_SECRET;
  if (raw) {
    if (
      process.env.NODE_ENV === "production" &&
      (
        raw !== raw.trim() ||
        new TextEncoder().encode(raw).byteLength < 32 ||
        raw === "change-me" ||
        raw === "dev-secret-change-me"
      )
    ) {
      throw new Error("SESSION_SECRET must be at least 32 random bytes with no surrounding whitespace");
    }
    return raw;
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_DEV_SECRET !== "true") {
    throw new Error("SESSION_SECRET is not set; refusing to sign with the dev fallback");
  }
  return "dev-secret-change-me";
}

export function sessionSecret(): Uint8Array {
  return new TextEncoder().encode(sessionSecretRaw());
}
