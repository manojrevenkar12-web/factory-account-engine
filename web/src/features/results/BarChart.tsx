import { motion } from "framer-motion";
import { useState } from "react";
import { motionTokens } from "../../shared/theme/tokens.ts";

interface Row { label: string; value: number; best: boolean }

/** Horizontal bars, one series: the platform bar in safety orange, the rest in ink. Hover or focus shows the exact value. */
export function BarChart({ title, rows, format }: { title: string; rows: Row[]; format: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <figure className="bars">
      <figcaption>{title}</figcaption>
      {rows.length === 0 ? <p className="muted">No data for this measure.</p> : rows.map((r, k) => (
        <div key={r.label} className="bar-row" tabIndex={0} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(k)} onBlur={() => setHover(null)} aria-label={`${r.label}: ${format(r.value)}`}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <motion.span className={`bar-fill${r.best ? " is-best" : ""}`} initial={{ scaleX: 0 }} animate={{ scaleX: r.value / max }} transition={{ duration: motionTokens.base * 2, ease: motionTokens.ease, delay: k * motionTokens.rung }} />
          </span>
          <b className={hover === k ? "is-hover" : ""}>{format(r.value)}</b>
        </div>
      ))}
    </figure>
  );
}
