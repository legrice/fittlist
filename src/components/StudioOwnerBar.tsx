"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStudio } from "@/app/actions/studios";
import { Icon } from "@/components/Icon";
import { readPhoto } from "@/lib/photo";
import { TypePicker } from "@/components/TypePicker";
import { Toast, useToast } from "@/components/Toast";

export type StudioEditProps = {
  id: string;
  name: string;
  address: string;
  types: string[];
  about: string;
  photo: string | null;
  contactEmail: string;
  phone: string;
  website: string;
  instagram: string;
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
  const fileRef = useRef<HTMLInputElement>(null);

  const [pName, setPName] = useState(props.name);
  const [pAddress, setPAddress] = useState(props.address);
  const [pTypes, setPTypes] = useState<string[]>(props.types);
  const [pAbout, setPAbout] = useState(props.about);
  const [pPhoto, setPPhoto] = useState<string | null>(props.photo);
  const [pEmail, setPEmail] = useState(props.contactEmail);
  const [pPhone, setPPhone] = useState(props.phone);
  const [pWebsite, setPWebsite] = useState(props.website);
  const [pInstagram, setPInstagram] = useState(props.instagram);

  const pickPhoto = (file: File) => readPhoto(file, setPPhoto);

  // Fresh fields every time the sheet opens: the page may have changed
  // under us since the last look.
  useEffect(() => {
    if (!open) return;
    setPName(props.name);
    setPAddress(props.address);
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
              <h2>Edit studio</h2>
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

            <label className="flabel" htmlFor="stAddress">
              Address
            </label>
            <input
              id="stAddress"
              className="editinput"
              value={pAddress}
              onChange={(e) => setPAddress(e.target.value)}
            />

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
              placeholder="What the space is like, what to expect, parking…"
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
            <label className="flabel" htmlFor="stWebsite">
              Website
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
                {saving ? "Saving…" : "Save studio"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
