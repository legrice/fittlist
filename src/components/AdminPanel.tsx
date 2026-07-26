"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  adminActOnRequest,
  adminAddStudio,
  adminDeleteStudio,
  adminDeleteUser,
  adminInvite,
  adminSendMagicLink,
} from "@/app/actions/admin";
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
type Invite = {
  id: string;
  email: string;
  label: string;
  invited: string | null;
  accepted: boolean;
  acceptedOn: string | null;
  acceptedName: string;
  acceptedHandle: string;
};
type Request = { id: string; name: string; email: string; requested: string | null };
type Stats = {
  coaches: number;
  studios: number;
  classes: number;
  subscribers: number;
  newThisWeek: number;
  pendingInvites: number;
  requests: number;
};

export function AdminPanel({
  adminEmail,
  coaches,
  studios,
  invites,
  requests,
  stats,
}: {
  adminEmail: string;
  coaches: Coach[];
  studios: Studio[];
  invites: Invite[];
  requests: Request[];
  stats: Stats;
}) {
  const [tab, setTab] = useState<"coaches" | "studios" | "invites">("coaches");
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

  const shownInvites = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return invites;
    return invites.filter(
      (i) => i.email.toLowerCase().includes(s) || i.label.toLowerCase().includes(s),
    );
  }, [invites, q]);

  const searchPlaceholder =
    tab === "coaches" ? "Search name, email, or handle" : tab === "studios" ? "Search studios" : "Search invites";

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
          <Stat n={stats.pendingInvites} label="Invites pending" />
          <Stat n={stats.requests} label="Requests" />
        </div>

        <div className="adminseg">
          <button className={tab === "coaches" ? "on" : ""} onClick={() => { setTab("coaches"); setQ(""); }}>
            Coaches
          </button>
          <button className={tab === "invites" ? "on" : ""} onClick={() => { setTab("invites"); setQ(""); }}>
            Invites
          </button>
          <button className={tab === "studios" ? "on" : ""} onClick={() => { setTab("studios"); setQ(""); }}>
            Studios
          </button>
        </div>

        <div className="searchbox adminsearch">
          <span className="mag"><Icon name="search" size={17} /></span>
          <input
            type="text"
            placeholder={searchPlaceholder}
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {tab === "coaches" ? (
          <div className="admincards">
            {shownCoaches.map((c) => (
              <CoachCard key={c.id} c={c} toast={toast} adminEmail={adminEmail} />
            ))}
            {!shownCoaches.length && <p className="adminempty">No coaches match.</p>}
          </div>
        ) : tab === "invites" ? (
          <>
            {requests.length > 0 && (
              <>
                <div className="adminsec-h">Requests ({requests.length})</div>
                <div className="admincards" style={{ marginBottom: 18 }}>
                  {requests.map((r) => (
                    <RequestCard key={r.id} r={r} toast={toast} />
                  ))}
                </div>
                <div className="adminsec-h">Invite a coach</div>
              </>
            )}
            <InviteForm toast={toast} />
            <div className="admincards">
              {shownInvites.map((i) => (
                <InviteCard key={i.id} i={i} toast={toast} />
              ))}
              {!shownInvites.length && <p className="adminempty">No invites yet. Invite a coach above.</p>}
            </div>
          </>
        ) : (
          <>
            <AddStudio toast={toast} />
            <div className="admincards">
              {shownStudios.map((s) => (
                <StudioCard key={s.id} s={s} toast={toast} />
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

function CoachCard({
  c,
  toast,
  adminEmail,
}: {
  c: Coach;
  toast: (m: string) => void;
  adminEmail: string;
}) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const isSelf = c.email.toLowerCase() === adminEmail.toLowerCase();

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

  const del = () =>
    start(async () => {
      const res = await adminDeleteUser(c.id);
      if (!res.ok) {
        toast(res.error ?? "Couldn't delete");
        setConfirmDel(false);
        return;
      }
      toast(`Deleted ${c.name}`);
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
      {c.handle ? (
        <Link className="admincard-h admincard-h-link" href={`/${c.handle}`} target="_blank">
          <span className="admincard-nm">{c.name}</span>
          <span className="admincard-tag">
            /{c.handle} <Icon name="open_in_new" size={13} />
          </span>
        </Link>
      ) : (
        <div className="admincard-h">
          <span className="admincard-nm">{c.name}</span>
          <span className="admincard-tag muted">no page</span>
        </div>
      )}
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
      {!isSelf &&
        (confirmDel ? (
          <div className="admindanger">
            <p>Delete {c.name} and all their classes, subscribers, and data? This can&rsquo;t be undone.</p>
            <div className="adminaddform-row">
              <button className="btn si" disabled={pending} onClick={del}>
                {pending ? "Deleting…" : "Yes, delete"}
              </button>
              <button className="linktoggle" disabled={pending} onClick={() => setConfirmDel(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="adminremove" onClick={() => setConfirmDel(true)}>
            Delete user
          </button>
        ))}
    </div>
  );
}

function RequestCard({ r, toast }: { r: Request; toast: (m: string) => void }) {
  const [pending, start] = useTransition();
  const act = (action: "invite" | "dismiss") =>
    start(async () => {
      const res = await adminActOnRequest(r.id, action);
      if (!res.ok) {
        toast(res.error ?? "Something went wrong");
        return;
      }
      toast(action === "invite" ? `Invited ${r.email}` : "Request dismissed");
    });

  return (
    <div className="admincard">
      <div className="admincard-h">
        <span className="admincard-nm">{r.name || r.email}</span>
        <span className="adminbadge warn">request</span>
      </div>
      {r.name && <div className="admincard-sub">{r.email}</div>}
      <div className="adminmeta">{r.requested && <span>requested {r.requested}</span>}</div>
      <div className="adminaddform-row" style={{ marginTop: 12 }}>
        <button className="btn si" disabled={pending} onClick={() => act("invite")}>
          {pending ? "…" : "Invite"}
        </button>
        <button className="linktoggle" disabled={pending} onClick={() => act("dismiss")}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function InviteForm({ toast }: { toast: (m: string) => void }) {
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  const invite = () =>
    start(async () => {
      const res = await adminInvite(email, label);
      if (!res.ok) {
        toast(res.error ?? "Couldn't send the invite");
        return;
      }
      setLink(res.url ?? null);
      toast(`Invited ${email}`);
      setEmail("");
      setLabel("");
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
    <div className="adminaddform">
      <input
        className="editinput"
        type="email"
        placeholder="coach@example.com"
        autoCapitalize="none"
        autoCorrect="off"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="editinput"
        style={{ marginTop: 8 }}
        placeholder="Note (name, gym) — optional"
        value={label}
        maxLength={120}
        onChange={(e) => setLabel(e.target.value)}
      />
      <div className="adminaddform-row">
        <button className="btn si" disabled={pending || !email.trim()} onClick={invite}>
          {pending ? "Inviting…" : "Invite & email link"}
        </button>
      </div>
      {link && (
        <div className="adminlink" style={{ marginTop: 12 }}>
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn si" onClick={copy}>Copy</button>
        </div>
      )}
    </div>
  );
}

function InviteCard({ i, toast }: { i: Invite; toast: (m: string) => void }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  const resend = () =>
    start(async () => {
      const res = await adminSendMagicLink(i.email);
      if (!res.ok) {
        toast(res.error ?? "Couldn't create a link");
        return;
      }
      setLink(res.url ?? null);
      toast(`Re-sent a link to ${i.email}`);
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
        <span className="admincard-nm">{i.email}</span>
        {i.accepted ? (
          <span className="adminbadge">joined</span>
        ) : (
          <span className="adminbadge warn">pending</span>
        )}
      </div>
      {i.label && <div className="admincard-sub">{i.label}</div>}
      <div className="adminmeta">
        {i.invited && <span>invited {i.invited}</span>}
        {i.accepted ? (
          <span>
            {i.acceptedHandle ? `joined as /${i.acceptedHandle}` : "joined"}
            {i.acceptedOn ? ` ${i.acceptedOn}` : ""}
          </span>
        ) : (
          <span>not signed up yet</span>
        )}
      </div>
      {!i.accepted &&
        (link ? (
          <div className="adminlink">
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn si" onClick={copy}>Copy</button>
          </div>
        ) : (
          <button className="btn ghost adminaction" disabled={pending} onClick={resend}>
            {pending ? "Creating…" : "Resend link"}
          </button>
        ))}
    </div>
  );
}

function StudioCard({ s, toast }: { s: Studio; toast: (m: string) => void }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const removable = s.coachCount === 0 && s.classCount === 0;

  const remove = () =>
    start(async () => {
      const res = await adminDeleteStudio(s.id);
      if (!res.ok) {
        toast(res.error ?? "Couldn't remove");
        setConfirming(false);
        return;
      }
      toast("Studio removed");
    });

  return (
    <div className="admincard">
      <div className="admincard-h">
        <span className="admincard-nm">{s.name}</span>
      </div>
      <div className="admincard-sub">{s.address}</div>
      <div className="adminmeta">
        <span>{s.coachCount} {s.coachCount === 1 ? "coach" : "coaches"}</span>
        <span>{s.classCount} {s.classCount === 1 ? "class" : "classes"}</span>
        {s.added && <span>added {s.added}</span>}
      </div>
      {removable &&
        (confirming ? (
          <div className="adminaddform-row" style={{ marginTop: 10 }}>
            <button className="btn si" disabled={pending} onClick={remove}>
              {pending ? "Removing…" : "Remove studio"}
            </button>
            <button className="linktoggle" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="adminremove" onClick={() => setConfirming(true)}>
            Remove
          </button>
        ))}
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
