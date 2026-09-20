"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import styles from "./preview.module.css";

export default function SharePreview({ onBack }: { onBack: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [headline, setHeadline] = useState("My week in motion");
  const [tone, setTone] = useState("light");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    void document.fonts.load('600 48px Delight').then(() => {
      if (cancelled || !canvas.current) return;
      const ctx = canvas.current.getContext("2d");
      if (!ctx) return;
      const dark = tone === "dark";
      ctx.fillStyle = dark ? "#192126" : "#f5f7f8"; ctx.fillRect(0, 0, 1080, 1920);
      ctx.fillStyle = dark ? "#f5f7f8" : "#192126";
      ctx.font = '600 42px Delight'; ctx.fillText("FittList", 80, 120);
      ctx.font = '600 88px Delight';
      const words = headline.trim().split(/\s+/); let line = "", y = 300;
      for (const word of words) { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > 920 && line) { ctx.fillText(line, 80, y, 920); y += 100; line = word; } else line = next; }
      ctx.fillText(line, 80, y, 920);
      ctx.font = '400 34px Delight'; ctx.fillText("September 19–21 · @mattlegrice", 80, 580);
      const rows = [["SAT · 8:00 AM", "Asana Lab", "Asana Soul Practice"], ["SUN · 10:30 AM", "Sculpt", "Jane DO Jersey City"], ["MON · 6:00 PM", "Guns, Buns, and Lungs", "Ironbound Performance Athletics"]];
      rows.forEach((row, i) => { const top = 700 + i * 300; ctx.fillStyle = dark ? "#29343a" : "#ffffff"; ctx.beginPath(); ctx.roundRect(60, top, 960, 254, 32); ctx.fill(); ctx.fillStyle = dark ? "#f5f7f8" : "#192126"; ctx.font = '500 30px Delight'; ctx.fillText(row[0], 100, top + 60); ctx.font = '600 48px Delight'; ctx.fillText(row[1], 100, top + 130, 875); ctx.font = '400 32px Delight'; ctx.fillText(row[2], 100, top + 190, 875); });
      ctx.fillStyle = "#a1e510"; ctx.beginPath(); ctx.roundRect(80, 1740, 920, 90, 45); ctx.fill(); ctx.fillStyle = "#192126"; ctx.font = '500 34px Delight'; ctx.fillText("Move with me · fittlist.co/mattlegrice", 120, 1798, 840);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [headline, tone]);
  const download = () => { const link = document.createElement("a"); link.download = "fittlist-my-week.png"; link.href = canvas.current!.toDataURL("image/png"); link.click(); };
  return <>
    <button className={styles.backButton} onClick={onBack}><ArrowLeft size={19}/>Back to Calendar</button>
    <h1 className={styles.pageTitle}>Share your week</h1>
    <canvas ref={canvas} width={1080} height={1920} className={styles.shareCanvas} aria-label="Preview of your weekly schedule share image" role="img"/>
    <div className={styles.shareControls}>
      <label>Headline<input value={headline} maxLength={48} onChange={event => setHeadline(event.target.value)}/></label>
      <label>Image appearance<select value={tone} onChange={event => setTone(event.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <button className={styles.copyProfile} onClick={download} disabled={!ready}><Download size={18}/>Save image</button>
      <p className={styles.sectionIntro}>Sample week · 1080 × 1920 PNG</p>
    </div>
  </>;
}
