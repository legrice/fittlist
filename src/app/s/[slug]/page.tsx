import type { Metadata } from "next";
import { eq, inArray, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { siteOrigin } from "@/lib/format";
import { fansVisible } from "@/lib/flags";
import { avatarColor } from "@/lib/avatar";
import { viewerLook } from "@/lib/look";
import { getSessionUserId } from "@/lib/session";
import { mapsUrlFor } from "@/lib/studio";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { InstagramGlyph } from "@/components/InstagramGlyph";
import { StudioFeedback } from "@/components/StudioFeedback";
import { StudioOwnerBar } from "@/components/StudioOwnerBar";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
};

// Slug is the address; the id still resolves, so links made before slugs (and
// anything holding a raw id) keep working.
async function findStudio(slug: string) {
  const db = await getDb();
  const [s] = await db
    .select()
    .from(schema.studios)
    .where(
      UUID_RE.test(slug)
        ? or(eq(schema.studios.slug, slug), eq(schema.studios.id, slug))
        : eq(schema.studios.slug, slug),
    );
  return s;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = await findStudio(slug);
  if (!s) return { title: "fittlist" };
  const title = `${s.name} · fittlist`;
  const description = s.about?.trim() || `${s.name}, ${s.address}`;
  return {
    title,
    description,
    alternates: { canonical: `${siteOrigin()}/s/${s.slug ?? s.id}` },
    openGraph: {
      title,
      description,
      url: `${siteOrigin()}/s/${s.slug ?? s.id}`,
      siteName: "fittlist",
      images: s.photo ? [{ url: s.photo }] : undefined,
    },
  };
}

// A studio's own page, built on the coach profile layout: photo, name, what
// kind of gym it is, where it is, about, and how to reach it.
export default async function StudioPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { from } = await searchParams;
  const s = await findStudio(slug);
  if (!s) notFound();

  const db = await getDb();
  // Like a class page: no app header, no bottom tabs. A signed-in viewer gets
  // a way back; a coach also gets the edit button, because the directory is
  // shared and anyone can correct an entry.
  let signedIn = false;
  let canEdit = false;
  if (await fansVisible()) {
    const viewerId = await getSessionUserId();
    if (viewerId) {
      const [viewer] = await db
        .select({ kind: schema.users.kind })
        .from(schema.users)
        .where(eq(schema.users.id, viewerId));
      if (viewer) {
        signedIn = true;
        // A coach is kind, never handle: members claim handles too, and the
        // handle test put the edit button on every member's screen.
        canEdit = viewer.kind !== "fan";
      }
    }
  }

  // A tab we know by name gets a named destination; anything else walks back
  // through history, which is where they actually tapped from.
  const backTo =
    from === "discover"
      ? { href: "/discover", label: "Back to Discover" }
      : from === "home"
        ? { href: "/feed", label: "Back to Following" }
        : from === "schedule"
          ? { href: "/app", label: "Back to your schedule" }
          : null;

  const hasContact = !!(s.contactEmail || s.phone || s.website || s.instagram);

  // Who teaches here: everyone who picked this studio in setup or has a class
  // at it. The same union the coach profile uses for "Where I coach", from the
  // other end.
  const [picked, classRows] = await Promise.all([
    db
      .select({ userId: schema.coachStudios.userId })
      .from(schema.coachStudios)
      .where(eq(schema.coachStudios.studioId, s.id)),
    db
      .select({ userId: schema.classes.userId })
      .from(schema.classes)
      .where(eq(schema.classes.studioId, s.id)),
  ]);
  const coachIds = [...new Set([...picked.map((p) => p.userId), ...classRows.map((c) => c.userId)])];
  const coachRows = coachIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, coachIds))
    : [];
  const coaches = coachRows
    .filter((u) => u.kind !== "fan" && !!u.handle)
    .map((u) => ({
      id: u.id,
      handle: u.handle!,
      name: u.name,
      title: u.title ?? "",
      photo: u.photo,
      color: avatarColor(u),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="pub profile" data-mode={await viewerLook()}>
      <div className="profwrap">
        {/* Back, name and the one action ride together and stay pinned. */}
        <div className="pubhead">
          {signedIn && (
            <BackLink className="evback" href={backTo?.href} label={backTo?.label ?? "Back"}>
              <Icon name="arrow_back" size={21} />
            </BackLink>
          )}
          <div className="pubhead-row">
          <h1 className="profname">{s.name}</h1>
          {canEdit && (
            <StudioOwnerBar
              id={s.id}
              name={s.name}
              address={s.address}
              types={s.types}
              about={s.about ?? ""}
              photo={s.photo}
              contactEmail={s.contactEmail ?? ""}
              phone={s.phone ?? ""}
              website={s.website ?? ""}
              instagram={s.instagram ?? ""}
            />
          )}
          </div>
        </div>
        {s.types.length > 0 && (
          <div className="studiotypes">
            {s.types.map((t) => (
              <span key={t} className="studiotype">
                {t}
              </span>
            ))}
          </div>
        )}

        {s.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="profphoto" src={s.photo} alt={s.name} />
        ) : (
          <div className="profphoto profphoto-empty" aria-hidden="true">
            <Icon name="place" size={64} />
          </div>
        )}

        {s.about?.trim() && <p className="profabout">{s.about}</p>}

        <div className="profstudios">
          <h2 className="prof-sec-h">Where it is</h2>
          <a
            className="profstudio"
            href={mapsUrlFor(s)}
            target="_blank"
            rel="noopener nofollow"
          >
            <span className="profstudio-ic">
              <Icon name="place" size={20} />
            </span>
            <span className="profstudio-txt">
              <span className="nm">{s.address}</span>
              <span className="ad">Get directions</span>
            </span>
          </a>
        </div>

        {coaches.length > 0 && (
          <div className="profstudios">
            <h2 className="prof-sec-h">Coaches here</h2>
            {coaches.map((c) => (
              <Link key={c.id} className="coachstudio" href={`/${c.handle}`}>
                {c.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="coachstudio-av" src={c.photo} alt="" />
                ) : (
                  <span
                    className="coachstudio-av coachstudio-av-empty"
                    style={{ background: c.color }}
                    aria-hidden="true"
                  >
                    {(c.name.trim().charAt(0) || "?").toUpperCase()}
                  </span>
                )}
                <span className="coachstudio-txt">
                  <span className="nm">{c.name}</span>
                  {c.title && <span className="ad">{c.title}</span>}
                </span>
                <span className="coachstudio-chev">
                  <Icon name="chevron_right" size={18} />
                </span>
              </Link>
            ))}
          </div>
        )}

        {hasContact && (
          <>
            <h2 className="prof-sec-h sched-h">Contact</h2>
            <div className="contactlist">
              {s.contactEmail && (
                <a className="proflink" href={`mailto:${s.contactEmail}`}>
                  <Icon name="mail" size={18} /> Email
                </a>
              )}
              {s.phone && (
                <a className="proflink" href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>
                  <Icon name="call" size={18} /> Call
                </a>
              )}
              {s.instagram && (
                <a
                  className="proflink"
                  href={`https://instagram.com/${s.instagram}`}
                  target="_blank"
                  rel="noopener nofollow"
                >
                  <InstagramGlyph /> Instagram
                </a>
              )}
              {s.website && (
                <a className="proflink" href={s.website} target="_blank" rel="noopener nofollow">
                  <Icon name="public" size={18} /> Website
                </a>
              )}
            </div>
          </>
        )}

        {/* The correction doors. Suggest an edit is for anyone, because the
            owner probably has no account; Report needs one, like classes. */}
        <StudioFeedback studioId={s.id} signedIn={signedIn} />

        {!signedIn && (
          <div className="madewith">
            Made with <Wordmark variant="ink" className="mw-logo" />. Coach classes?{" "}
            <Link href="/">Claim your page</Link>
          </div>
        )}
      </div>
    </div>
  );
}
