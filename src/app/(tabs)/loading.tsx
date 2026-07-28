// Only the content area. The header and the tab bar live in the layout above
// this, so they stay on screen while a tab loads instead of unmounting and
// coming back. Nothing here pretends to be content: an empty space that fills
// in reads better than blocks that shimmer and then move.
export default function Loading() {
  return <div className="tabloading" aria-busy="true" />;
}
