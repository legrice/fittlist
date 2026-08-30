"use client";

import type { ReactNode } from "react";
import { setClientMemoryScope } from "@/lib/client-memory";

export function ClientCacheScope({
  viewerId,
  children,
}: {
  viewerId: string;
  children: ReactNode;
}) {
  // Bootstrap synchronously so descendant state initializers cannot briefly
  // read the previous signed-in account's namespace. The setter is a no-op
  // during server rendering and idempotent during React's repeated renders.
  setClientMemoryScope(viewerId);
  return children;
}
