// Wrapping the public [handle] segment in a template makes it re-mount on each
// navigation in, so the page (and its loading skeleton) slide in from the left.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-slide">{children}</div>;
}
