/**
 * Dark mode, controlled by each viewer from Settings.
 *
 * The stored `users.look`, server-rendered page roots, and document-level
 * client sync all read this same switch. Keeping the gate explicit makes a
 * future product-wide rollback one deliberate change instead of scattered
 * conditionals.
 *
 * Deliberately not an env flag. It is a decision about the product's look
 * rather than a per-deploy setting, and a flag would invite the two looks
 * back apart across environments, which is the thing being avoided.
 *
 * No "server-only" here on purpose: the toggle that hides itself is a client
 * component, and it needs to read the same answer the server does.
 */
export const DARK_ENABLED = true;

/** The `data-mode` a screen should carry for a stored `look`. */
export function lookMode(look: string | null | undefined): "dark" | undefined {
  return DARK_ENABLED && look === "dark" ? "dark" : undefined;
}
