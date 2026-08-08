import { HubSkeleton } from "@/components/Skeletons";

// The hub's shape while it loads: the header and the bar stay via the
// layout above, and the content area sketches itself in.
export default function Loading() {
  return <HubSkeleton />;
}
