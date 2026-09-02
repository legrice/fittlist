"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { SignupPrompt } from "@/components/SignupPrompt";

export function ProfileActionGate({
  enabled,
  next,
  via,
  children,
}: {
  enabled: boolean;
  next: string;
  via?: string;
  children: ReactNode;
}) {
  const [signupOpen, setSignupOpen] = useState(false);

  const requireAccount = (event: MouseEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const target = event.target as HTMLElement;
    const control = target.closest<HTMLElement>("a[href], button");
    if (!control || control.closest(".profback")) return;
    event.preventDefault();
    event.stopPropagation();
    setSignupOpen(true);
  };

  return (
    <>
      <div className="profile-action-gate" onClickCapture={requireAccount}>{children}</div>
      <SignupPrompt
        open={signupOpen}
        onClose={() => setSignupOpen(false)}
        next={next}
        via={via}
        title="Join FittList"
        body="Sign up or log in to follow, contact, and explore the full schedule."
      />
    </>
  );
}
