"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { adminAddStudio, adminSendMagicLink } from "@/app/actions/admin";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

type Coach = {
  id: string;
  name: string;
  handle: string;
  email: string;
  joined: string | null;
  lastSeen: string | null;
  onboarded: boolean;
  classCount: number;
  subCount: number;
  hasPassword: boolean;
  hasPasskey: boolean;
  hasGoogle: boolean;
};
type Studio = {
  id: string;
  name: string;
  address: string;
  added: string | null;
  coachCount: number;
  classCount: number;
};
type Stats = { coaches: number; studios: number; classes: number; subscribers: number; newThisWeek: number };

export function AdminPanel({
  adminEmail,
  coaches,
  studios,
  stats,
}: {
  adminEmail: string;
  coaches: Coach[];
  studios: Studio[];
  stats: Stats;
}) {
  const [tab, setTab] = useState<"coaches" | "studios">("coaches");
  const [q, setQ] = useState("");
  const [toastMsg, toastOn, toast] = useToast();

  const shownCoaches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return coaches;
    return coaches.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.email.toLowerCase().includes(s) ||
        c.handle.toLowerCase().includes(s),
    );
  }, [coaches, q]);

  const shownStudios = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return studios;
    return studios.filter(
      (st) => st.name.toLowerCase().includes(s) || st.address.toLowerCase().includes(s),
    );
  }, [studios, q]);

  return (
    <section className="screen admin">
      <div className="pad">
        <div className="admintop">
          <div>
            <h1>Admin</h1>
            <p className="adminsub">Signed in as {adminEmail}</p>
          </div>
          <Link className="adminback" href="/app">
            <Icon name="arrow_back" size={18} /> App
          </Link>
        </div>

        <div className="adminstats">
          <Stat n={stats.coaches} label="Coaches" />
          <Stat n={stats.studios} label="Studios" />
          <Stat n={stats.classes} label="Classes" />
          <Stat n={stats.subscribers} label="Subscribers" />
          <Stat n={stats.newThisWeek} label="New this week" />
        </div>

        <div className="adminseg">
          <button className={tab === "coaches" ? "on" : ""} onClick={() => { setTab("coaches"); setQ(""); }}>
            Coaches
          </button>
          <button className={tab === "studios" ? "on" : ""} onClick={() => { setTab("studios"); setQ(""); }}>
            Studios
          </button>
        </div>

        <div className="searchbox adminsearch">
          <span className="mag"><Icon name="search" size={17} /></span>
          <input
            type="text"
            placeholder={tab === "coaches" ? "Search name, email, or handle" : "Search studios"}
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {tab === "coaches" ? (
          <div className="admincards">
            {shownCoaches.map((c) => (
              <CoachCard key={c.id} c={c} toast={toast} />
            ))}
            {!shownCoaches.length && <p className="adminempty">No coaches match.</p>}
          </div>
        ) : (
          <>
            <AddStudio toast={toast} />
            <div className="admincards">
              {shownStudios.map((s) => (
                <div key={s.id} className="admincard">
                  <div className="admincard-h">
                    <span className="admincard-nm">{s.name}</span>
                  </div>
                  <div className="admincard-sub">{s.address}</div>
                  <div className="adminmeta">
                    <span>{s.coachCount} {s.coachCount === 1 ? "coach" : "coaches"}</span>
                    <span>{s.classCount} {s.classCount === 1 ? "class" : "classes"}</span>
                    {s.added && <span>added {s.added}</span>}
                  </div>
                </div>
              ))}
              {!shownStudios.length && <p className="adminempty">No studios match.</p>}
            </div>
          </>
        )}
      </div>
      <Toast msg={toastMsg} on={toastOn} />
    </section>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="adminstat">
      <span className="adminstat-n">{n}</span>
      <span className="adminstat-l">{label}</span>
    </div>
  );
}

function CoachCard({ c, toast }: { c: Coach; toast: (m: string) => void }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  const sendLink = () =>
    start(async () => {
      const res = await adminSendMagicLink(c.email);
      if (!res.ok) {
        toast(res.error ?? "Couldn't create a link");
        return;
      }
      setLink(res.url ?? null);
      toast(res.emailed ? `Emailed a sign-in link to ${c.email}` : "Link created");
    });

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied");
    } catch {
      toast("Copy failed - long-press to select");
    }
  };

  return (
    <div className="admincard">
      <div className="admincard-h">
        <span className="admincard-nm">{c.name}</span>
        {c.handle ? (
          <Link className="admincard-tag" href={`/${c.handle}`} target="_blank">
            /{c.handle}
          </Link>
        ) : (
          <span className="admincard-tag muted">no page</span>
        )}
      </div>
      <div className="admincard-sub">{c.email}</div>
      <div className="adminmeta">
        {c.joined && <span>joined {c.joined}</span>}
        <span>last seen {c.lastSeen ?? "never"}</span>
        <span>{c.classCount} {c.classCount === 1 ? "class" : "classes"}</span>
        <span>{c.subCount} subs</span>
      </div>
      <div className="adminbadges">
        {!c.onboarded && <span className="adminbadge warn">setup pending</span>}
        {c.hasPassword && <span className="adminbadge">password</span>}
        {c.hasPasskey && <span className="adminbadge">passkey</span>}
        {c.hasGoogle && <span className="adminbadge">google</span>}
      </div>
      {link ? (
        <div className="adminlink">
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn si" onClick={copy}>Copy</button>
        </div>
      ) : (
        <button className="btn ghost adminaction" disabled={pending} onClick={sendLink}>
          {pending ? "Creating…" : "Send sign-in link"}
        </button>
      )}
    </div>
  );
}

function AddStudio({ toast }: { toast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [addr, setAddr] = useState("");
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      const res = await adminAddStudio(name, addr);
      if (!res.ok) {
        toast(res.error ?? "Couldn't add studio");
        return;
      }
      setName("");
      setAddr("");
      setOpen(false);
      toast("Studio added");
    });

  if (!open) {
    return (
      <button className="btn si adminaddbtn" onClick={() => setOpen(true)}>
        + Add a studio
      </button>
    );
  }
  return (
    <div className="adminaddform">
      <input className="editinput" placeholder="Studio name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      <input className="editinput" style={{ marginTop: 8 }} placeholder="Address" value={addr} maxLength={160} onChange={(e) => setAddr(e.target.value)} />
      <div className="adminaddform-row">
        <button className="btn si" disabled={pending || !name.trim() || !addr.trim()} onClick={add}>
          {pending ? "Adding…" : "Add studio"}
        </button>
        <button className="linktoggle" onClick={() => { setOpen(false); setName(""); setAddr(""); }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
