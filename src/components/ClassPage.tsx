"use client";

import { useRouter } from "next/navigation";
import { useSlideBack } from "@/components/BackLink";
import { ClassPeek, peekFromDetail } from "@/components/ClassPeek";
import { Toast, useToast } from "@/components/Toast";
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
  const [toastMsg,toastOn,toast]=useToast();
  void backLabel; void claimVia;
  return (
    <><ClassPeek
      cls={peekFromDetail(detail)}
      initialDetail={detail}
      onClose={() => back(backHref)}
      onChanged={() => router.refresh()}
      onToast={toast}
    /><Toast msg={toastMsg} on={toastOn}/></>
  );
}
