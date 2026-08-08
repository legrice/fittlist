"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Fixed overlays rendered from inside pinned chrome, moved to the body.
 *
 * The profile's head and the app header are position: sticky now, and sticky
 * makes a stacking context in every mobile browser: a sheet's z-46 rendered
 * inside one paints under the content card that slides over the chrome, and
 * under the z-45 tab bar. The stacking notes have always said the fix is to
 * portal; this is that fix as a component, so the next sheet rendered from
 * pinned chrome doesn't relearn it.
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
