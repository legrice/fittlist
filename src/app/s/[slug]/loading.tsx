import { ProfileSkeleton } from "@/components/Skeletons";

// A studio page loads with the same shape a person's does: one skeleton,
// because they are one header.
export default function Loading() {
  return <ProfileSkeleton />;
}
