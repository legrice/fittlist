"use client";

import { useState, type ReactNode } from "react";

// About / Schedule switcher on the public profile. Both panels are rendered on
// the server and mounted at once, so switching is instant and the URL reflects
// the tab (/{handle} vs /{handle}/schedule) for sharing and refresh.
export function ProfileTabs({
  handle,
  initialTab,
  about,
  schedule,
}: {
  handle: string;
  initialTab: "about" | "schedule";
  about: ReactNode;
  schedule: ReactNode;
}) {
  const [tab, setTab] = useState<"about" | "schedule">(initialTab);

  const select = (t: "about" | "schedule") => {
    setTab(t);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", t === "schedule" ? `/${handle}/schedule` : `/${handle}`);
    }
  };

  return (
    <>
      <div className="pubtabs" role="tablist" aria-label="Profile sections">
        <button
          role="tab"
          aria-selected={tab === "about"}
          className={`pubtab${tab === "about" ? " sel" : ""}`}
          onClick={() => select("about")}
        >
          About
        </button>
        <button
          role="tab"
          aria-selected={tab === "schedule"}
          className={`pubtab${tab === "schedule" ? " sel" : ""}`}
          onClick={() => select("schedule")}
        >
          Schedule
        </button>
      </div>
      <div className="pubpanel" role="tabpanel" hidden={tab !== "about"}>
        {about}
      </div>
      <div className="pubpanel" role="tabpanel" hidden={tab !== "schedule"}>
        {schedule}
      </div>
    </>
  );
}
