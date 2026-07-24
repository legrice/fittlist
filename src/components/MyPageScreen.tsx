"use client";

import { Toast, useToast } from "@/components/Toast";
import { Wordmark } from "@/components/Wordmark";

export function MyPageScreen({
  handle,
  visits,
  subsCount,
  classCount,
}: {
  handle: string;
  visits: number;
  subsCount: number;
  classCount: number;
}) {
  const [toastMsg, toastOn, toast] = useToast();
  const url = `fittlist.co/${handle}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${url}`);
      toast("Link copied");
    } catch {
      toast(url);
    }
  };

  return (
    <section className="screen">
      <div className="appbar">
        <Wordmark />
        <div className="sub">My page</div>
      </div>
      <div className="pad" style={{ paddingTop: 4, paddingBottom: 110 }}>
        <h1 className="screen-title">{url}</h1>
        <div className="statgrid">
          <div className="stat">
            <div className="n">{visits}</div>
            <div className="l">visits</div>
            <div className="d">{visits ? "this week" : ""}</div>
          </div>
          <div className="stat">
            <div className="n">{subsCount}</div>
            <div className="l">on your list</div>
            <div className="d">{subsCount ? "get emails" : ""}</div>
          </div>
          <div className="stat">
            <div className="n">{classCount}</div>
            <div className="l">classes</div>
            <div className="d"></div>
          </div>
        </div>
        <div className="linkcard">
          <div className="eyebrow">Your link</div>
          <div className="url">{url}</div>
          <button className="btn si" onClick={copy}>
            Copy link
          </button>
          <div className="hint">
            {classCount
              ? `${subsCount || "No"} ${subsCount === 1 ? "person" : "people"} on your list so far. Every schedule change emails them automatically.`
              : "Your link shows an empty week until you add a class. Drop it in your bio anyway — it never goes stale."}
          </div>
        </div>
        <a className="rowcta" href={`/${handle}`} target="_blank" rel="noopener">
          <span className="ig">👁</span>
          <span>
            <span className="t">Preview your page</span>
            <br />
            <span className="s">Exactly what someone sees when they tap your bio</span>
          </span>
        </a>
      </div>
      <Toast msg={toastMsg} on={toastOn} />
    </section>
  );
}
