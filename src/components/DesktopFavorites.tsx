"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { followTrainer } from "@/app/actions/subscribe";
import {
  desktopSidebarData,
  type DesktopFollowBack,
  type DesktopSidebarData,
} from "@/app/actions/desktop-favorites";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

let sidebarRequest: Promise<DesktopSidebarData> | null = null;

function requestSidebar(refresh = false) {
  if (refresh) sidebarRequest = null;
  sidebarRequest ??= desktopSidebarData();
  return sidebarRequest;
}

/** Load only after the wide right rail exists. Mobile and narrower desktop
 * requests never pay for decorative favorite or follow-back identities. */
export function DesktopFavorites() {
  const [data, setData] = useState<DesktopSidebarData | null>(null);
  const [toastMsg, toastOn, toast] = useToast();

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1320px)");
    let active = true;
    const load = (refresh = false) => {
      if (!media.matches) return;
      requestSidebar(refresh).then((result) => {
        if (active) setData(result);
      }).catch(() => {
        sidebarRequest = null;
        if (active) setData({ favorites: [], followBack: [] });
      });
    };
    const onMedia = () => load();
    const onRelationshipsChanged = () => load(true);
    load();
    media.addEventListener("change", onMedia);
    window.addEventListener("calendar-pins-changed", onRelationshipsChanged);
    window.addEventListener("follows-changed", onRelationshipsChanged);
    return () => {
      active = false;
      media.removeEventListener("change", onMedia);
      window.removeEventListener("calendar-pins-changed", onRelationshipsChanged);
      window.removeEventListener("follows-changed", onRelationshipsChanged);
    };
  }, []);

  const updateFollowBack = (id: string, patch: Partial<DesktopFollowBack>) => {
    setData((current) => current ? {
      ...current,
      followBack: current.followBack.map((person) => person.id === id ? { ...person, ...patch } : person),
    } : current);
  };

  return (
    <>
      <section className="desktop-side-card desktop-favorites-card" aria-label="Favorite calendars">
        <header className="desktop-side-head">
          <h2>Favorites</h2>
          <Link href="/you">See all</Link>
        </header>
        {data === null ? (
          <div className="desktop-favorites-skeleton" aria-label="Loading favorites">
            {Array.from({ length: 4 }, (_, index) => <i key={index} />)}
          </div>
        ) : data.favorites.length ? (
          <div className="desktop-favorites-grid">
            {data.favorites.map((favorite) => (
              <Link key={favorite.key} href={favorite.href} title={favorite.name}>
                <span className={favorite.type === "studio" ? "studio" : "person"} style={{ background: favorite.color }}>
                  {favorite.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={favorite.photo} alt="" loading="lazy" decoding="async" />
                  ) : favorite.type === "studio" ? (
                    <Icon name="storefront" size={23} />
                  ) : (
                    favorite.name.charAt(0).toUpperCase()
                  )}
                </span>
                <i className="desktop-favorite-star" aria-label="Favorite">
                  <Icon name="star" size={16} />
                </i>
                <small>{favorite.name}</small>
              </Link>
            ))}
          </div>
        ) : (
          <Link className="desktop-favorites-empty" href="/discover">
            Star calendars to keep them within reach.
            <Icon name="arrow_forward" size={17} />
          </Link>
        )}
      </section>

      {!!data?.followBack.length && (
        <section className="desktop-side-card desktop-followback-card" aria-label="People to follow back">
          <header className="desktop-side-head">
            <h2>Follow back</h2>
            <Link href="/followers">See all</Link>
          </header>
          <div className="desktop-followback-list">
            {data.followBack.map((person) => (
              <FollowBackRow
                key={person.id}
                person={person}
                onChange={(patch) => updateFollowBack(person.id, patch)}
                onToast={toast}
              />
            ))}
          </div>
        </section>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

function FollowBackRow({
  person,
  onChange,
  onToast,
}: {
  person: DesktopFollowBack;
  onChange: (patch: Partial<DesktopFollowBack>) => void;
  onToast: (message: string) => void;
}) {
  const [pending, start] = useTransition();
  const [followed, setFollowed] = useState(false);
  const [requested, setRequested] = useState(person.requested);
  const label = followed ? "Following" : requested ? "Requested" : "Follow back";

  return (
    <div className="desktop-followback-row">
      <Link href={`/${person.handle}`}>
        <span style={{ background: person.color }}>
          {person.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={person.photo} alt="" loading="lazy" decoding="async" />
          ) : (
            person.name.charAt(0).toUpperCase()
          )}
        </span>
        <span><strong>{person.name}</strong><small>{person.detail}</small></span>
      </Link>
      <button
        type="button"
        disabled={pending || followed || requested}
        className={followed || requested ? "on" : ""}
        onClick={() => start(async () => {
          const result = await followTrainer(person.handle);
          if (!result.ok) {
            onToast(result.error ?? "Something went wrong.");
            return;
          }
          if (result.requested) {
            setRequested(true);
            onChange({ requested: true });
            onToast(`Follow request sent to ${person.name.split(/\s+/)[0]}`);
          } else {
            setFollowed(true);
            onToast(`Following ${person.name.split(/\s+/)[0]}`);
          }
          window.dispatchEvent(new Event("follows-changed"));
        })}
      >
        {label}
      </button>
    </div>
  );
}
