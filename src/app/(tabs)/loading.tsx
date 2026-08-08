// Only the content area. The header and the tab bar live in the layout above
// this, so they stay on screen while a tab loads instead of unmounting and
// coming back. It was deliberately blank for a while; it sketches the list's
// own shape now, by Matt's call, so a slow tab reads as arriving rather than
// missing.
import { ListSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="tabloading" aria-busy="true">
      <ListSkeleton />
    </div>
  );
}
