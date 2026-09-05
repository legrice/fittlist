"use client";

import { useState, useTransition } from "react";
import { updateAccountTimeZone } from "@/app/actions/timezone";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { TimeZoneSelect } from "@/components/TimeZoneSelect";
import { Toast, useToast } from "@/components/Toast";

export function TimeZoneSetting({ initialTimeZone }: { initialTimeZone: string }) {
  const [open, setOpen] = useState(false);
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
    setOpen(false);
  });

  const close = () => {
    setValue(saved);
    setOpen(false);
  };

  const timeZoneName = saved.replaceAll("_", " ").replace("/", " · ");

  return (
    <>
      <button className="setrow" type="button" onClick={() => setOpen(true)}>
        <span className="setrow-ic"><Icon name="schedule" size={24} /></span>
        <span className="setrow-txt">
          <span className="t">Time zone</span>
          <span className="s">{timeZoneName}</span>
        </span>
        <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
      </button>
      {open && <BodyPortal>
        <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className="sheet timezone-sheet" role="dialog" aria-modal="true" aria-labelledby="timezone-setting-title">
            <button className="iconbtn sheetclose sheet-dismiss" type="button" aria-label="Close time zone settings" onClick={close}>
              <Icon name="close" size={20} />
            </button>
            <h2 id="timezone-setting-title">Time zone</h2>
            <p className="lead">Used for classes and personal entries you add yourself. Studio classes use the studio&rsquo;s local time.</p>
            <TimeZoneSelect id="accountTimeZone" value={value} onChange={setValue} label="Your local time zone" />
            <div className="publishwrap">
              <button className="btn si" type="button" onClick={save} disabled={pending || value === saved}>
                {pending ? "Saving…" : "Save time zone"}
              </button>
            </div>
          </section>
        </div>
      </BodyPortal>}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
