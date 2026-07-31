"use client";

import { useRouter } from "next/navigation";
import { useSlideBack } from "@/components/BackLink";
import { ClassSheet } from "@/components/ClassSheet";
import type { ClassDetail } from "@/app/actions/classdetail";

// The shared-link door to a class: the same overlay the lists open, worn as a
// page. The server loads the detail once and seeds the sheet with it, so this
// door and the sheet can never disagree about what a class looks like. Back
// pops when the coach's page is already beneath and pushes when the link
// opened cold.
export function ClassPage({
  detail,
  backHref,
  backLabel,
  claimVia,
}: {
  detail: ClassDetail;
  backHref: string;
  backLabel: string;
  claimVia: string | null;
}) {
  const back = useSlideBack();
  const router = useRouter();
  return (
    <ClassSheet
      handle={detail.handle}
      classId={detail.id}
      iso={detail.whenIso}
      initial={detail}
      backLabel={backLabel}
      claimVia={claimVia}
      onClose={() => back(backHref)}
      onChanged={() => router.refresh()}
    />
  );
}
