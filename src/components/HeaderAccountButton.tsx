import Link from "next/link";

type HeaderFace = { photo: string | null; color: string; initial: string };

export function HeaderAccountButton({
  face,
  unread = false,
  fallbackHref = "/you",
}: {
  face?: HeaderFace;
  unread?: boolean;
  fallbackHref?: string;
}) {
  return (
    <Link
      className="brandbar-avatar"
      href={fallbackHref}
      aria-label={`Open your profile${unread ? ", new activity" : ""}`}
    >
      {face?.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={face.photo} alt="" />
      ) : (
        <span style={{ background: face?.color ?? "var(--color-surface-muted)" }}>{face?.initial ?? "?"}</span>
      )}
      {unread && <i aria-hidden="true" />}
    </Link>
  );
}
