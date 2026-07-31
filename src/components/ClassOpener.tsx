"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClassSheet } from "@/components/ClassSheet";

// Turns a server-rendered list of class rows into rows that open a sheet.
//
// The rows are still built on the server (they're the same markup a crawler and
// a cold load see); this only catches the tap. A row carries its class id and
// date on data attributes, so the wrapper doesn't need to know how the list is
// laid out, and a list can change shape without touching this.
export function ClassOpener({
  handle,
  children,
}: {
  handle: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<{ classId: string; iso?: string; base?: string } | null>(
    null,
  );

  return (
    <>
      <div
        onClickCapture={(e) => {
          const row = (e.target as HTMLElement).closest<HTMLElement>("[data-cid]");
          if (!row) return;
          // Let a modified click do what the browser would: open the real page
          // in a new tab. The sheet is for the ordinary tap.
          const me = e as unknown as MouseEvent;
          if (me.metaKey || me.ctrlKey || me.shiftKey || me.altKey) return;
          e.preventDefault();
          e.stopPropagation();
          // A row can name its own base. A gym's class is addressed under the
          // studio, so a shift on a coach's page opens under the gym that
          // owns it rather than under the coach, which resolves to nothing.
          setOpen({
            classId: row.dataset.cid!,
            iso: row.dataset.d || undefined,
            base: row.dataset.base || undefined,
          });
        }}
      >
        {children}
      </div>
      {open && (
        <ClassSheet
          handle={open.base ?? handle}
          classId={open.classId}
          iso={open.iso}
          onClose={() => setOpen(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </>
  );
}
