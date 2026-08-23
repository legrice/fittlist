"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { loadFollowingDirectory } from "@/app/actions/following-directory";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { toggleStudioVisit } from "@/app/actions/endorsements";
import { toggleGroupFavorite } from "@/app/actions/groups";
import { Icon } from "@/components/Icon";
import type {
  FollowingDirectoryData,
  FollowingDirectoryEntity,
} from "@/lib/following-directory";

type DirectoryTab = "following" | "discover";

export function FollowingDirectory({ data }: { data: FollowingDirectoryData }) {
  const [tab, setTab] = useState<DirectoryTab>("following");
  const [entities, setEntities] = useState(data.entities);
  const [loaded, setLoaded] = useState<Record<DirectoryTab, boolean>>({ following: true, discover: false });
  const [limits, setLimits] = useState<Record<DirectoryTab, number>>({ following: data.limit, discover: 0 });
  const [hasMore, setHasMore] = useState<Record<DirectoryTab, boolean>>({ following: data.hasMore, discover: false });
  const [loadFailed, setLoadFailed] = useState<Record<DirectoryTab, boolean>>({ following: false, discover: false });
  const [loading, startLoading] = useTransition();
  const visible = useMemo(
    () => entities.filter((entity) => tab === "following" ? entity.following : !entity.following),
    [entities, tab],
  );

  const loadTab = (nextTab: DirectoryTab, nextLimit: number) => {
    setLoadFailed((current) => ({ ...current, [nextTab]: false }));
    startLoading(async () => {
      try {
        const result = await loadFollowingDirectory(data.kind, nextTab, nextLimit);
        if (!result) {
          setLoadFailed((current) => ({ ...current, [nextTab]: true }));
          return;
        }
        setEntities((current) => {
          const merged = new Map(current.map((entity) => [`${entity.type}:${entity.id}`, entity]));
          for (const entity of result.entities) merged.set(`${entity.type}:${entity.id}`, entity);
          return [...merged.values()];
        });
        setLoaded((current) => ({ ...current, [nextTab]: true }));
        setLimits((current) => ({ ...current, [nextTab]: result.limit }));
        setHasMore((current) => ({ ...current, [nextTab]: result.hasMore }));
      } catch {
        setLoadFailed((current) => ({ ...current, [nextTab]: true }));
      }
    });
  };

  const selectTab = (nextTab: DirectoryTab) => {
    setTab(nextTab);
    if (!loaded[nextTab] && !loading) loadTab(nextTab, data.pageSize);
  };

  return (
    <section className="screen follow-directory-screen">
      <main className="follow-directory">
        <header className="follow-directory-head">
          <Link className="follow-directory-back" href="/you" aria-label="Back to profile">
            <Icon name="arrow_back" size={23} />
          </Link>
          <h1>{data.title}</h1>
          <span aria-hidden="true" />
        </header>

        <div className="follow-directory-tabs" role="tablist" aria-label={`${data.title} lists`}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "following"}
            className={tab === "following" ? "on" : ""}
            onClick={() => selectTab("following")}
          >
            Following
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "discover"}
            className={tab === "discover" ? "on" : ""}
            onClick={() => selectTab("discover")}
          >
            Discover
          </button>
        </div>

        {loading && !loaded[tab] ? (
          <div className="follow-directory-empty" aria-live="polite">
            <p>Loading {data.title.toLowerCase()}…</p>
          </div>
        ) : visible.length ? (
          <div className="follow-directory-list">
            {visible.map((entity) => (
              <FollowingDirectoryRow
                key={entity.id}
                entity={entity}
                onChange={(patch) => setEntities((current) => current.map((item) => (
                  item.id === entity.id && item.type === entity.type ? { ...item, ...patch } as FollowingDirectoryEntity : item
                )))}
              />
            ))}
            {hasMore[tab] && (
              <button
                type="button"
                className="follow-directory-more"
                disabled={loading}
                onClick={() => loadTab(tab, limits[tab] + data.pageSize)}
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        ) : (
          <div className="follow-directory-empty">
            <h2>{loadFailed[tab] ? "Couldn’t load this list" : tab === "following" ? `No ${data.title.toLowerCase()} followed yet` : `No more ${data.title.toLowerCase()} to discover`}</h2>
            <p>{loadFailed[tab] ? "Try again when your connection is ready." : tab === "following" ? "Profiles you follow will be easy to manage here." : "Check back as more profiles join FittList."}</p>
            {loadFailed[tab] && (
              <button type="button" className="follow-directory-more" onClick={() => loadTab(tab, Math.max(data.pageSize, limits[tab]))}>
                Try again
              </button>
            )}
          </div>
        )}
      </main>
    </section>
  );
}

function FollowingDirectoryRow({
  entity,
  onChange,
}: {
  entity: FollowingDirectoryEntity;
  onChange: (patch: Partial<FollowingDirectoryEntity>) => void;
}) {
  const [pending, start] = useTransition();
  const href = entity.type === "person" ? `/${entity.handle}?from=you` : entity.type === "studio" ? `/s/${entity.slug}?from=you` : `/g/${entity.slug}?from=you`;
  const requested = entity.type === "person" && entity.requested;
  const label = entity.following ? "Following" : requested ? "Requested" : "Follow";

  const toggle = () => start(async () => {
    if (entity.type === "person") {
      if (entity.following || entity.requested) {
        const result = await unfollowTrainer(entity.handle);
        if (result.ok) onChange({ following: false, requested: false });
      } else {
        const result = await followTrainer(entity.handle);
        if (result.ok) onChange({ following: !result.requested, requested: !!result.requested });
      }
      return;
    }
    if (entity.type === "studio") {
      const result = await toggleStudioVisit(entity.slug);
      if (result.ok && result.selected !== undefined) onChange({ following: result.selected });
      return;
    }
    const result = await toggleGroupFavorite(entity.slug);
    if (result.ok && result.selected !== undefined) onChange({ following: result.selected });
  });

  return (
    <article className="follow-directory-row">
      <Link className="follow-directory-person" href={href}>
        {entity.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entity.photo} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="follow-directory-avatar" style={{ background: entity.color }}>
            {(entity.name.trim().charAt(0) || "?").toUpperCase()}
          </span>
        )}
        <span className="follow-directory-copy">
          <strong>{entity.name}</strong>
          <small>{entity.detail}</small>
        </span>
      </Link>
      <button
        type="button"
        className={`follow-directory-toggle${entity.following || requested ? " on" : ""}`}
        disabled={pending}
        aria-label={`${label} ${entity.name}`}
        onClick={toggle}
      >
        {pending ? "…" : label}
      </button>
    </article>
  );
}
