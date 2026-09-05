"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

/**
 * The Contribute button at the end of the About page: the record is built
 * by the people in it, and this is the ask said as a control. Three ways
 * in: add a class (the ordinary adder, opened on the calendar), add a
 * studio (the same door, because naming a new studio on a class is what
 * makes its page exist; a form of its own can come when it is asked for),
 * and handing fittlist to a coach you know.
 */
export function Contribute({ addHref }: { addHref: string }) {
  const [open, setOpen] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();

  const shareApp = async () => {
    const url = window.location.origin;
    const text = "One place for local fitness. Classes, studios, coaches.";
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "FittList", text, url });
        return;
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied, ready to paste");
    } catch {
      toast("Couldn't copy the link");
    }
  };

  return (
    <>
      <button className="btn si contribute-cta" onClick={() => setOpen(true)}>
        Contribute
      </button>
      {open && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="sheet contribsheet">
            <button className="iconbtn sheetclose sheet-dismiss" aria-label="Close" onClick={() => setOpen(false)}>
              <Icon name="close" size={20} />
            </button>
            <h2>Contribute</h2>
            <p className="lead">The record is built by the people in it.</p>
            <div className="settingslist">
              <Link className="setrow" href={addHref}>
                <span className="setrow-txt">
                  <span className="t">Add a class</span>
                  <span className="s">One you teach, or one you go to.</span>
                </span>
                <Icon name="chevron_right" size={20} />
              </Link>
              <Link className="setrow" href={addHref}>
                <span className="setrow-txt">
                  <span className="t">Add a place</span>
                  <span className="s">
                    Add a gym, event, park, or virtual space while adding a class.
                  </span>
                </span>
                <Icon name="chevron_right" size={20} />
              </Link>
              <button className="setrow" onClick={shareApp}>
                <span className="setrow-txt">
                  <span className="t">Share fittlist with a coach</span>
                  <span className="s">Send them the link. Their schedule makes the record better.</span>
                </span>
                <Icon name="chevron_right" size={20} />
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
