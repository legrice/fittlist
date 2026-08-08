// Skeletons, for any screen that is not loading fast enough. Next serves a
// route's loading.tsx the moment a navigation starts, so a fast load swaps
// it out before it registers and a slow one shows the page's shape instead
// of a blank. The shapes echo the real furniture (a band, then white boxes
// with a time column) rather than pretending to be content: gray bars where
// words will be, and the shimmer says something is coming.

/** A banded class list mid-load: the calendar's and Following's shape. */
export function ListSkeleton({ days = 3 }: { days?: number }) {
  return (
    <div className="skelwrap" aria-busy="true" aria-label="Loading">
      {Array.from({ length: days }, (_, d) => (
        <div key={d} className="skelday">
          <span className="skel skel-band" />
          {Array.from({ length: d === 1 ? 2 : 1 }, (_, i) => (
            <div key={i} className="skelrow">
              <span className="skel skel-t" />
              <span className="skel skel-nm" />
              <span className="skel skel-sub" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A profile mid-load: the hero block, the name, the two pills, the tabs,
 *  then rows. One skeleton for a person's page and a studio's. */
export function ProfileSkeleton() {
  return (
    <section className="skelprof" aria-busy="true" aria-label="Loading">
      <div className="skel skelprof-hero" />
      <div className="skelprof-pad">
        <span className="skel skel-title" />
        <div className="skel-pillrow">
          <span className="skel skel-pill" />
          <span className="skel skel-pill" />
        </div>
        <div className="skel-pillrow">
          <span className="skel skel-tab" />
          <span className="skel skel-tab" />
          <span className="skel skel-tab" />
        </div>
        <ListSkeleton days={2} />
      </div>
    </section>
  );
}

/** The share hub mid-load: title, the segment pills, the two doors, the
 *  poster's tall block. */
export function HubSkeleton() {
  return (
    <div className="cardwrap" aria-busy="true" aria-label="Loading">
      <span className="skel skel-title" style={{ marginTop: 14 }} />
      <div className="skel-pillrow">
        <span className="skel skel-pill" />
        <span className="skel skel-pill" />
        <span className="skel skel-pill" />
      </div>
      <div className="skel-doorrow">
        <span className="skel skel-door" />
        <span className="skel skel-door" />
      </div>
      <span className="skel skel-poster" />
    </div>
  );
}
