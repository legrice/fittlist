"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { settingsSheetData, type SettingsSheetData } from "@/app/actions/settings";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { MemberAccount } from "@/components/MemberAccount";
import { ProfileSheet } from "@/components/ProfileSheet";

/**
 * The gear on your own profile, and the settings sheet behind it.
 *
 * It was a link to /settings, which swapped the whole page; it slides the
 * account up over your profile now, the same move Edit profile and Share
 * profile make, with the same close in the corner. The route survives (old
 * links, the OAuth callback, a member's ?edit=1 deep link all land there);
 * this is the door most taps go through.
 *
 * The data loads on open through the same server function the page uses, so
 * the two skins cannot drift. Portaled to the body, because the gear sits in
 * the pinned head and sticky is a stacking context on mobile: rendered in
 * place, the overlay would paint under the card that slides over the chrome.
 */
export function SettingsGear({ header = false }: {
  /** Drawn as one of the header's icon buttons rather than the profile
   *  head's floating circle: the corner is where the gear lives now. */
  header?: boolean;
}) {
  const [data, setData] = useState<SettingsSheetData | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const openSheet = async () => {
    setOpen(true);
    const d = await settingsSheetData();
    if (d) setData(d);
    // Mid-signup, or a state the sheet has no answer for: the page decides.
    else router.push("/settings");
  };
  // Settings change what the page behind shows (the name, the photo, the
  // look), so closing is where it catches up.
  const close = () => {
    setOpen(false);
    setData(null);
    router.refresh();
  };

  return (
    <>
      <button
        className={header ? "iconbtn inboxbtn" : "profgear"}
        aria-label="Settings"
        onClick={openSheet}
      >
        <Icon name="settings" size={23} />
      </button>
      {open && data && (
        <BodyPortal>
          {data.kind === "coach" ? (
            <ProfileSheet {...data.coach} onClose={close} />
          ) : (
            <div className="acctwrap" role="dialog" aria-label="Your account">
              <div className="accttop">
                <h1 className="acct-h">Settings</h1>
                <button className="iconbtn acctclose" aria-label="Close" onClick={close}>
                  <Icon name="close" size={20} />
                </button>
              </div>
              <MemberAccount {...data.fan} />
            </div>
          )}
        </BodyPortal>
      )}
    </>
  );
}
