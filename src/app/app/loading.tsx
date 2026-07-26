// Skeleton for the trainer's own schedule while the app data loads.
export default function Loading() {
  return (
    <section className="screen">
      <div className="pad" style={{ paddingTop: 14 }}>
        <div className="brandbar">
          <div className="skel" style={{ width: 96, height: 26, borderRadius: 7 }} />
          <div className="skel" style={{ width: 38, height: 38, borderRadius: 999 }} />
        </div>
        <div className="skel skel-line" style={{ width: 150, height: 30, margin: "12px 0 22px" }} />
        {[0, 1, 2, 3].map((g) => (
          <div key={g} className="skel-group">
            <div className="skel skel-line" style={{ width: 130, marginBottom: 10 }} />
            <div className="skel skel-event" />
          </div>
        ))}
      </div>
    </section>
  );
}
