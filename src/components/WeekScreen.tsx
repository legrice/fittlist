"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setGoing } from "@/app/actions/going";
import type { WeekDay } from "@/lib/week";
import { Icon } from "@/components/Icon";
import { MyCalendar } from "@/components/MyCalendar";
import { Toast, useToast } from "@/components/Toast";

// The classes you added, and nothing else.
//
// Deliberately not a calendar: no month grid, no empty days, no time gutter.
// It's a shortlist that empties itself as the week passes, every row can leave,
// and the row at the bottom points at your real calendar. Those three things
// are what stop it reading as "fittlist wants to be your calendar now".
export function WeekScreen({ days }: { days: WeekDay[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const [, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const remove = (classId: string, iso: string, key: string) => {
    setGone((g) => ({ ...g, [key]: true }));
    start(async () => {
      const res = await setGoing(classId, iso, false);
      if (!res.ok) {
        setGone((g) => ({ ...g, [key]: false }));
        toast(res.error ?? "Couldn't remove that");
        return;
      }
      toast("Removed from your week");
      router.refresh();
    });
  };

  const shown = days
    .map((d) => ({ ...d, items: d.items.filter((i) => !gone[`${i.classId}|${i.iso}`]) }))
    .filter((d) => d.items.length > 0);
  const left = shown.reduce((n, d) => n + d.items.length, 0);

  return (
    <section className="screen">
      <div className="pad" style={{ paddingTop: 14, paddingBottom: 140 }}>
        <div className="admintop">
          <div>
            <h1>Your week</h1>
            <p className="adminsub">
              {left === 0
                ? "Classes you add land here"
                : `${left} class${left === 1 ? "" : "es"} coming up`}
            </p>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="empty-block">
            <h2>Nothing added yet</h2>
            <p>
              Swipe any class on Following, or open one and tap Add to your week. What you pick
              lands here, and drops off once it&rsquo;s been and gone.
            </p>
            <Link className="btn si" href="/feed">
              Find something to add
            </Link>
          </div>
        ) : (
          <>
            <div className="weeklist">
              {shown.map((d) => (
                <div key={d.iso} className="weekday">
                  <div className="ps-daycol">{d.label}</div>
                  {d.items.map((i) => {
                    const key = `${i.classId}|${i.iso}`;
                    return (
                      <div key={key} className="weekrow">
                        <span
                          className="ps-accent weekrow-accent"
                          style={{ background: i.coachColor }}
                          aria-hidden="true"
                        />
                        <Link className="weekrow-main" href={`/${i.handle}/${i.classId}?d=${i.iso}&from=week`}>
                          <span className="weekrow-nm">{i.name}</span>
                          <span className="weekrow-sub">
                            {i.hm}
                            <span className="ps-ap">{i.ap}</span> · {i.durationMin} min
                            {i.where ? ` · ${i.where}` : ""}
                          </span>
                          <span className="weekrow-who">with {i.coachName}</span>
                        </Link>
                        {/* Every row can leave. A calendar's entries don't; a
                            list's do, and that difference is most of what keeps
                            this from reading as one. */}
                        <button
                          className="weekrow-x"
                          aria-label={`Remove ${i.name}`}
                          onClick={() => remove(i.classId, i.iso, key)}
                        >
                          <Icon name="close" size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {/* The sentence that settles what this screen is: your calendar is
                over there, this is the list of what you picked. */}
            <div className="settingslist weekcal">
              <MyCalendar />
            </div>
          </>
        )}
      </div>
      <Toast msg={toastMsg} on={toastOn} />
    </section>
  );
}
