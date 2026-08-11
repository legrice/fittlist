"use client";

import { useEffect, useRef, useState } from "react";

export function ProfileAbout({ text, className = "profabout" }: { text: string; className?: string }) {
  const copy = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    const measure = () => {
      if (!expanded && copy.current) {
        setCanExpand(copy.current.scrollHeight > copy.current.clientHeight + 1);
      }
    };

    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [expanded, text]);

  return (
    <div className={`profile-about-wrap${expanded ? " open" : ""}`}>
      <p ref={copy} className={`${className} profile-about-copy`}>{text}</p>
      {canExpand && (
        <button className="profile-about-more" type="button" onClick={() => setExpanded((open) => !open)}>
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
