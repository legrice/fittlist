"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStudio } from "@/app/actions/studios";
import { Icon } from "@/components/Icon";
import { STUDIO_TYPES } from "@/lib/studio";
import { Toast, useToast } from "@/components/Toast";

type Props = {
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

// Any coach can correct a studio in the shared directory, so the button shows
// for all of them rather than a single owner. It sits in the page's top row,
// across from the back arrow; the sheet is the coach profile editor's shape.
export function StudioOwnerBar(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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

  // Resize the picked image to a small JPEG data URL before storing it.
  const pickPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 640;
        let { width, height } = img;
        if (width > height && width > max) {
          height = (height * max) / width;
          width = max;
        } else if (height > max) {
          width = (width * max) / height;
          height = max;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
        setPPhoto(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const openEdit = () => {
    setPName(props.name);
    setPAddress(props.address);
    setPTypes(props.types);
    setPAbout(props.about);
    setPPhoto(props.photo);
    setPEmail(props.contactEmail);
    setPPhone(props.phone);
    setPWebsite(props.website);
    setPInstagram(props.instagram);
    setOpen(true);
  };

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
      setOpen(false);
      // The slug moves with the name, so land on wherever it lives now.
      if (res.slug) router.replace(`/s/${res.slug}`);
      router.refresh();
      toast("Studio updated");
    });

  return (
    <>
      <button className="owneredit" onClick={openEdit}>
        Edit studio
      </button>

      {open && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="sheet sheet-full">
            <div className="adderhead">
              <h2>Edit studio</h2>
              <button
                className="iconbtn sheetclose adderclose"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <Icon name="close" size={16} />
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
            <div className="typepick">
              {STUDIO_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`chip${pTypes.includes(t) ? " sel" : ""}`}
                  aria-pressed={pTypes.includes(t)}
                  onClick={() => toggleType(t)}
                >
                  {t}
                </button>
              ))}
            </div>

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
