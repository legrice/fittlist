"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { updateProfilePhoto } from "@/app/actions/profile";
import { Icon } from "@/components/Icon";
import { SettingsGear } from "@/components/SettingsGear";
import { Toast, useToast } from "@/components/Toast";
import { readPhotoPair } from "@/lib/photo";

export type YouFavoritePerson = {
  id: string;
  name: string;
  handle: string;
  photo: string | null;
  color: string;
  title: string;
  coaching: boolean;
  hasCalendar: boolean;
};

export type YouFavoritePlace = {
  id: string;
  name: string;
  slug: string;
  photo: string | null;
  types: string[];
};

export type YouFavoriteGroup = {
  id: string;
  name: string;
  slug: string;
  photo: string | null;
  memberCount: number;
  role: string | null;
  nextClass: string | null;
  nextDate: string | null;
  faces: { id: string; name: string; photo: string | null; color: string }[];
};

export type YouGroupInvitation = {
  id: string;
  name: string;
  slug: string;
  role: string;
  inviterName: string;
};

export type YouAccountData = {
  me: {
    name: string;
    handle: string;
    title: string;
    location: string;
    photo: string | null;
    color: string;
    coaching: boolean;
  };
  managed: { id: string; name: string; slug: string; admin: boolean; photo: string | null }[];
  shareHref: string;
  isAdmin: boolean;
  unread: { messages: number; notifications: number };
};

export type YouDashboardData = YouAccountData & {
  people: YouFavoritePerson[];
  places: YouFavoritePlace[];
  yourGroups: YouFavoriteGroup[];
  favoriteGroups: YouFavoriteGroup[];
  groupInvitations: YouGroupInvitation[];
  savedItems: { id: string; name: string; detail: string; href: string }[];
};

export type ProfileSettingsView = "page" | "calendar" | "reach" | "account";

export function YouDashboard({
  me,
  managed,
  shareHref,
  unread: _unread,
  people = [],
  places = [],
  yourGroups = [],
  favoriteGroups = [],
  savedItems = [],
  onOpenSettings,
}: YouAccountData & Partial<Pick<YouDashboardData, "people" | "places" | "yourGroups" | "favoriteGroups" | "savedItems">> & { onOpenSettings?: (view: ProfileSettingsView) => void }) {
  const router = useRouter();
  const initial = (me.name.charAt(0) || "?").toUpperCase();
  const managedGroups = yourGroups.filter((group) => group.role === "owner" || group.role === "admin");
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(me.photo);
  const [photoPending, startPhoto] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const savePhoto = (file: File) => {
    readPhotoPair(file, (full, thumb) => {
      setPhotoPreview(full);
      setPhotoMenu(false);
      startPhoto(async () => {
        const result = await updateProfilePhoto({ photo: full, photoThumb: thumb });
        if (!result.ok) {
          setPhotoPreview(me.photo);
          toast(result.error ?? "Couldn't update your photo");
          return;
        }
        toast("Profile photo updated");
        router.refresh();
      });
    });
  };

  const nativePhoto = async (source: "camera" | "library") => {
    try {
      const { Camera, CameraDirection, MediaTypeSelection } = await import("@capacitor/camera");
      const result = source === "camera"
        ? await Camera.takePhoto({ quality: 92, editable: "in-app", cameraDirection: CameraDirection.Front })
        : (await Camera.chooseFromGallery({ mediaType: MediaTypeSelection.Photo, allowMultipleSelection: false, editable: "in-app", quality: 92 })).results[0];
      const sourceUrl = result?.webPath || result?.uri;
      if (!sourceUrl) return;
      const response = await fetch(sourceUrl);
      const blob = await response.blob();
      savePhoto(new File([blob], "profile-photo.jpg", { type: blob.type || "image/jpeg" }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/cancel/i.test(message)) toast("Couldn't open that photo");
    }
  };

  const choosePhoto = (source: "camera" | "library") => {
    if (Capacitor.isNativePlatform()) void nativePhoto(source);
    else fileRef.current?.click();
  };
  return (
    <main className="youpage">
      <section className="youaccount-head">
        <button className="youavatar-edit" type="button" disabled={photoPending} onClick={() => setPhotoMenu(true)} aria-label="Change profile photo">
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="youavatar" src={photoPreview} alt="" />
          ) : (
            <span className="youavatar youavatar-empty" style={{ background: me.color }}>{initial}</span>
          )}
          <span><Icon name="image" size={15} /></span>
        </button>
        <input ref={fileRef} className="sr-only" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) savePhoto(file); event.currentTarget.value = ""; }} />
        <div className="youaccount-identity">
          <div className="youhandle-row">
            <span className="youhandle">@{me.handle}</span>
            {onOpenSettings ? (
              <button className="youeditlink" type="button" onClick={() => onOpenSettings("page")}>Edit profile</button>
            ) : (
              <Link className="youeditlink" href="/settings?edit=1">Edit profile</Link>
            )}
          </div>
          <h1>{me.name}</h1>
        </div>
      </section>

      <div className="youquickactions" aria-label="Profile actions">
        <Link href={`/${me.handle}`}>
          <Icon name="account_circle" size={18} />
          <span>View profile</span>
        </Link>
        <Link href={shareHref}>
          <Icon name="reply" className="share-arrow-forward" size={18} />
          <span>Share</span>
        </Link>
        <SettingsGear pill />
      </div>

      <section className="profile-following">
        <h2>Following</h2>
        <div className="profile-following-rail">
          <FollowingCountCircle href="/following/people" count={people.length} singular="person" plural="people" photo={people.find((person) => person.photo)?.photo ?? null} icon="person" />
          <FollowingCountCircle href="/following/studios" count={places.length} singular="studio" plural="studios" photo={places.find((place) => place.photo)?.photo ?? null} icon="storefront" />
          <FollowingCountCircle href="/following/groups" count={favoriteGroups.length} singular="group" plural="groups" photo={favoriteGroups.find((group) => group.photo)?.photo ?? null} icon="groups" />
        </div>
      </section>

      <AccountGroup title="Your calendars">
        <AccountRow
          icon="calendar_month"
          title="Personal calendar"
          detail="View, manage, and share your schedule"
          href="/calendar"
          avatar={{ photo: photoPreview, name: me.name, color: me.color }}
        />
          {managed.map((place) => (
            <AccountRow
              icon="storefront"
              title={place.name}
              detail={place.admin ? "Manage calendar and staff" : "Team calendar"}
              href={place.admin ? `/s/${place.slug}/manage` : `/s/${place.slug}/schedule?from=you`}
              avatar={{ photo: place.photo, name: place.name }}
              key={place.id}
            />
          ))}
      </AccountGroup>

      {yourGroups.length > 0 && (
        <AccountGroup title="Your groups">
          {yourGroups.map((group) => (
            <AccountRow
              icon="groups"
              title={group.name}
              detail={managedGroups.some((managedGroup) => managedGroup.id === group.id) ? "Manage calendar and members" : "Group calendar"}
              href={`/g/${group.slug}`}
              avatar={{ photo: group.photo, name: group.name }}
              key={group.id}
            />
          ))}
        </AccountGroup>
      )}

      <AccountGroup title="Saved items">
        {savedItems.length > 0 ? savedItems.map((item) => (
          <AccountRow icon="bookmark" title={item.name} detail={item.detail} href={item.href} key={item.id} />
        )) : (
          <p className="youaccount-empty">Classes and events you save will appear here.</p>
        )}
      </AccountGroup>
      {photoMenu && (
        <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) setPhotoMenu(false); }}>
          <section className="sheet youphoto-sheet" role="dialog" aria-modal="true" aria-labelledby="youphoto-title">
            <button type="button" className="iconbtn sheetclose" aria-label="Close" onClick={() => setPhotoMenu(false)}><Icon name="close" size={18} /></button>
            <h2 id="youphoto-title">Profile photo</h2>
            <button type="button" onClick={() => choosePhoto("library")}><Icon name="image" size={21} /><span><strong>Choose a photo</strong><small>Crop it before it saves</small></span></button>
            <button type="button" onClick={() => choosePhoto("camera")}><Icon name="image" size={21} /><span><strong>Take a photo</strong><small>Use your camera</small></span></button>
          </section>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </main>
  );
}

function AccountGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="youaccount-group">
      <h2 className="yougroup-title">{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function FollowingCountCircle({ href, count, singular, plural, photo, icon }: { href: string; count: number; singular: string; plural: string; photo: string | null; icon: string }) {
  return <Link className="profile-following-item" href={href}>
    <span>
      {photo ? <img src={photo} alt="" /> : <Icon name={icon} size={28} />}
    </span>
    <strong>{count} {count === 1 ? singular : plural}</strong>
  </Link>;
}

function AccountRow({ icon, title, detail, href, count = 0, avatar }: { icon: string; title: string; detail?: string; href: string; count?: number; avatar?: { photo: string | null; name: string; color?: string } }) {
  return (
    <Link className="youaccount-row" href={href}>
      {avatar ? <span className="youaccount-icon youaccount-place-avatar" style={avatar.photo ? undefined : { background: avatar.color }}>{avatar.photo ? <img src={avatar.photo} alt="" /> : <span>{(avatar.name.trim().charAt(0) || "?").toUpperCase()}</span>}</span> : <span className="youaccount-icon"><Icon name={icon} size={20} /></span>}
      <span className="youaccount-copy">
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      {count > 0 && <b className="youaccount-unread" aria-label={`${count} unread`}>{count > 99 ? "99+" : count}</b>}
      <Icon className="youaccount-chevron" name="chevron_right" size={19} />
    </Link>
  );
}
