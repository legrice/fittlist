"use client";

import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { classDetail, type ClassDetail } from "@/app/actions/classdetail";
import { Toast, useToast } from "@/components/Toast";
import {
  invalidateClientMemory,
  loadClientMemory,
  readClientMemory,
  writeClientMemory,
} from "@/lib/client-memory";

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

const classMemoryKey = (base: string, id: string, iso?: string) =>
  `class-detail:${base.replace(/^s\//, "")}:${id}:${iso || "next"}`;

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
  const openRequest = useRef(0);

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
          const classId = row.dataset.cid!;
          const iso = row.dataset.d || undefined;
          const key = classMemoryKey(base, classId, iso);
          const remembered = readClientMemory<ClassDetail>(key);
          const request = ++openRequest.current;
          if (remembered) setOpen(remembered);
          else setOpen(null);
          void loadClientMemory<ClassDetail | null>(key, () =>
            classDetail(base.replace(/^s\//, ""), classId, iso),
          )
            .then((detail) => {
              if (request !== openRequest.current) return;
              if (detail) {
                // An undated door resolves to a concrete occurrence. Keep the
                // canonical date key warm too, because ClassPeek uses it.
                writeClientMemory(classMemoryKey(base, classId, detail.whenIso), detail);
                setOpen(detail);
              } else {
                invalidateClientMemory(key);
                setOpen(null);
                toast("That class isn't available");
              }
            })
            .catch(() => {
              // A remembered answer is still useful when a quiet refresh
              // fails. A cold tap has no sheet to preserve, so say so.
              if (request === openRequest.current && !remembered)
                toast("That class isn't available");
            });
        }}
      >
        {children}
      </div>
      {open && (
        <DeferredClassPeek
          detail={open}
          onClose={() => {
            openRequest.current += 1;
            setOpen(null);
          }}
          onChanged={() => router.refresh()}
          onToast={toast}
          allowWeekAdd={allowWeekAdd}
        />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
