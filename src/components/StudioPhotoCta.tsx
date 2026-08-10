"use client";

import { useState } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { StudioOwnerBar, type StudioEditProps } from "@/components/StudioOwnerBar";

/**
 * The photo button on a studio's colour hero: the same white circle a
 * person's own colour hero wears, offered to anyone allowed through the
 * editor (a manager on a claimed page, any coach on the commons), because
 * a coach who teaches there is exactly who has a picture of the room. It
 * opens the ordinary studio editor behind the same word about care the
 * dots menu gives (kept word for word with StudioMenu's copy), since an
 * edit here is an edit like any other.
 */
export function StudioPhotoCta({ studio }: { studio: StudioEditProps }) {
  const [mindful, setMindful] = useState(false);
  const [edit, setEdit] = useState(false);
  return (
    <>
      <button className="herocta" aria-label="Add a photo" onClick={() => setMindful(true)}>
        <Icon name="image" size={24} />
      </button>
      <BodyPortal>
        {mindful && (
          <div
            className="sheet-scrim"
            onClick={(e) => {
              if (e.target === e.currentTarget) setMindful(false);
            }}
          >
            <div className="sheet confirmsheet">
              <h2>Before you edit</h2>
              <p className="lead">
                This page is shared: every coach and member who relies on it sees what you
                save. Edits go live at once and are logged with your name. Make the page
                more true than you found it, and leave the rest alone.
              </p>
              <div className="publishwrap nostick">
                <button
                  className="btn si"
                  onClick={() => {
                    setMindful(false);
                    setEdit(true);
                  }}
                >
                  Continue to edit
                </button>
              </div>
              <button className="tertiary tellsheet-done" onClick={() => setMindful(false)}>
                Not now
              </button>
            </div>
          </div>
        )}
        <StudioOwnerBar open={edit} onClose={() => setEdit(false)} {...studio} />
      </BodyPortal>
    </>
  );
}
