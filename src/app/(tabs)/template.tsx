// A template re-mounts on every navigation within the group, which is exactly
// the hook the crossfade needs: the layout above it (header, bar) stays put,
// and only the content area fades in as a tab's page arrives.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="tab-fade">{children}</div>;
}
