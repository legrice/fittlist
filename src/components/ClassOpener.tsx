"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useState } from "react";
import { classDetail, type ClassDetail } from "@/app/actions/classdetail";
import { Toast, useToast } from "@/components/Toast";

type DeferredClassPeekProps = {
  detail: ClassDetail;
  onClose: () => void;
  onChanged: () => void;
  onToast: (message: string) => void;
  allowWeekAdd?: boolean;
};

// Profile, studio, group, and Discover lists all use this opener, but most
// visits never open a class. Keep the full detail/edit/share sheet out of
// those pages' initial JavaScript and fetch it only for the tap that needs it.
const DeferredClassPeek = dynamic<DeferredClassPeekProps>(() =>
  import("@/components/ClassPeek").then((module) => {
    function OpenedClassPeek({ detail, ...props }: DeferredClassPeekProps) {
      return (
        <module.ClassPeek
          cls={module.peekFromDetail(detail)}
          initialDetail={detail}
          {...props}
        />
      );
    }
    return OpenedClassPeek;
  }),
);

// Turns a server-rendered list of class rows into rows that open a sheet.
//
// The rows are still built on the server (they're the same markup a crawler and
// a cold load see); this only catches the tap. A row carries its class id and
// date on data attributes, so the wrapper doesn't need to know how the list is
// laid out, and a list can change shape without touching this.
export function ClassOpener({
  handle,
  children,
  allowWeekAdd = true,
}: {
  handle: string;
  children: React.ReactNode;
  allowWeekAdd?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<ClassDetail | null>(null);
  const [toastMsg, toastOn, toast] = useToast();

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
          const base = row.dataset.base || handle;
          void classDetail(base.replace(/^s\//, ""), row.dataset.cid!, row.dataset.d || undefined)
            .then((detail) => {
              if (detail) setOpen(detail);
              else toast("That class isn't available");
            });
        }}
      >
        {children}
      </div>
      {open && (
        <DeferredClassPeek
          detail={open}
          onClose={() => setOpen(null)}
          onChanged={() => router.refresh()}
          onToast={toast}
          allowWeekAdd={allowWeekAdd}
        />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
