/**
 * Dark mode, switched off at the source.
 *
 * It works, and the whole of it is still here: the `users.look` column, the
 * `setLook` action, the toggle, and the hundred-odd `[data-mode="dark"]`
 * rules in globals.css. What this constant does is stop the app ever putting
 * the attribute on, so nothing renders dark and there is only ever one look
 * to design against. Turning it back on is this line.
 *
 * The reason is illustrations: art that has to read on both a cream page and
 * a near-black one is two drawings, or one drawing compromised, and until
 * that is worth thinking about it is cheaper to have one. Nothing about the
 * feature was wrong.
 *
 * Deliberately not an env flag. It is a decision about the product's look
 * rather than a per-deploy setting, and a flag would invite the two looks
 * back apart across environments, which is the thing being avoided.
 *
 * No "server-only" here on purpose: the toggle that hides itself is a client
 * component, and it needs to read the same answer the server does.
 */
export const DARK_ENABLED = false;

/** The `data-mode` a screen should carry for a stored `look`. */
export function lookMode(look: string | null | undefined): "dark" | undefined {
  return DARK_ENABLED && look === "dark" ? "dark" : undefined;
}
