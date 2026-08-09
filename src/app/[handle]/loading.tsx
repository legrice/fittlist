import { ProfileSkeleton } from "@/components/Skeletons";

// A profile's shape while it loads: the hero block where the photo or the
// colour will be, then the name, the pills and the rows.
export default function Loading() {
  return <ProfileSkeleton />;
}
