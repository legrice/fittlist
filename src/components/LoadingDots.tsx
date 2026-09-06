/** Shared loading feedback, usable in server and client-rendered content. */
export function LoadingDots({ label = "Loading" }: { label?: string }) {
  return <span className="loading-dots" role="status" aria-label={label}><span aria-hidden="true"/><span aria-hidden="true"/><span aria-hidden="true"/></span>;
}
