"use client";

import { useState } from "react";

// Teaching or going, on a coach's own page.
//
// A coach wears two hats and their page only ever showed one of them, which
// made "where do you train" a question their own profile could not answer.
// The segment is the same underline-tab drawing the profile's own sections
// wear, one level down.
//
// Both panels are rendered on the server and handed here as nodes: the going
// half is gated on a mutual follow and drawing it at all is a decision the
// server has already made, so this only ever chooses which of two finished
// things to show. It is never rendered when the viewer cannot see the going
// half, because a segment whose second option is always empty is a control
// that teaches somebody the page is bigger than it is.
export function ProfileWeekSwitch({
  teaching,
  going,
}: {
  teaching: React.ReactNode;
  going: React.ReactNode;
}) {
  const [tab, setTab] = useState<"teaching" | "going">("teaching");
  return (
    <>
      {/* A segmented control, not a second row of the profile's own underline
          tabs: two rows of the same species stacked is the "pills on pills"
          mistake wearing a different coat, and it would make `.pubtab` mean
          two levels at once on one screen. This is the same `.seg` the share
          editor uses for the same question. */}
      <div className="share-toggles profweeksw">
        <div className="seg">
          <button
            className={tab === "teaching" ? "sel" : ""}
            onClick={() => setTab("teaching")}
          >
            Teaching
          </button>
          <button className={tab === "going" ? "sel" : ""} onClick={() => setTab("going")}>
            Going
          </button>
        </div>
      </div>
      {tab === "teaching" ? teaching : going}
    </>
  );
}
