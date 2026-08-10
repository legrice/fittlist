"use client";

import { useState } from "react";
import { Toast, useToast } from "@/components/Toast";

// The brand, on one page, reading from the same tokens the app does.
//
// Nothing here is a copy of a value: every swatch names a CSS variable and
// paints itself with it, so the guide can't drift from the product the way a
// PDF does. Change a token in globals.css and this page changes with it.

type Swatch = { name: string; token: string; hex: string; note: string; onDark?: boolean };

const CORE: Swatch[] = [
  { name: "Orange", token: "--si", hex: "#C2410C", note: "The accent, and every primary action", onDark: true },
  { name: "Ink", token: "--ink", hex: "#191502", note: "Text, and dark surfaces", onDark: true },
  { name: "Paper", token: "--paper", hex: "#fdfcf7", note: "The ground everything scrolls on" },
  { name: "Card", token: "--card", hex: "#ffffff", note: "What floats on the paper" },
];

const SUPPORTING: Swatch[] = [
  { name: "Cream", token: "--cl", hex: "#f7f4ea", note: "Headers, tags, quiet fills" },
  { name: "Cream, down one", token: "--cl-d", hex: "#e9e1cc", note: "Chips that need to read off the page" },
  { name: "Soft orange", token: "--si-soft", hex: "#f7e6d6", note: "A tint of the accent" },
  { name: "Sand", token: "--sa", hex: "#d6d1b3", note: "Muted fills" },
  { name: "Outline", token: "--ol", hex: "#6b6555", note: "Secondary text", onDark: true },
  { name: "Line", token: "--line", hex: "#e6dfcd", note: "Dividers and input borders" },
  { name: "Go", token: "--go", hex: "#3d8b53", note: "On, added, confirmed", onDark: true },
];

// 600 is the ceiling. The scale went to 800 (and to 900 in the sheet, which
// the family does not ship, so it rendered as 800), and a screen of class
// names at that weight read as a shout. What works is the pairing the profile
// head has always had: a 600 name over a 400 line of what and where, which is
// the two middle rows here.
const TYPE = [
  { label: "Hero", size: 44, weight: 600, sample: "Find your fit" },
  { label: "Heading", size: 26, weight: 600, sample: "Your week, one link" },
  { label: "Section", size: 18, weight: 600, sample: "What to expect" },
  { label: "Body", size: 15, weight: 400, sample: "Follow coaches and their whole week comes with them." },
  { label: "Label", size: 13, weight: 500, sample: "Wednesday" },
  { label: "Caption", size: 12, weight: 400, sample: "6:00am · 45 min · Ironbound" },
];

function Row({ s, onCopy }: { s: Swatch; onCopy: (hex: string) => void }) {
  return (
    <button type="button" className="brandsw" onClick={() => onCopy(s.hex)}>
      <span className="brandsw-chip" style={{ background: `var(${s.token})` }} aria-hidden="true" />
      <span className="brandsw-txt">
        <span className="brandsw-nm">{s.name}</span>
        <span className="brandsw-note">{s.note}</span>
      </span>
      <span className="brandsw-hex">{s.hex}</span>
    </button>
  );
}

export function BrandGuide({ mark }: { mark: string }) {
  const [toastMsg, toastOn, toast] = useToast();
  const [, setLast] = useState("");

  const copy = async (hex: string) => {
    setLast(hex);
    try {
      await navigator.clipboard.writeText(hex);
      toast(`${hex} copied`);
    } catch {
      toast(hex);
    }
  };

  return (
    <>
      <section className="brandsec">
        <h2 className="brandh">The mark</h2>
        <p className="brandp">
          An F built from rounded blocks: three stacked on the left, a long bar off the top and a
          shorter one off the middle. It reads as a week laid out, which is the whole product in
          one shape. The ink fills its box exactly, so it centres on the box rather than needing
          an offset.
        </p>
        <div className="brandmarks">
          <div className="brandmark on-si" dangerouslySetInnerHTML={{ __html: mark.replace(/fill="[^"]*"/, 'fill="#ffffff"') }} />
          <div className="brandmark on-paper" dangerouslySetInnerHTML={{ __html: mark }} />
          <div className="brandmark on-ink" dangerouslySetInnerHTML={{ __html: mark.replace(/fill="[^"]*"/, 'fill="#fdfcf7"') }} />
        </div>
        <p className="brandp brandp-tight">
          White on orange is the app icon. Orange on paper is the header lockup. Paper on ink is
          for dark surfaces and the share images. It is never two colours at once, and never
          outlined.
        </p>
      </section>

      <section className="brandsec">
        <h2 className="brandh">Core color</h2>
        <p className="brandp">Tap any swatch to copy the hex.</p>
        <div className="brandsws">
          {CORE.map((s) => (
            <Row key={s.token} s={s} onCopy={copy} />
          ))}
        </div>
        <h3 className="brandh3">Supporting</h3>
        <div className="brandsws">
          {SUPPORTING.map((s) => (
            <Row key={s.token} s={s} onCopy={copy} />
          ))}
        </div>
      </section>

      <section className="brandsec">
        <h2 className="brandh">Type</h2>
        <p className="brandp">
          Delight, at five weights: 400, 500, 600, 700 and 800. Headings and buttons are 600.
          Sizes are whole pixels, and tight letter-spacing on anything above 20px.
        </p>
        <div className="brandtype">
          {TYPE.map((t) => (
            <div key={t.label} className="brandtyperow">
              <span className="brandtype-meta">
                {t.label} · {t.size}px · {t.weight}
              </span>
              <span
                className="brandtype-sample"
                style={{
                  fontSize: t.size,
                  fontWeight: t.weight,
                  letterSpacing: t.size > 20 ? "-0.02em" : undefined,
                }}
              >
                {t.sample}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="brandsec">
        <h2 className="brandh">How it sounds</h2>
        <p className="brandp">
          Plain words, short sentences. Say what happens, not how someone should feel about it. No
          exclamation marks. Never &ldquo;simply&rdquo; or &ldquo;just&rdquo;: telling someone a
          thing is easy is only ever a way of telling them off for finding it hard.
        </p>
        <div className="brandsays">
          <div className="brandsay">
            <span className="brandsay-tag good">Say</span>
            <span>Removed. They can&rsquo;t see your page any more.</span>
          </div>
          <div className="brandsay">
            <span className="brandsay-tag bad">Not</span>
            <span>Success! User has been blocked.</span>
          </div>
          <div className="brandsay">
            <span className="brandsay-tag good">Say</span>
            <span>This one has already run.</span>
          </div>
          <div className="brandsay">
            <span className="brandsay-tag bad">Not</span>
            <span>Sorry, you can&rsquo;t register for this class!</span>
          </div>
        </div>
        <h3 className="brandh3">No em dashes</h3>
        <p className="brandp">
          Not in the app, not in an email, not anywhere someone reads. The build fails on them.
          Use a full stop, a semicolon, a pair of commas, a colon, or a comma, whichever the dash
          was standing in for. A hyphen is not a substitute; it reads as a typo. The one exception
          is the date header, where the dash is the shape of a label rather than punctuation.
        </p>
      </section>

      <section className="brandsec">
        <h2 className="brandh">Shape</h2>
        <div className="brandshapes">
          <div className="brandshape">
            <span className="brandshape-box" style={{ borderRadius: 16 }} />
            <span className="brandshape-lbl">Cards, sheets: 16px</span>
          </div>
          <div className="brandshape">
            <span className="brandshape-box" style={{ borderRadius: 12 }} />
            <span className="brandshape-lbl">Inputs, rows: 12px</span>
          </div>
          <div className="brandshape">
            <span className="brandshape-box" style={{ borderRadius: 999 }} />
            <span className="brandshape-lbl">Buttons, pills, avatars: full</span>
          </div>
        </div>
        <p className="brandp brandp-tight">
          Shadows are warm rather than grey: they carry a tint of the ink, so nothing floating
          ever looks like it came from a different palette.
        </p>
      </section>

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
