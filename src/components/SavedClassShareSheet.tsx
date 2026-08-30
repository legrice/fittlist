"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  addGroupClasses,
  managedGroupDestinations,
  type GroupDestination,
} from "@/app/actions/groups";
import { recordShareImageExport } from "@/app/actions/product-activity";
import { Icon } from "@/components/Icon";
import { loadClientMemory, readClientMemory } from "@/lib/client-memory";
import { canShareFiles, putImage } from "@/lib/shareimage";

type PreparedImage = { file: File; url: string };
const MANAGED_GROUPS_MEMORY_KEY = "sheet:saved-class:managed-groups";

/**
 * The focused share moment after a save or RSVP.
 *
 * The picture is prepared before the button is tapped, so Share is one act,
 * not a trip through an editor. Adding it to a managed group and sharing the
 * whole week remain available, but the class stays the subject.
 */
export function SavedClassShareSheet({
  classId,
  iso,
  name,
  saveKind,
  onClose,
  onToast,
}: {
  classId: string;
  iso: string;
  name: string;
  saveKind: "saved" | "rsvp";
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [initialGroups] = useState<GroupDestination[] | null>(() =>
    readClientMemory<GroupDestination[]>(MANAGED_GROUPS_MEMORY_KEY),
  );
  const [groups, setGroups] = useState<GroupDestination[]>(initialGroups ?? []);
  const [groupsReady, setGroupsReady] = useState(initialGroups !== null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupSaved, setGroupSaved] = useState<Record<string, boolean>>({});
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [prepareFailed, setPrepareFailed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [groupPending, startGroup] = useTransition();
  const [bust] = useState(() => Date.now());
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const fileName = useMemo(
    () =>
      `fittlist-${
        name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "class"
      }.png`,
    [name],
  );
  const cardUrl = `/api/card/class/${classId}?d=${encodeURIComponent(iso)}&theme=iron&v=${bust}`;

  const dismiss = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMounted(true);
    return () => previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!mounted) return undefined;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismiss, mounted]);

  useEffect(() => {
    let live = true;
    void loadClientMemory(MANAGED_GROUPS_MEMORY_KEY, managedGroupDestinations)
      .then((rows) => {
        if (live && rows !== null) {
          setGroups(rows);
          setGroupsReady(true);
        }
      })
      .catch(() => {
        // The optional group hand-off never blocks sharing the class.
        if (live) setGroupsReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  // Fetch once, then use the complete PNG for both the preview and Safari's
  // share call. Safari can withdraw user activation while an image fetch is
  // in flight after the tap, so preparing before the tap keeps Share reliable.
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    let objectUrl: string | null = null;
    setPrepared(null);
    setPrepareFailed(false);
    void (async () => {
      try {
        const response = await fetch(cardUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`Share image returned ${response.status}`);
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!live) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
          return;
        }
        setPrepared({
          file: new File([blob], fileName, { type: blob.type || "image/png" }),
          url: objectUrl,
        });
      } catch (error) {
        if (live && (error as Error)?.name !== "AbortError") setPrepareFailed(true);
      }
    })();
    return () => {
      live = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [cardUrl, fileName]);

  useEffect(() => {
    const receive = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      if (message) onToast(message);
    };
    window.addEventListener("fittlist:native-share-result", receive);
    return () => window.removeEventListener("fittlist:native-share-result", receive);
  }, [onToast]);

  const nativeShare = () => {
    const handler = (window as typeof window & {
      webkit?: {
        messageHandlers?: {
          fittlistShareTarget?: { postMessage: (body: unknown) => void };
        };
      };
    }).webkit?.messageHandlers?.fittlistShareTarget;
    if (!handler) return false;
    handler.postMessage({
      target: "more",
      url: new URL(cardUrl, window.location.href).href,
      file: fileName,
    });
    return true;
  };

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (nativeShare()) {
        void recordShareImageExport();
        return;
      }
      if (prepared && canShareFiles() && navigator.canShare({ files: [prepared.file] })) {
        try {
          await navigator.share({ files: [prepared.file], title: name });
          void recordShareImageExport();
          return;
        } catch (error) {
          if ((error as Error)?.name === "AbortError") throw error;
        }
      }
      if (prepared) {
        const link = document.createElement("a");
        link.href = prepared.url;
        link.download = fileName;
        link.click();
        void recordShareImageExport();
        onToast("Image downloaded");
        return;
      }
      if (!(await putImage(cardUrl, fileName))) {
        onToast("Couldn't share the class");
        return;
      }
      void recordShareImageExport();
      if (!canShareFiles()) onToast("Image downloaded");
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") onToast("Couldn't share the class");
    } finally {
      setSharing(false);
    }
  };

  const addToGroup = (group: GroupDestination) => {
    if (groupSaved[group.id] || pendingGroupId || groupPending) return;
    setPendingGroupId(group.id);
    startGroup(async () => {
      try {
        const result = await addGroupClasses(group.slug, [{ classId, iso }]);
        if (!result.ok) {
          onToast(result.error);
          return;
        }
        setGroupSaved((current) => ({ ...current, [group.id]: true }));
        onToast(result.count ? `${name} was added to ${group.name}` : `${name} is already in ${group.name}`);
      } catch {
        onToast("Couldn't add that class to the group");
      } finally {
        setPendingGroupId(null);
      }
    });
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="sheet-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        ref={dialogRef}
        className="sheet postsave-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="postsave-title"
        aria-describedby="postsave-lead"
        data-groups-ready={groupsReady ? "true" : "false"}
      >
        <button
          ref={closeRef}
          className="iconbtn sheetclose"
          type="button"
          aria-label="Close"
          onClick={dismiss}
        >
          <Icon name="close" size={18} />
        </button>

        <div className="postsave-head">
          <span aria-hidden="true"><Icon name="check" size={18} /></span>
          <div>
            <h2 id="postsave-title">{saveKind === "rsvp" ? "RSVP sent" : "Saved to your week"}</h2>
            <p id="postsave-lead">
              {saveKind === "rsvp"
                ? "Your name is on the organizer’s roster. Want company?"
                : "Want company? Share this class while the plan is fresh."}
            </p>
          </div>
        </div>

        <span className="postsave-preview" aria-busy={!prepared && !prepareFailed}>
          {prepared ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={prepared.url} alt={`${name} share image`} />
          ) : prepareFailed ? (
            <span className="postsave-preview-failed" role="status">Couldn&rsquo;t draw the image</span>
          ) : (
            <span className="postsave-preview-loading" role="status" aria-live="polite">
              <Icon name="image" size={30} />
              <span className="sr-only">Preparing share image</span>
            </span>
          )}
        </span>

        <div className="postsave-actions">
          <button type="button" className="btn si" disabled={sharing || (!prepared && !prepareFailed)} onClick={share}>
            <Icon name="reply" className="share-arrow-forward" size={20} />
            {sharing
              ? "Opening share sheet..."
              : !prepared && !prepareFailed
                ? "Preparing image..."
                : prepareFailed
                  ? "Try sharing"
                  : "Share this class"}
          </button>

          {groups.length > 0 && (
            <>
              <button
                className="postsave-row"
                type="button"
                aria-expanded={groupsOpen}
                aria-controls="postsave-groups"
                onClick={() => setGroupsOpen((open) => !open)}
              >
                <span><Icon name="groups" size={20} /></span>
                <strong>Add to a group you manage</strong>
                <Icon name={groupsOpen ? "expand_less" : "expand_more"} size={21} />
              </button>

              {groupsOpen && (
                <div className="postsave-groups" id="postsave-groups">
                  {groups.map((group) => {
                    const added = !!groupSaved[group.id];
                    const adding = pendingGroupId === group.id;
                    return (
                      <button
                        type="button"
                        aria-disabled={!!pendingGroupId || groupPending || added}
                        aria-label={`${adding ? "Adding to" : added ? "Added to" : "Add to"} ${group.name}`}
                        onClick={() => addToGroup(group)}
                        key={group.id}
                      >
                        <span><Icon name="groups" size={19} /></span>
                        <strong>{group.name}</strong>
                        <span className="postsave-group-status">
                          {adding ? "Adding…" : added ? "Added" : <Icon name="add_circle" size={22} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <Link className={`postsave-week${groups.length ? "" : " first"}`} href="/share">
            <Icon name="calendar_month" size={19} />
            Share my whole week
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
