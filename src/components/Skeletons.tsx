import { LoadingDots } from "@/components/LoadingDots";

// Preserve the route-loader API while using one shared loading treatment.
export function ListSkeleton(_props: { days?: number }) {
  return <div className="route-loading-dots"><LoadingDots label="Loading calendar" /></div>;
}
export function ProfileSkeleton() {
  return <div className="route-loading-dots"><LoadingDots label="Loading profile" /></div>;
}
export function HubSkeleton() {
  return <div className="route-loading-dots"><LoadingDots label="Loading" /></div>;
}
