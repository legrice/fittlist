"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  desktopCalendarFavorites,
  type DesktopFavorite,
} from "@/app/actions/desktop-favorites";
import { Icon } from "@/components/Icon";

let favoritesRequest: Promise<DesktopFavorite[]> | null = null;

function requestFavorites(refresh = false) {
  if (refresh) favoritesRequest = null;
  favoritesRequest ??= desktopCalendarFavorites();
  return favoritesRequest;
}

/** Load only after the wide right rail exists. Mobile and narrower desktop
 * requests never pay for decorative favorite identities. */
export function DesktopFavorites() {
  const [favorites, setFavorites] = useState<DesktopFavorite[] | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1320px)");
    let active = true;
    const load = (refresh = false) => {
      if (!media.matches) return;
      requestFavorites(refresh).then((items) => {
        if (active) setFavorites(items);
      }).catch(() => {
        favoritesRequest = null;
        if (active) setFavorites([]);
      });
    };
    const onMedia = () => load();
    const onPinsChanged = () => load(true);
    load();
    media.addEventListener("change", onMedia);
    window.addEventListener("calendar-pins-changed", onPinsChanged);
    return () => {
      active = false;
      media.removeEventListener("change", onMedia);
      window.removeEventListener("calendar-pins-changed", onPinsChanged);
    };
  }, []);

  return (
    <section className="desktop-side-card desktop-favorites-card" aria-label="Favorite calendars">
      <header className="desktop-side-head">
        <h2>Favorites</h2>
        <Link href="/you">See all</Link>
      </header>
      {favorites === null ? (
        <div className="desktop-favorites-skeleton" aria-label="Loading favorites">
          {Array.from({ length: 4 }, (_, index) => <i key={index} />)}
        </div>
      ) : favorites.length ? (
        <div className="desktop-favorites-grid">
          {favorites.map((favorite) => (
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
  );
}
