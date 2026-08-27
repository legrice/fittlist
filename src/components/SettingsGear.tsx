"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { settingsSheetData, type SettingsSheetData } from "@/app/actions/settings";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";

const MemberAccount = dynamic(() => import("@/components/MemberAccount").then((module) => module.MemberAccount));
const ProfileSheet = dynamic(() => import("@/components/ProfileSheet").then((module) => module.ProfileSheet));

/**
 * The gear in the signed-in app header, and the settings sheet behind it.
 *
 * It was a link to /settings, which swapped the whole page; it slides the
 * account up over your profile now, the same move Edit profile and Share
 * profile make, with the same close in the corner. The route survives (old
 * links, the OAuth callback, a member's ?edit=1 deep link all land there);
 * this is the door most taps go through.
 *
 * The data loads on open through the same server function the page uses, so
 * the two skins cannot drift. Portaled to the body, because the header is a
 * sticky stacking context on mobile: rendered in place, the overlay would
 * paint under the card that slides over the chrome.
 */
export function SettingsGear({ header = false, pill = false }: {
  /** Drawn as one of the shared header's icon buttons. */
  header?: boolean;
  /** Drawn as the labeled action in the private profile's pill rail. */
  pill?: boolean;
}) {
  const [data, setData] = useState<SettingsSheetData | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const openSheet = async () => {
    setOpen(true);
    try {
      const d = await settingsSheetData();
      if (d) setData(d);
      // Mid-signup, or a state the sheet has no answer for: the page decides.
      else {
        setOpen(false);
        router.push("/settings");
      }
    } catch {
      setOpen(false);
      router.push("/settings");
    }
  };
  // Settings change what the page behind shows (the name, the photo, the
  // look), so closing is where it catches up.
  const close = () => {
    setOpen(false);
    setData(null);
    router.refresh();
  };
  // A link is already taking the user to a new route. Dismiss the sheet
  // without refreshing the page underneath it: that refresh can race the
  // link navigation and leave the user back on their profile.
  const dismissForNavigation = () => {
    setOpen(false);
    setData(null);
  };

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", escape);
    };
  // Closing also refreshes the page behind the sheet; the effect only needs
  // to follow the sheet's lifetime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={pill ? undefined : header ? `iconbtn inboxbtn${open ? " onroute" : ""}` : "profgear"}
        aria-label="Settings"
        aria-expanded={open}
        onClick={openSheet}
      >
        {pill ? (
          <>
            <Icon name="settings" size={18} />
            <span>Settings</span>
          </>
        ) : <Icon name="settings" size={23} />}
      </button>
      {open && (
        <BodyPortal>
          <div className="header-account-overlay" onMouseDown={close}>
            <section
              className="header-account-sheet settings-account-sheet"
              onMouseDown={(event) => event.stopPropagation()}
              onClickCapture={(event) => {
                if ((event.target as HTMLElement).closest("a")) dismissForNavigation();
              }}
            >
              {data ? data.kind === "coach" ? (
                <ProfileSheet {...data.coach} onClose={close} />
              ) : (
                <div className="acctwrap" role="dialog" aria-label="Your account">
                  <div className="accttop">
                    <h1 className="acct-h">Settings</h1>
                    <button className="iconbtn acctclose" aria-label="Close" onClick={close}>
                      <Icon name="close" size={20} />
                    </button>
                  </div>
                  <MemberAccount {...data.fan} showHeading={false} />
                </div>
              ) : (
                <div className="header-account-loading">
                  <button className="iconbtn acctclose" aria-label="Close" onClick={close}>
                    <Icon name="close" size={20} />
                  </button>
                  <p>Opening settings&hellip;</p>
                </div>
              )}
            </section>
          </div>
        </BodyPortal>
      )}
    </>
  );
}
