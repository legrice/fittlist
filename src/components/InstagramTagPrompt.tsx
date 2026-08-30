"use client";

import { useEffect, useRef } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { InstagramGlyph } from "@/components/InstagramGlyph";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/brand";

export function InstagramTagPrompt({
  open,
  onClose,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => copyRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const copyHandle = async () => {
    try {
      await navigator.clipboard.writeText(INSTAGRAM_HANDLE);
      onToast(`${INSTAGRAM_HANDLE} copied`);
    } catch {
      // Clipboard access can be unavailable in an older embedded web view.
      // The temporary field keeps the one-tap action useful there too.
      const field = document.createElement("textarea");
      field.value = INSTAGRAM_HANDLE;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      onToast(copied ? `${INSTAGRAM_HANDLE} copied` : `Tag ${INSTAGRAM_HANDLE} on Instagram`);
    }
  };

  return (
    <BodyPortal>
      <div
        className="sheet-scrim instagram-tag-scrim"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <section
          ref={dialogRef}
          className="sheet confirmsheet instagram-tag-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="instagram-tag-title"
          aria-describedby="instagram-tag-description"
        >
          <span className="instagram-tag-icon" aria-hidden="true">
            <InstagramGlyph size={34} app />
          </span>
          <h2 id="instagram-tag-title">Want us to reshare your week?</h2>
          <p id="instagram-tag-description">
            Tag{" "}
            <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">
              {INSTAGRAM_HANDLE}
            </a>{" "}
            on Instagram so we can see it.
          </p>
          <div className="instagram-tag-actions">
            <button
              ref={copyRef}
              className="btn ghost"
              type="button"
              onClick={() => void copyHandle()}
            >
              Copy {INSTAGRAM_HANDLE}
            </button>
            <button className="btn si" type="button" onClick={onClose}>
              Done
            </button>
          </div>
        </section>
      </div>
    </BodyPortal>
  );
}
