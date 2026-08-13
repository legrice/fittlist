"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStudio } from "@/app/actions/studios";
import { adminDeleteStudio } from "@/app/actions/admin";
import { Icon } from "@/components/Icon";
import { readPhoto } from "@/lib/photo";
import { TypePicker } from "@/components/TypePicker";
import { Toast, useToast } from "@/components/Toast";
import { PLACE_KIND_LABELS, PLACE_KINDS, type PlaceKind } from "@/lib/studio";

const validPlaceKind = (kind: string): PlaceKind =>
  PLACE_KINDS.includes(kind as PlaceKind) ? (kind as PlaceKind) : "studio";

export type StudioEditProps = {
  id: string;
  name: string;
  address: string;
  placeKind: PlaceKind;
  types: string[];
  about: string;
  photo: string | null;
  contactEmail: string;
  phone: string;
  website: string;
  instagram: string;
  /** Site-admin-only destructive control; ordinary editors never receive it. */
  admin?: boolean;
};

// Any coach can correct a studio in the shared directory. The sheet is the
// coach profile editor's shape; the trigger lives in the studio menu now,
// behind the word about care, so this only renders the editor itself.
export function StudioOwnerBar({
  open,
  onClose,
  ...props
}: StudioEditProps & { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [toastMsg, toastOn, toast] = useToast();
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pName, setPName] = useState(props.name);
  const [pAddress, setPAddress] = useState(props.address);
  const [pPlaceKind, setPPlaceKind] = useState(() => validPlaceKind(props.placeKind));
  const [pTypes, setPTypes] = useState<string[]>(props.types);
  const [pAbout, setPAbout] = useState(props.about);
  const [pPhoto, setPPhoto] = useState<string | null>(props.photo);
  const [pEmail, setPEmail] = useState(props.contactEmail);
  const [pPhone, setPPhone] = useState(props.phone);
  const [pWebsite, setPWebsite] = useState(props.website);
  const [pInstagram, setPInstagram] = useState(props.instagram);

  const pickPhoto = (file: File) =>
    readPhoto(file, setPPhoto, () => toast("That photo format isn't supported. Try another photo."));

  // Fresh fields every time the sheet opens: the page may have changed
  // under us since the last look.
  useEffect(() => {
    if (!open) return;
    setPName(props.name);
    setPAddress(props.address);
    setPPlaceKind(validPlaceKind(props.placeKind));
    setPTypes(props.types);
    setPAbout(props.about);
    setPPhoto(props.photo);
    setPEmail(props.contactEmail);
    setPPhone(props.phone);
    setPWebsite(props.website);
    setPInstagram(props.instagram);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleType = (t: string) =>
    setPTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const save = () =>
    startSaving(async () => {
      const res = await updateStudio(props.id, {
        name: pName,
        address: pAddress,
        placeKind: pPlaceKind,
        types: pTypes,
        about: pAbout,
        photo: pPhoto ?? "",
        contactEmail: pEmail,
        phone: pPhone,
        website: pWebsite,
        instagram: pInstagram,
      });
      if (!res.ok) {
        toast(res.error ?? "Couldn't save");
        return;
      }
      onClose();
      // The slug moves with the name, so land on wherever it lives now.
      if (res.slug) router.replace(`/s/${res.slug}`);
      router.refresh();
      toast("Studio updated");
    });

  const remove = () =>
    startDeleting(async () => {
      const res = await adminDeleteStudio(props.id);
      if (!res.ok) {
        setConfirmingDelete(false);
        toast(res.error ?? "Couldn't delete this place");
        return;
      }
      setConfirmingDelete(false);
      onClose();
      router.replace("/discover?half=studios");
      router.refresh();
    });

  return (
    <>
      {open && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="sheet sheet-full">
            <div className="adderhead">
              <h2>Edit place</h2>
              <button
                className="iconbtn sheetclose adderclose"
                aria-label="Close"
                onClick={onClose}
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <label className="flabel" htmlFor="stName">
              Name
            </label>
            <input
              id="stName"
              className="editinput"
              value={pName}
              onChange={(e) => setPName(e.target.value)}
            />

            <label className="flabel" htmlFor="stPlaceKind">Place type</label>
            <select
              id="stPlaceKind"
              className="editinput placekind-select"
              value={pPlaceKind}
              onChange={(e) => setPPlaceKind(e.target.value as PlaceKind)}
            >
              {PLACE_KINDS.map((kind) => (
                <option key={kind} value={kind}>{PLACE_KIND_LABELS[kind]}</option>
              ))}
            </select>

            {pPlaceKind !== "virtual" && <>
              <label className="flabel" htmlFor="stAddress">
                {pPlaceKind === "studio" || pPlaceKind === "wellness" ? "Address" : "Location"}
              </label>
              <input
                id="stAddress"
                className="editinput"
                value={pAddress}
                onChange={(e) => setPAddress(e.target.value)}
              />
            </>}

            <label className="flabel">
              Type <span>· pick every one that fits</span>
            </label>
            <TypePicker value={pTypes} onChange={setPTypes} />

            <label className="flabel">Photo</label>
            <div className="editphoto">
              {pPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="editphoto-img" src={pPhoto} alt="" />
              ) : (
                <div className="editphoto-img editphoto-empty" aria-hidden="true">
                  <Icon name="place" size={30} />
                </div>
              )}
              <div className="editphoto-actions">
                <button className="btn ghost" onClick={() => fileRef.current?.click()}>
                  {pPhoto ? "Change photo" : "Add photo"}
                </button>
                {pPhoto && (
                  <button className="btn ghost" onClick={() => setPPhoto(null)}>
                    Remove
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickPhoto(f);
                  e.target.value = "";
                }}
              />
            </div>

            <label className="flabel" htmlFor="stAbout">
              About
            </label>
            <textarea
              id="stAbout"
              className="abouttext"
              rows={4}
              placeholder={
                pPlaceKind === "virtual"
                  ? "What people can join and what to expect…"
                  : pPlaceKind === "outdoor"
                    ? "Where to meet and what to expect…"
                    : "What the space is like and what to expect…"
              }
              value={pAbout}
              onChange={(e) => setPAbout(e.target.value)}
            />

            <label className="flabel" htmlFor="stEmail">
              Email
            </label>
            <input
              id="stEmail"
              className="editinput"
              type="email"
              placeholder="hello@studio.com"
              value={pEmail}
              onChange={(e) => setPEmail(e.target.value)}
            />
            {(pPlaceKind === "studio" || pPlaceKind === "wellness") && <>
              <label className="flabel" htmlFor="stPhone">
                Phone
              </label>
              <input
                id="stPhone"
                className="editinput"
                type="tel"
                value={pPhone}
                onChange={(e) => setPPhone(e.target.value)}
              />
            </>}
            <label className="flabel" htmlFor="stWebsite">
              {pPlaceKind === "virtual" ? "Join link or website" : "Website"}
            </label>
            <input
              id="stWebsite"
              className="editinput"
              type="url"
              placeholder="https://"
              value={pWebsite}
              onChange={(e) => setPWebsite(e.target.value)}
            />
            <label className="flabel" htmlFor="stInsta">
              Instagram
            </label>
            <input
              id="stInsta"
              className="editinput"
              placeholder="studioname"
              value={pInstagram}
              onChange={(e) => setPInstagram(e.target.value)}
            />

            <div className="publishwrap">
              <button className="btn si" disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save place"}
              </button>
            </div>
            {props.admin && (
              <div className="dangerzone studio-delete-zone">
                <button className="tertiary" type="button" onClick={() => setConfirmingDelete(true)}>
                  Delete this place
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmingDelete && (
        <div className="sheet-scrim studio-delete-confirm" onClick={(event) => { if (event.target === event.currentTarget) setConfirmingDelete(false); }}>
          <div className="sheet confirmsheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setConfirmingDelete(false)}>
              <Icon name="close" size={18} />
            </button>
            <h2>Delete {props.name}?</h2>
            <p className="lead">This permanently removes the place from fittlist. It can only be deleted when no classes or coaches still depend on it.</p>
            <div className="publishwrap nostick">
              <button className="btn si" disabled={deleting} onClick={remove}>
                {deleting ? "Deleting…" : "Yes, delete this place"}
              </button>
            </div>
            <button className="tertiary tellsheet-done" onClick={() => setConfirmingDelete(false)}>Keep this place</button>
          </div>
        </div>
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
