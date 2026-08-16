export default function DiscoverLoading() {
  return (
    <div className="discover-loading" aria-label="Loading Explore" aria-busy="true">
      <div className="discover-loading-tabs" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="discover-loading-search" aria-hidden="true" />
      <div className="discover-loading-filters" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="discover-loading-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="discover-loading-card" key={index}>
            <span className="discover-loading-face" />
            <span className="discover-loading-line" />
            <span className="discover-loading-line short" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading Explore</span>
    </div>
  );
}
