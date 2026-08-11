"use client";

import Link from "next/link";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";

export function SignupPrompt({
  open,
  onClose,
  next,
  via,
  title = "Join fittlist",
  body = "Build your schedule, follow coaches, and share the places and classes you love.",
}: {
  open: boolean;
  onClose: () => void;
  next: string;
  via?: string;
  title?: string;
  body?: string;
}) {
  if (!open) return null;
  const query = new URLSearchParams({ join: "signup", next });
  if (via) query.set("via", via);
  const login = new URLSearchParams({ join: "login", next });
  if (via) login.set("via", via);

  return (
    <BodyPortal>
      <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div className="sheet signup-prompt" role="dialog" aria-modal="true" aria-labelledby="signup-prompt-title">
          <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
          <h2 id="signup-prompt-title">{title}</h2>
          <p className="lead">{body}</p>
          <div className="publishwrap nostick">
            <Link className="btn si" href={`/?${query.toString()}`}>Sign up</Link>
          </div>
          <Link className="obloginlink authswitch" href={`/?${login.toString()}`}>
            Already have an account? <b>Sign in</b>
          </Link>
        </div>
      </div>
    </BodyPortal>
  );
}
