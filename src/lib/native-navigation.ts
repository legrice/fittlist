/** Resolve trusted universal links into this shell's configured web origin. */
export function nativeLinkDestination(raw: string, currentOrigin: string): string | null {
  try {
    const incoming = new URL(raw);
    if (incoming.protocol !== "https:" || !["fittlist.co", "www.fittlist.co"].includes(incoming.hostname)
      || incoming.username || incoming.password || (incoming.port && incoming.port !== "443")) return null;
    const destination = new URL(currentOrigin);
    destination.pathname = incoming.pathname;
    destination.search = incoming.search;
    destination.hash = incoming.hash;
    return destination.href;
  } catch { return null; }
}
