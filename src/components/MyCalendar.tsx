"use client";

import { useEffect, useState } from "react";
import { myCalendarUrl } from "@/app/actions/calfeed";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// Every class from every coach you follow, in the calendar you already use.
//
// Subscribing beats exporting: the feed is live, so when a coach moves the 6am
// to 6:15 it moves in your calendar too, and a cancelled week disappears on
// its own. A one-time .ics download would be wrong within a fortnight.
export function MyCalendar() {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();

  useEffect(() => {
    let live = true;
    myCalendarUrl()
      .then((u) => live && u && setUrl(`${window.location.origin}${u}`))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!url) return null;
  // webcal:// is what makes a tap subscribe rather than download a dead copy.
  const webcal = url.replace(/^https?:\/\//, "webcal://");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Calendar link copied");
    } catch {
      toast(url);
    }
  };

  return (
    <>
      <button className="setrow" onClick={() => setOpen(!open)}>
        <span className="setrow-ic"><Icon name="calendar_month" size={22} /></span>
        <span className="setrow-txt">
          <span className="t">Add classes to your calendar</span>
          <span className="s">Every coach you follow, kept up to date</span>
        </span>
        <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
      </button>
      {open && (
        <div className="installhow">
          <p>
            It subscribes rather than copying, so a class that moves or gets cancelled updates
            on its own.
          </p>
          <div className="adminaddform-row">
            <a className="btn si" href={webcal}>Add to calendar</a>
            <button className="linktoggle" onClick={copy}>Copy the link</button>
          </div>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
