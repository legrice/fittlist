"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// The profile renders the Follow control twice: the pill in the header and the
// compact one in the sticky bar. Each is its own NotifyCta, so without a shared
// place to keep the answer, tapping one would leave the other reporting the old
// state. This is that place; NotifyCta reaches for it and falls back to local
// state when it renders somewhere without a provider.
type FollowState = { following: boolean; requested: boolean; subscribed: boolean };

const Ctx = createContext<[FollowState, (patch: Partial<FollowState>) => void] | null>(null);

export function FollowSync({
  initial,
  children,
}: {
  initial: FollowState;
  children: ReactNode;
}) {
  const [state, setState] = useState(initial);
  return (
    <Ctx.Provider value={[state, (patch) => setState((s) => ({ ...s, ...patch }))]}>
      {children}
    </Ctx.Provider>
  );
}

export function useFollowSync() {
  return useContext(Ctx);
}
