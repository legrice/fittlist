"use client";

import { useState, useTransition } from "react";
import { updateAccountTimeZone } from "@/app/actions/timezone";
import { TimeZoneSelect } from "@/components/TimeZoneSelect";
import { Toast, useToast } from "@/components/Toast";

export function TimeZoneSetting({ initialTimeZone }: { initialTimeZone: string }) {
  const [value, setValue] = useState(initialTimeZone);
  const [saved, setSaved] = useState(initialTimeZone);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const save = () => start(async () => {
    const result = await updateAccountTimeZone(value);
    if (!result.ok) {
      setValue(saved);
      toast(result.error ?? "Couldn't save that time zone");
      return;
    }
    setSaved(value);
    toast("Calendar time zone updated");
  });

  return (
    <div className="tzsetting">
      <div>
        <b>Local class times</b>
        <p>Used for your own and personal entries. Classes at a studio use that place&rsquo;s time zone.</p>
      </div>
      <TimeZoneSelect id="accountTimeZone" value={value} onChange={setValue} />
      <button className="btn si" type="button" onClick={save} disabled={pending || value === saved}>
        {pending ? "Saving…" : "Save time zone"}
      </button>
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}
