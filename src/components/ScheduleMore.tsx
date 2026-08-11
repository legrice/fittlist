"use client";

import { useState, type ReactNode } from "react";

// The rest of a schedule, a week per tap. The chunks arrive server-rendered
// (real links, crawlable payload); this only decides how many are visible.
export function ScheduleMore({ chunks, label = "View more" }: { chunks: ReactNode[]; label?: string }) {
  const [shown, setShown] = useState(0);
  return (
    <>
      {chunks.slice(0, shown)}
      {shown < chunks.length && (
        <button type="button" className="viewmore" onClick={() => setShown((s) => s + 1)}>
          {label}
        </button>
      )}
    </>
  );
}
