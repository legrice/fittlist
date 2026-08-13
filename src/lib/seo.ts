export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function locationSlug(value: string | null | undefined) {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function titleCaseLocation(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => (word.length === 2 ? word.toUpperCase() : `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`))
    .join(" ");
}

export function profileJsonLd(user: {
  name: string;
  handle: string | null;
  photo: string | null;
  about: string | null;
  title: string | null;
  location: string | null;
  disciplines: string[];
  website: string | null;
}, origin: string) {
  const url = `${origin}/${user.handle}`;
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${url}#person`,
    name: user.name,
    url,
    image: user.photo || undefined,
    description: user.about || undefined,
    jobTitle: user.title || undefined,
    homeLocation: user.location ? { "@type": "Place", name: user.location } : undefined,
    knowsAbout: user.disciplines.length ? user.disciplines : undefined,
    sameAs: user.website ? [user.website] : undefined,
  };
}

export function studioJsonLd(studio: {
  id: string;
  slug: string | null;
  name: string;
  address: string;
  photo: string | null;
  about: string | null;
  lat: number | null;
  lng: number | null;
  types: string[];
  website: string | null;
  instagram: string | null;
  phone: string | null;
  contactEmail: string | null;
}, origin: string) {
  const url = `${origin}/s/${studio.slug ?? studio.id}`;
  return {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "SportsActivityLocation"],
    "@id": `${url}#place`,
    name: studio.name,
    url,
    image: studio.photo || undefined,
    description: studio.about || undefined,
    address: { "@type": "PostalAddress", streetAddress: studio.address },
    geo:
      studio.lat != null && studio.lng != null
        ? { "@type": "GeoCoordinates", latitude: studio.lat, longitude: studio.lng }
        : undefined,
    knowsAbout: studio.types.length ? studio.types : undefined,
    telephone: studio.phone || undefined,
    email: studio.contactEmail || undefined,
    sameAs: [studio.website, studio.instagram].filter(Boolean),
  };
}

export function classJsonLd(detail: {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  whenIso: string;
  startRaw: string;
  coachName: string;
  coachHandle: string | null;
  studioName: string | null;
  studioAddress: string | null;
  location: string | null;
  shareUrl: string;
}, origin: string) {
  const virtual = /virtual|online|zoom/i.test(`${detail.location ?? ""} ${detail.studioName ?? ""}`);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": `${detail.shareUrl}#event`,
    name: detail.name,
    description: detail.description || `${detail.name} with ${detail.coachName}`,
    image: detail.image || undefined,
    startDate: `${detail.whenIso}T${detail.startRaw}:00`,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: virtual
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    location: virtual
      ? { "@type": "VirtualLocation", url: detail.shareUrl }
      : {
          "@type": "Place",
          name: detail.studioName || detail.location || undefined,
          address: detail.studioAddress
            ? { "@type": "PostalAddress", streetAddress: detail.studioAddress }
            : undefined,
        },
    performer: {
      "@type": "Person",
      name: detail.coachName,
      url: detail.coachHandle ? `${origin}/${detail.coachHandle}` : undefined,
    },
    organizer: { "@type": "Organization", name: "FittList", url: origin },
    url: detail.shareUrl,
  };
}
