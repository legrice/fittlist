"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  adminActOnRequest,
  adminAddStudio,
  adminDeleteStudio,
  adminBroadcast,
  adminDeleteUser,
  adminFixLocations,
  adminInvite,
  adminDeleteInvite,
  adminSendMagicLink,
  adminSetKind,
} from "@/app/actions/admin";
import { dismissReports, type DuplicateSlot, type ReportedClass } from "@/app/actions/reports";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

type Person = {
  id: string;
  /** Which side of the app they're on. A handle doesn't say: members have
   *  those too, so this is the only thing that answers "is this a coach?". */
  kind: "coach" | "member";
  name: string;
  handle: string;
  email: string;
  joined: string | null;
  lastSeen: string | null;
  onboarded: boolean;
  classCount: number;
  /** People following them. */
  subCount: number;
  /** Coaches they follow. */
  followingCount: number;
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
  /** Who brought them in — empty for invites with no attribution. */
  invitedBy: string;
  invitedByAdmin: boolean;
};
type Referrer = { id: string; name: string; admin: boolean; sent: number; joined: number };
type Request = { id: string; name: string; email: string; requested: string | null };
type Stats = {
  coaches: number;
  members: number;
  studios: number;
  classes: number;
  subscribers: number;
  newThisWeek: number;
  pendingInvites: number;
  requests: number;
};

export function AdminPanel({
  adminEmail,
  reports,
  duplicates,
  people,
  studios,
  invites,
  referrers,
  requests,
  stats,
  dark = false,
}: {
  adminEmail: string;
  reports: ReportedClass[];
  duplicates: DuplicateSlot[];
  people: Person[];
  studios: Studio[];
  invites: Invite[];
  referrers: Referrer[];
  requests: Request[];
  stats: Stats;
  dark?: boolean;
}) {
  const [tab, setTab] = useState<"people" | "studios" | "invites" | "message" | "reports">("people");
  // The megaphone: a note from fittlist into people's Updates feeds.
  const [audience, setAudience] = useState<"everyone" | "coaches" | "members" | "one">("everyone");
  const [msgTarget, setMsgTarget] = useState("");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgBusy, setMsgBusy] = useState(false);
  const [msgDone, setMsgDone] = useState("");
  // Dismissed reports leave the list at once; the action's revalidate catches
  // the next load up.
  const [handled, setHandled] = useState<Record<string, boolean>>({});
  const [side, setSide] = useState<"all" | "coach" | "member">("all");
  const [q, setQ] = useState("");
  const [toastMsg, toastOn, toast] = useToast();

  const shownPeople = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = side === "all" ? people : people.filter((c) => c.kind === side);
    if (s) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(s) ||
          c.email.toLowerCase().includes(s) ||
          c.handle.toLowerCase().includes(s),
      );
    }
    return list;
  }, [people, q, side]);

  const shownStudios = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return studios;
    return studios.filter(
      (st) => st.name.toLowerCase().includes(s) || st.address.toLowerCase().includes(s),
    );
  }, [studios, q]);

  // Invites can be narrowed to who's set up a profile vs still sitting on the
  // invite ("joined" = the invite was accepted).
  const [inviteFilter, setInviteFilter] = useState<"all" | "joined" | "pending">("all");
  const shownInvites = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = invites;
    if (s) {
      list = list.filter(
        (i) =>
          i.email.toLowerCase().includes(s) ||
          i.label.toLowerCase().includes(s) ||
          i.invitedBy.toLowerCase().includes(s),
      );
    }
    if (inviteFilter === "joined") list = list.filter((i) => i.accepted);
    if (inviteFilter === "pending") list = list.filter((i) => !i.accepted);
    return list;
  }, [invites, q, inviteFilter]);

  const searchPlaceholder =
    tab === "people" ? "Search name, email, or handle" : tab === "studios" ? "Search studios" : "Search invites";

  return (
    <section className="screen admin" data-mode={dark ? "dark" : undefined}>
      <div className="pad">
        <div className="admintop">
          <div>
            <h1>Admin</h1>
            <p className="adminsub">Signed in as {adminEmail}</p>
          </div>
          <Link className="adminback" href="/feed">
            <Icon name="arrow_back" size={18} /> App
          </Link>
        </div>

        <div className="adminstats">
          <Stat n={stats.coaches} label="Coaches" />
          <Stat n={stats.members} label="Members" />
          <Stat n={stats.studios} label="Studios" />
          <Stat n={stats.classes} label="Classes" />
          <Stat n={stats.pendingInvites} label="Invites pending" />
          <Stat n={stats.requests} label="Requests" />
        </div>

        {/* Icons, not words: five labelled pills didn't fit a phone, and the
            admin is one person who knows what the glyphs mean. */}
        <div className="adminseg adminseg-icons">
          {(
            [
              { id: "people", icon: "groups", label: "People" },
              { id: "invites", icon: "person_add", label: "Invites" },
              { id: "studios", icon: "place", label: "Studios" },
              { id: "message", icon: "campaign", label: "Message" },
              { id: "reports", icon: "flag", label: "Reports" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "on" : ""}
              aria-label={t.label}
              title={t.label}
              onClick={() => {
                setTab(t.id);
                setQ("");
              }}
            >
              <Icon name={t.icon} size={20} />
              {t.id === "reports" && reports.length > 0 && (
                <span className="inboxdot">{reports.length > 9 ? "9+" : reports.length}</span>
              )}
            </button>
          ))}
        </div>

        {tab !== "message" && tab !== "reports" && (
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
        )}

        {tab === "message" && (
          <div className="admincard msgcard">
            <p className="lead">
              Lands in Updates, from fittlist, with the megaphone. One person, one side, or
              everyone. In-app only; nothing is emailed.
            </p>
            <div className="seg invitefilter">
              <button className={audience === "everyone" ? "sel" : ""} onClick={() => setAudience("everyone")}>
                Everyone
              </button>
              <button className={audience === "coaches" ? "sel" : ""} onClick={() => setAudience("coaches")}>
                Coaches
              </button>
              <button className={audience === "members" ? "sel" : ""} onClick={() => setAudience("members")}>
                Members
              </button>
              <button className={audience === "one" ? "sel" : ""} onClick={() => setAudience("one")}>
                One person
              </button>
            </div>
            {audience === "one" && (
              <input
                type="text"
                className="editinput"
                placeholder="Their handle or email"
                autoCapitalize="none"
                value={msgTarget}
                onChange={(e) => setMsgTarget(e.target.value)}
              />
            )}
            <label className="flabel" htmlFor="msgTitle">Title</label>
            <input
              id="msgTitle"
              type="text"
              className="editinput"
              maxLength={80}
              placeholder="Scheduled downtime tonight"
              value={msgTitle}
              onChange={(e) => setMsgTitle(e.target.value)}
            />
            <label className="flabel" htmlFor="msgBody">Message</label>
            <textarea
              id="msgBody"
              className="abouttext"
              rows={4}
              maxLength={500}
              placeholder="What they should know, in a sentence or two."
              value={msgBody}
              onChange={(e) => setMsgBody(e.target.value)}
            />
            {msgDone && <p className="adminsub" style={{ marginTop: 10 }}>{msgDone}</p>}
            <div className="publishwrap nostick">
              <button
                className="btn si"
                disabled={msgBusy || !msgTitle.trim()}
                onClick={() => {
                  setMsgBusy(true);
                  setMsgDone("");
                  adminBroadcast(audience, msgTarget, msgTitle, msgBody).then((res) => {
                    setMsgBusy(false);
                    if (!res.ok) {
                      setMsgDone(res.error ?? "Something went wrong.");
                      return;
                    }
                    setMsgDone(`Sent to ${res.sent} ${res.sent === 1 ? "person" : "people"}.`);
                    setMsgTitle("");
                    setMsgBody("");
                    setMsgTarget("");
                  });
                }}
              >
                {msgBusy ? "Sending…" : "Send it"}
              </button>
            </div>
          </div>
        )}

        {tab === "reports" && (
          <div className="reportlist">
            {reports.filter((r) => !handled[r.seriesId]).length === 0 ? (
              <div className="empty-block">
                <h2>Nothing reported</h2>
                <p>When someone flags a class as not right, it lands here, worst first.</p>
              </div>
            ) : (
              reports.filter((r) => !handled[r.seriesId]).map((r) => (
                <div key={r.seriesId} className="admincard">
                  <div className="admincard-h">
                    <span className="admincard-nm">
                      {r.className ?? "A deleted class"} · {r.coachName}
                    </span>
                    {/* Two or more people saying the same thing is the signal. */}
                    <span className={`reportcount${r.count > 1 ? " hot" : ""}`}>
                      {r.count} {r.count === 1 ? "report" : "reports"}
                    </span>
                  </div>
                  <p className="adminsub">{r.reasons.join(" · ")}</p>
                  {r.notes.length > 0 && <p className="adminsub">&ldquo;{r.notes[0]}&rdquo;</p>}
                  <p className="adminsub">By {r.reporters.join(", ")}</p>
                  <div className="admincard-actions">
                    {r.classHref && (
                      <a className="btn ghost" href={r.classHref} target="_blank" rel="noopener">
                        Open the class
                      </a>
                    )}
                    {r.coachHandle && (
                      <a className="btn ghost" href={`/${r.coachHandle}`} target="_blank" rel="noopener">
                        The coach
                      </a>
                    )}
                    <button
                      className="btn ghost"
                      onClick={() => {
                        setHandled((h) => ({ ...h, [r.seriesId]: true }));
                        dismissReports(r.seriesId);
                      }}
                    >
                      Handled
                    </button>
                  </div>
                </div>
              ))
            )}
            {duplicates.length > 0 && (
              <>
                <h2 className="brandh" style={{ marginTop: 10 }}>Possible duplicates</h2>
                <p className="adminsub">
                  The same studio, day and time under two accounts. That&rsquo;s what a
                  member-recreated class looks like from here.
                </p>
                {duplicates.map((d, i) => (
                  <div key={i} className="admincard">
                    <div className="admincard-h">
                      <span className="admincard-nm">
                        {d.studioName} · {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d.day]} {d.startTime}
                      </span>
                    </div>
                    {d.entries.map((e, j) => (
                      <p key={j} className="adminsub">
                        {e.className} · {e.coachName}
                        {e.href && (
                          <>
                            {" "}
                            <a href={e.href} target="_blank" rel="noopener">open</a>
                          </>
                        )}
                      </p>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab === "message" || tab === "reports" ? null : tab === "people" ? (
          <>
            {/* Both sides live in one table, so this is the only place the
                difference shows without reading every card. */}
            <div className="seg invitefilter">
              <button className={side === "all" ? "sel" : ""} onClick={() => setSide("all")}>
                All ({people.length})
              </button>
              <button className={side === "coach" ? "sel" : ""} onClick={() => setSide("coach")}>
                Coaches ({stats.coaches})
              </button>
              <button className={side === "member" ? "sel" : ""} onClick={() => setSide("member")}>
                Members ({stats.members})
              </button>
            </div>
            <FixLocations toast={toast} />
            <div className="admincards">
              {shownPeople.map((c) => (
                <PersonCard key={c.id} c={c} toast={toast} adminEmail={adminEmail} />
              ))}
              {!shownPeople.length && <p className="adminempty">Nobody matches.</p>}
            </div>
          </>
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
            {referrers.length > 0 && (
              <>
                <div className="adminsec-h">Where they came from</div>
                <div className="reflist">
                  {referrers.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="refrow"
                      onClick={() => {
                        setQ(r.name);
                        setInviteFilter("all");
                      }}
                    >
                      <span className="refrow-nm">
                        {r.name}
                        {r.admin && <span className="adminbadge">you</span>}
                      </span>
                      <span className="refrow-n">
                        <b>{r.joined}</b> joined
                        <span className="sep">/</span>
                        {r.sent} invited
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="seg invitefilter">
              <button className={inviteFilter === "all" ? "sel" : ""} onClick={() => setInviteFilter("all")}>
                All ({invites.length})
              </button>
              <button className={inviteFilter === "joined" ? "sel" : ""} onClick={() => setInviteFilter("joined")}>
                Joined ({invites.filter((i) => i.accepted).length})
              </button>
              <button
                className={inviteFilter === "pending" ? "sel" : ""}
                onClick={() => setInviteFilter("pending")}
              >
                Pending ({invites.filter((i) => !i.accepted).length})
              </button>
            </div>
            <div className="admincards">
              {shownInvites.map((i) => (
                <InviteCard key={i.id} i={i} toast={toast} />
              ))}
              {!shownInvites.length && (
                <p className="adminempty">
                  {invites.length ? "No invites match." : "No invites yet. Invite a coach above."}
                </p>
              )}
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

// The one-tap version of scripts/fix-locations.mjs.
//
// Locations written before normalization existed still show up as their own
// chips in Discover, and the fix is a script the admin can't run from a phone.
// Same code, a button instead. It prints what it rewrote so it's obvious what
// happened, and names anyone it couldn't place rather than guessing.
function FixLocations({ toast }: { toast: (m: string) => void }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{
    changed: { from: string; to: string }[];
    stuck: { email: string; location: string }[];
  } | null>(null);

  const run = () =>
    start(async () => {
      const r = await adminFixLocations();
      if (!r.ok) {
        toast(r.error ?? "Couldn't tidy locations");
        return;
      }
      const changed = r.changed ?? [];
      const stuck = r.stuck ?? [];
      setRes({ changed, stuck });
      toast(
        changed.length
          ? `Rewrote ${changed.length} ${changed.length === 1 ? "location" : "locations"}`
          : "Nothing to change",
      );
    });

  if (!res) {
    return (
      <button className="btn ghost adminaddbtn" disabled={pending} onClick={run}>
        {pending ? "Tidying…" : "Tidy up locations"}
      </button>
    );
  }

  return (
    <div className="adminaddform">
      <div className="adminsec-h">Locations</div>
      {!res.changed.length && !res.stuck.length && (
        <p className="fixnote">Every location is already in the same shape.</p>
      )}
      {res.changed.length > 0 && (
        <div className="fixlist">
          {res.changed.map((c, i) => (
            <div className="fixrow" key={`${c.from}>${c.to}>${i}`}>
              <span className="fixrow-was">{c.from}</span>
              <span className="fixrow-ar">→</span>
              <span className="fixrow-now">{c.to}</span>
            </div>
          ))}
        </div>
      )}
      {res.stuck.length > 0 && (
        <>
          <p className="fixnote">
            These name a city with no state, and no city on the list matches, so they were
            left alone. They will sort themselves out the next time each person saves their
            profile.
          </p>
          <div className="fixlist">
            {res.stuck.map((s, i) => (
              <div className="fixrow" key={`${s.email}>${i}`}>
                <span className="fixrow-kept">{s.location}</span>
                <span className="fixrow-who">{s.email}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="adminaddform-row">
        <button className="btn si" disabled={pending} onClick={run}>
          {pending ? "Tidying…" : "Run again"}
        </button>
        <button className="linktoggle" disabled={pending} onClick={() => setRes(null)}>
          Done
        </button>
      </div>
    </div>
  );
}

function PersonCard({
  c,
  toast,
  adminEmail,
}: {
  c: Person;
  toast: (m: string) => void;
  adminEmail: string;
}) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  // Which side the card says they're on; flips in place when the admin flips it.
  const [kindShown, setKindShown] = useState(c.kind === "coach" ? "coach" : "member");
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
        {c.kind === "coach" && (
          <span>{c.classCount} {c.classCount === 1 ? "class" : "classes"}</span>
        )}
        <span>
          {c.kind === "coach"
            ? `${c.subCount} subs`
            : `following ${c.followingCount}`}
        </span>
      </div>
      <div className="adminbadges">
        {/* Which side they're on, first, because it changes what the rest of
            the card means: a member with 0 classes is normal, a coach with 0
            classes is someone who signed up and never posted. */}
        <span className={`adminbadge ${kindShown === "coach" ? "kind-coach" : "kind-member"}`}>
          {kindShown}
        </span>
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
      {!isSelf && (
        <button
          className="btn ghost adminaction"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const to = kindShown === "coach" ? "fan" : "coach";
              const res = await adminSetKind(c.id, to);
              if (!res.ok) {
                toast(res.error ?? "Couldn't change that");
                return;
              }
              setKindShown(to === "fan" ? "member" : "coach");
              toast(
                to === "fan"
                  ? `${c.name} is a member now; their public classes are unpublished`
                  : `${c.name} is a coach now`,
              );
            })
          }
        >
          {kindShown === "coach" ? "Make them a member" : "Make them a coach"}
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
        placeholder="Optional note: name, gym"
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
  const [gone, setGone] = useState(false);

  const removeInvite = () =>
    start(async () => {
      const res = await adminDeleteInvite(i.id);
      if (!res.ok) {
        toast(res.error ?? "Couldn't delete that");
        return;
      }
      setGone(true);
      toast(`Deleted the invite for ${i.email}`);
    });

  if (gone) return null;

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
        {/* Pending only: an accepted invite is the referral record. */}
        {!i.accepted && (
          <button
            className="disblock"
            aria-label={`Delete the invite for ${i.email}`}
            disabled={pending}
            onClick={removeInvite}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
      {i.label && <div className="admincard-sub">{i.label}</div>}
      <div className="adminmeta">
        {i.invited && <span>invited {i.invited}</span>}
        {i.invitedBy && <span>by {i.invitedByAdmin ? "you" : i.invitedBy}</span>}
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
