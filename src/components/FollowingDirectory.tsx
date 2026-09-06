"use client";

import { LoadingDots } from "@/components/LoadingDots";


import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { loadFollowingDirectory } from "@/app/actions/following-directory";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { toggleStudioVisit } from "@/app/actions/endorsements";
import { toggleGroupFavorite } from "@/app/actions/groups";
import { Icon } from "@/components/Icon";
import { PLACE_KIND_LABELS } from "@/lib/studio";
import type {
  FollowingDirectoryData,
  FollowingDirectoryBatch,
  FollowingDirectoryEntity,
} from "@/lib/following-directory";
import {
  invalidateClientMemoryPrefix,
  loadClientMemory,
  readClientMemory,
} from "@/lib/client-memory";

type DirectoryTab = "following" | "discover";
const distanceOptions = [["1","Within 1 mile"],["2","Within 2 miles"],["5","Within 5 miles"],["10","Within 10 miles"],["25","Within 25 miles"]] as const;
const purposeOptions = [["plan","Plan together"],["community","Community"],["event","Events"]] as const;

export function FollowingDirectory({ data, mode }: { data: FollowingDirectoryData; mode?: "dark" }) {
  const [tab, setTab] = useState<DirectoryTab>("following");
  const [entities, setEntities] = useState(data.entities);
  const [loaded, setLoaded] = useState<Record<DirectoryTab, boolean>>({ following: true, discover: false });
  const [limits, setLimits] = useState<Record<DirectoryTab, number>>({ following: data.limit, discover: 0 });
  const [hasMore, setHasMore] = useState<Record<DirectoryTab, boolean>>({ following: data.hasMore, discover: false });
  const [loadFailed, setLoadFailed] = useState<Record<DirectoryTab, boolean>>({ following: false, discover: false });
  const [loading, startLoading] = useTransition();
  const [primaryFilter, setPrimaryFilter] = useState("");
  const [secondaryFilter, setSecondaryFilter] = useState("");
  const [sort, setSort] = useState("");
  const [distance, setDistance] = useState(data.viewerLat != null && data.viewerLng != null ? "2" : "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const discoverEntities = useMemo(() => entities.filter((entity) => !entity.following), [entities]);
  const primaryOptions = useMemo(() => {
    if (data.kind === "people") return [...new Set(discoverEntities.flatMap((entity) => entity.type === "person" ? entity.disciplines : []))].sort();
    if (data.kind === "studios") return [...new Set(discoverEntities.flatMap((entity) => entity.type === "studio" ? [entity.placeKind] : []))].sort();
    return [...new Set(discoverEntities.flatMap((entity) => entity.type === "group" ? [entity.purpose] : []))].sort();
  }, [data.kind, discoverEntities]);
  const secondaryOptions = useMemo(() => {
    if (data.kind === "people") return [];
    if (data.kind === "studios") return [...new Set(discoverEntities.flatMap((entity) => entity.type === "studio" ? entity.types : []))].sort();
    return [];
  }, [data.kind, discoverEntities]);
  const visible = useMemo(
    () => entities
      .filter((entity) => tab === "following" ? entity.following : !entity.following)
      .filter((entity) => tab === "following" || (
        (!distance || (data.viewerLat != null && data.viewerLng != null && entity.lat != null && entity.lng != null && milesBetween(data.viewerLat, data.viewerLng, entity.lat, entity.lng) <= Number(distance))) && (
        entity.type === "person"
          ? (!primaryFilter || entity.disciplines.includes(primaryFilter))
          : entity.type === "studio"
            ? (!primaryFilter || entity.placeKind === primaryFilter) && (!secondaryFilter || entity.types.includes(secondaryFilter))
            : !primaryFilter || entity.purpose === primaryFilter
      )))
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : 0),
    [data.viewerLat, data.viewerLng, distance, entities, primaryFilter, secondaryFilter, sort, tab],
  );
  const activeFilters = Number(!!distance) + Number(!!primaryFilter) + Number(data.kind === "studios" && !!secondaryFilter) + Number(data.kind === "groups" && !!sort);
  const clearFilters = () => { setDistance(""); setPrimaryFilter(""); setSecondaryFilter(""); setSort(""); };

  const loadTab = (nextTab: DirectoryTab, nextLimit: number) => {
    const memoryKey = `following-directory:${data.kind}:${nextTab}:${nextLimit}`;
    const apply = (result: FollowingDirectoryBatch) => {
      setEntities((current) => {
        const merged = new Map(current.map((entity) => [`${entity.type}:${entity.id}`, entity]));
        for (const entity of result.entities) merged.set(`${entity.type}:${entity.id}`, entity);
        return [...merged.values()];
      });
      setLoaded((current) => ({ ...current, [nextTab]: true }));
      setLimits((current) => ({ ...current, [nextTab]: result.limit }));
      setHasMore((current) => ({ ...current, [nextTab]: result.hasMore }));
    };
    const remembered = readClientMemory<FollowingDirectoryBatch>(memoryKey);
    if (remembered) apply(remembered);
    setLoadFailed((current) => ({ ...current, [nextTab]: false }));
    startLoading(async () => {
      try {
        const result = await loadClientMemory(memoryKey, () => loadFollowingDirectory(data.kind, nextTab, nextLimit));
        if (!result) {
          if (!remembered) setLoadFailed((current) => ({ ...current, [nextTab]: true }));
          return;
        }
        apply(result);
      } catch {
        if (!remembered) setLoadFailed((current) => ({ ...current, [nextTab]: true }));
      }
    });
  };

  const selectTab = (nextTab: DirectoryTab) => {
    setTab(nextTab);
    if (!loaded[nextTab] && !loading) loadTab(nextTab, data.pageSize);
  };

  return (
    <section className="screen follow-directory-screen" data-mode={mode}>
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

        {tab === "discover" && loaded.discover && (
          <div className="discover-class-filters discover-tab-filters follow-directory-filters" aria-label={`${data.title} filters`}>
            <button
              type="button"
              className={`discover-filters-pill${activeFilters ? " on" : ""}`}
              aria-label="Filters"
              onClick={() => setFiltersOpen(true)}
            >
              <Icon name="tune" size={20} />
              {activeFilters > 0 && <span className="discover-filters-count">{activeFilters}</span>}
            </button>
            <DirectoryFilter label="Distance" value={distance} onChange={setDistance} all="Any distance" options={distanceOptions} disabled={data.viewerLat == null || data.viewerLng == null} />
            {data.kind === "people" && <DirectoryFilter label="Specialty" value={primaryFilter} onChange={setPrimaryFilter} all="Any specialty" options={primaryOptions} />}
            {data.kind === "studios" && <><DirectoryFilter label="Type" value={primaryFilter} onChange={setPrimaryFilter} all="Any type" options={primaryOptions.map((option) => [option, PLACE_KIND_LABELS[option as keyof typeof PLACE_KIND_LABELS] ?? option] as const)} /><DirectoryFilter label="Category" value={secondaryFilter} onChange={setSecondaryFilter} all="Any category" options={secondaryOptions} /></>}
            {data.kind === "groups" && <><DirectoryFilter label="Purpose" value={primaryFilter} onChange={setPrimaryFilter} all="Any purpose" options={purposeOptions} /><DirectoryFilter label="Sort" value={sort} onChange={setSort} all="Newest" options={[["name","Name"]]} /></>}
          </div>
        )}

        {filtersOpen && (
          <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) setFiltersOpen(false); }}>
            <div className="sheet discover-filters-sheet">
              <button type="button" className="iconbtn sheetclose sheet-dismiss" aria-label="Close" onClick={() => setFiltersOpen(false)}><Icon name="close" size={20} /></button>
              <div className="discover-filters-sheet-head"><h2>Filters</h2><button type="button" disabled={!activeFilters} onClick={clearFilters}>Clear all</button></div>
              <div className="discover-filters-sheet-fields">
                <DirectoryFilter label="Distance" value={distance} onChange={setDistance} all="Any distance" options={distanceOptions} disabled={data.viewerLat == null || data.viewerLng == null} />
                {data.kind === "people" && <DirectoryFilter label="Specialty" value={primaryFilter} onChange={setPrimaryFilter} all="Any specialty" options={primaryOptions} />}
                {data.kind === "studios" && <><DirectoryFilter label="Type" value={primaryFilter} onChange={setPrimaryFilter} all="Any type" options={primaryOptions.map((option) => [option, PLACE_KIND_LABELS[option as keyof typeof PLACE_KIND_LABELS] ?? option] as const)} /><DirectoryFilter label="Category" value={secondaryFilter} onChange={setSecondaryFilter} all="Any category" options={secondaryOptions} /></>}
                {data.kind === "groups" && <><DirectoryFilter label="Purpose" value={primaryFilter} onChange={setPrimaryFilter} all="Any purpose" options={purposeOptions} /><DirectoryFilter label="Sort" value={sort} onChange={setSort} all="Newest" options={[["name","Name"]]} /></>}
              </div>
              <button type="button" className="btn discover-filters-done" onClick={() => setFiltersOpen(false)}>Show results</button>
            </div>
          </div>
        )}

        {loading && !loaded[tab] ? (
          <div className="follow-directory-empty" aria-live="polite">
            <p><LoadingDots label={`Loading ${data.title.toLowerCase()}`} /></p>
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
                {loading ? <LoadingDots label="Loading…"/> : "Load more"}
              </button>
            )}
          </div>
        ) : (
          <div className="follow-directory-empty">
            <h2>{loadFailed[tab] ? "Couldn’t load this list" : tab === "following" ? `No ${data.title.toLowerCase()} followed yet` : activeFilters ? `No ${data.title.toLowerCase()} match these filters` : `No more ${data.title.toLowerCase()} to discover`}</h2>
            <p>{loadFailed[tab] ? "Try again when your connection is ready." : tab === "following" ? "Profiles you follow will be easy to manage here." : activeFilters ? "Try clearing a filter to see more suggestions." : "Check back as more profiles join FittList."}</p>
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

function DirectoryFilter({ label, value, onChange, all, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; all: string; options: readonly (string | readonly [string, string])[]; disabled?: boolean }) {
  return <label><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}><option value="">{all}</option>{options.map((option) => { const [optionValue, optionLabel] = typeof option === "string" ? [option, option] : option; return <option value={optionValue} key={optionValue}>{optionLabel}</option>; })}</select></label>;
}

function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
        if (result.ok) {
          onChange({ following: false, requested: false });
          invalidateClientMemoryPrefix("following-directory:");
          window.dispatchEvent(new Event("calendar-pins-changed"));
        }
      } else {
        const result = await followTrainer(entity.handle);
        if (result.ok) {
          onChange({ following: !result.requested, requested: !!result.requested });
          invalidateClientMemoryPrefix("following-directory:");
        }
      }
      return;
    }
    if (entity.type === "studio") {
      const result = await toggleStudioVisit(entity.slug);
      if (result.ok && result.selected !== undefined) {
        onChange({ following: result.selected });
        invalidateClientMemoryPrefix("following-directory:");
        if (!result.selected) window.dispatchEvent(new Event("calendar-pins-changed"));
      }
      return;
    }
    const result = await toggleGroupFavorite(entity.slug);
    if (result.ok && result.selected !== undefined) {
      onChange({ following: result.selected });
      invalidateClientMemoryPrefix("following-directory:");
    }
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
