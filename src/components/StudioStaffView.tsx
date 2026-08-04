"use client";

import { useState, useTransition } from "react";
import { addStudioManager, removeStudioManager, setRotaCoach } from "@/app/actions/gym";
import type { StudioStaffDto } from "@/app/actions/gym";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The studio's people, in two lists, because they are two different claims.
//
// Who runs the page holds the keys: they edit the details, they run the rota,
// and they can hand a set of keys to somebody else. Who is on the shift list
// takes the classes. The same person is usually both, and neither implies the
// other: an owner who never teaches still runs the page, and the coach who is
// there every morning has no business editing the address.
//
// Adding a manager used to be ours to do. A gym wanting its own second manager
// had to write in and ask, which is a strange thing to need a support ticket
// for when studio_managers is a join table precisely because a place of work
// has more than one person running it.
export function StudioStaffView({
  studioId,
  studioName,
  backHref,
  staff,
}: {
  studioId: string;
  studioName: string;
  backHref: string;
  staff: StudioStaffDto;
}) {
  const [managers, setManagers] = useState(staff.managers);
  const [inPool, setInPool] = useState<Record<string, boolean>>(
    Object.fromEntries(staff.pool.map((p) => [p.id, p.inPool])),
  );
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; name: string; isYou: boolean } | null>(null);
  const [, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const add = async () => {
    if (adding || !email.trim()) return;
    setAdding(true);
    const res = await addStudioManager(studioId, email);
    setAdding(false);
    if (!res.ok) {
      toast(res.error ?? "Couldn't add them");
      return;
    }
    setEmail("");
    // The row needs a name and the action knows it; rather than return one and
    // have two sources for the same list, ask the server for the page again.
    toast("They run this page now");
    start(() => {
      window.location.reload();
    });
  };

  const remove = (id: string) => {
    start(async () => {
      const res = await removeStudioManager(studioId, id);
      if (!res.ok) {
        toast(res.error ?? "Couldn't do that");
        return;
      }
      // Removing yourself takes the page away with it, so leave rather than
      // sit on a screen that is no longer yours.
      if (managers.find((m) => m.id === id)?.isYou) {
        window.location.href = backHref;
        return;
      }
      setManagers((prev) => prev.filter((m) => m.id !== id));
      toast("They no longer run this page");
    });
  };

  const togglePool = (id: string) => {
    const next = !inPool[id];
    setInPool((p) => ({ ...p, [id]: next }));
    start(async () => {
      const res = await setRotaCoach(studioId, id, next);
      if (!res.ok) {
        setInPool((p) => ({ ...p, [id]: !next }));
        toast(res.error ?? "Couldn't do that");
      }
    });
  };

  return (
    <div className="pad">
      <div className="admintop pagetop">
        <div>
          <h1>Staff</h1>
          <p className="adminsub">{studioName}</p>
        </div>
        <BackLink className="iconbtn acctclose" href={backHref} label="Back to the schedule">
          <Icon name="close" size={18} />
        </BackLink>
      </div>

      <h3 className="setgroup-h">Who runs this page</h3>
      <p className="staffnote">
        They can edit the studio&rsquo;s details, set who is on which shift, and add
        somebody else. Being handed the keys is not something to find out by accident, so
        they are told.
      </p>
      <div className="settingslist">
        {managers.map((m) => (
          <div key={m.id} className="setrow staffrow">
            <span className="setrow-txt">
              <span className="t">
                {m.name}
                {m.isYou && <span className="staffyou">You</span>}
              </span>
              <span className="s">{m.email}</span>
            </span>
            <button
              className="tertiary staffx"
              onClick={() => setConfirm({ id: m.id, name: m.name, isYou: m.isYou })}
            >
              {m.isYou ? "Leave" : "Remove"}
            </button>
          </div>
        ))}
      </div>
      <div className="staffadd">
        <input
          id="staffEmail"
          type="email"
          value={email}
          placeholder="their@email.com"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <button className="btn si staffaddbtn" disabled={adding || !email.trim()} onClick={add}>
          Add
        </button>
      </div>

      {/* The rota's own list. It waits for the schedule, because a shift list
          with no shifts on it is a question nobody asked. */}
      {staff.hasSchedule && (
        <>
          <h3 className="setgroup-h">Shift list</h3>
          <p className="staffnote">
            The coaches a shift can be handed to. Anyone can say they coach here; this list is
            you saying who takes these classes.
          </p>
          {staff.pool.length === 0 ? (
            <p className="adminempty">
              Nobody lists this studio yet. Coaches add it under Places I coach.
            </p>
          ) : (
            <div className="settingslist">
              {staff.pool.map((p) => (
                <button
                  key={p.id}
                  className="setrow"
                  role="switch"
                  aria-checked={!!inPool[p.id]}
                  onClick={() => togglePool(p.id)}
                >
                  <span className="setrow-txt">
                    <span className="t">{p.name}</span>
                  </span>
                  <span className={`switch${inPool[p.id] ? " on" : ""}`} aria-hidden="true">
                    <span className="switch-knob" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Handing the keys back is not a thing to do by mistyping a tap, so it
          asks first, the same shape removing a plan asks with. */}
      {confirm && (
        <div className="sheet-scrim" onClick={(e) => {
          if (e.target === e.currentTarget) setConfirm(null);
        }}>
          <div className="sheet confirmsheet">
            <h2>{confirm.isYou ? "Leave this page?" : `Remove ${confirm.name}?`}</h2>
            <p className="lead">
              {confirm.isYou
                ? "You will not be able to edit the studio or its shifts, and you would need one of the others to add you back."
                : "They will not be able to edit the studio or its shifts. Nothing tells them."}
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                onClick={() => {
                  const id = confirm.id;
                  setConfirm(null);
                  remove(id);
                }}
              >
                {confirm.isYou ? "Leave" : `Remove ${confirm.name}`}
              </button>
              <button
                className="btn ghost"
                style={{ marginTop: 8 }}
                onClick={() => setConfirm(null)}
              >
                {confirm.isYou ? "Stay" : "Keep them"}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}
