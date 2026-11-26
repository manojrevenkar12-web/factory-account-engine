import type { Demo } from "../../shared/types.ts";
import { EmptyState } from "../../shared/ui/States.tsx";
import "./signals.css";

const TYPE: Record<string, string> = {
  ie_hiring: "Industrial engineer hiring", lean_hiring: "Lean hiring", assembler_hiring: "Assembly hiring", new_line: "New line",
  plant_expansion: "Plant expansion", reshoring_us: "Reshoring to the US", closure: "Closure", hiring_freeze: "Hiring freeze",
};
const typeLabel = (t: string) => TYPE[t] ?? t.replace(/_/g, " ");

export function SignalsView({ demo }: { demo: Demo }) {
  const s = demo.signals;
  const read = s.accepted + s.rejected;
  if (read === 0) return <EmptyState title="No signals read yet">Point the signal-intake workflow at job boards, press releases and trade news, then run it once.</EmptyState>;
  const max = Math.max(1, ...s.byType.map(([, n]) => n));
  return (
    <section>
      <div className="head">
        <h1>Signals from {demo.market.documents} documents</h1>
        <p>The model reads job ads, press releases and trade news in German and English. Code keeps a signal only if its quote is in the document word for word, the evidence fits its type, the date is in the window and the company resolves to a known account.</p>
      </div>
      <div className="funnel" role="img" aria-label={`${read} read, ${s.rejected} rejected, ${s.accepted} kept, ${s.companyLevel} only at company level`}>
        <Step n={read} label="read by the model" width={1} />
        <Step n={s.accepted} label="kept by the checks" width={s.accepted / read} tone="go" />
        <Step n={s.accepted - s.companyLevel} label="tied to a plant" width={(s.accepted - s.companyLevel) / read} tone="go" />
      </div>
      <p className="muted funnel-note">{s.rejected} rejected. {s.companyLevel} kept at company level because the document names no city, so they count at a 35% share for each plant.</p>
      <div className="sig-grid">
        <div>
          <h2 className="sub">Kept, by type</h2>
          <ul className="types">
            {s.byType.map(([t, n]) => (
              <li key={t}>
                <span>{typeLabel(t)}</span>
                <span className="type-bar" style={{ inlineSize: `${(n / max) * 100}%` }} />
                <b>{n}</b>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="sub">Most recent</h2>
          {s.recent.length === 0 ? <p className="muted">No signal inside the window.</p> : (
            <ul className="feed">
              {s.recent.map((x) => (
                <li key={x.docId + x.type}>
                  <p>“{x.quote}”</p>
                  <span>{typeLabel(x.type)} · {x.date} · {x.plantKey ?? `${x.companyKey} (company)`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Step({ n, label, width, tone }: { n: number; label: string; width: number; tone?: "go" }) {
  return (
    <div className="step">
      <span className={`step-bar${tone ? ` step-${tone}` : ""}`} style={{ inlineSize: `${Math.max(width, 0.02) * 100}%` }} />
      <span className="step-label"><b>{n}</b> {label}</span>
    </div>
  );
}
