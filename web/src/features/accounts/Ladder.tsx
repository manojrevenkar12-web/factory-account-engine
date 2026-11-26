import { motion } from "framer-motion";
import { motionTokens } from "../../shared/theme/tokens.ts";

/** The enrichment waterfall as a ladder: one rung per provider call, cheapest first, ending at the hit. */
export function Ladder({ calls, skipped, spent }: { calls: { provider: string; field: string; hit: boolean; costEur: number }[]; skipped: string[]; spent: number }) {
  if (calls.length === 0) {
    return (
      <div className="ladder ladder-empty">
        <span className="rung rung-none">Nothing bought</span>
        <span className="ladder-note">{skipped[0] ?? "no lookup needed"}</span>
      </div>
    );
  }
  return (
    <div className="ladder" aria-label={`Enrichment: ${calls.length} lookups, €${spent.toFixed(2)}`}>
      {calls.map((c, k) => (
        <motion.span
          key={k}
          className={`rung ${c.hit ? "rung-hit" : "rung-miss"}`}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: motionTokens.quick, delay: k * motionTokens.rung }}
        >
          <span>{c.field} · {c.provider}</span>
          <b>€{c.costEur.toFixed(2)}</b>
        </motion.span>
      ))}
      <span className="ladder-note">€{spent.toFixed(2)} spent{skipped.length ? ` · ${skipped[0]}` : ""}</span>
    </div>
  );
}
