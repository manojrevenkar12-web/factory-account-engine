import { useState } from "react";
import { useJson } from "../../shared/data/useJson.ts";
import type { DesignMetrics, ResultsFile } from "../../shared/types.ts";
import { EmptyState, ErrorState, Skeleton } from "../../shared/ui/States.tsx";
import { BarChart } from "./BarChart.tsx";
import "./results.css";

const MAIN = ["sdr_manual", "clay_all", "model_alone", "platform"];
const SHORT: Record<string, string> = { sdr_manual: "Today", clay_all: "Enrich everything", model_alone: "Model alone", platform: "This engine" };
const short = (m: DesignMetrics) => SHORT[m.design] ?? m.label;

export function ResultsView() {
  const r = useJson<ResultsFile>("/data/results.json");
  const [table, setTable] = useState(false);
  if (r.status === "loading") return <Skeleton label="Loading results" lines={6} />;
  if (r.status === "error") return <ErrorState message={r.message} onRetry={r.retry} />;
  const d = r.data;
  const designs = Object.values(d.dev.designs);
  if (designs.length === 0) return <EmptyState title="No results yet">Run npm run lab:dev to compare the designs, then npm run report.</EmptyState>;
  const main = MAIN.map((k) => d.dev.designs[k]).filter((x): x is DesignMetrics => !!x);
  return (
    <section>
      <div className="head">
        <h1>Four ways to run outbound, on the same market</h1>
        <p>Every design works the same simulated plants with the same luck: {d.dev.seeds.length} dev seeds of {d.dev.companiesPerSeed} companies each. The world knows which plants really need line analytics; no design sees that.</p>
      </div>
      <dl className="headline">
        {d.headline.map((h) => (
          <div key={h.label}><dt>{h.label}</dt><dd>{h.value}</dd><p>{h.note}</p></div>
        ))}
      </dl>
      <div className="res-tools">
        <button type="button" className="toggle" aria-pressed={table} onClick={() => setTable((t) => !t)}>{table ? "Show charts" : "Show table"}</button>
      </div>
      <p className="muted legend">Today: firmographic list, HQ contacts, one generic sequence. Enrich everything: every plant through every provider, AI first lines. Model alone: an LLM reads, ranks, writes and picks channels. This engine: the model reads, code decides.</p>
      {table ? <Table rows={designs} /> : (
        <div className="charts">
          <BarChart title="Qualified meetings per 100 accounts worked" rows={main.map((m) => ({ label: short(m), value: m.qualifiedMeetingsPer100Accounts, best: m.design === "platform" }))} format={(v) => v.toFixed(1)} />
          <BarChart title="Cost per qualified meeting" rows={main.filter((m) => m.costEurPerQualifiedMeeting > 0).map((m) => ({ label: short(m), value: m.costEurPerQualifiedMeeting, best: m.design === "platform" }))} format={(v) => `€${Math.round(v)}`} />
          <BarChart title="Outreach-law violations per 100 contacts" rows={main.map((m) => ({ label: short(m), value: m.violationsPer100Contacts, best: m.design === "platform" }))} format={(v) => v.toFixed(1)} />
          <BarChart title="Enrichment spend per month" rows={main.filter((m) => m.enrichmentEurPerMonth > 0).map((m) => ({ label: short(m), value: m.enrichmentEurPerMonth, best: m.design === "platform" }))} format={(v) => `€${Math.round(v).toLocaleString("en")}`} />
        </div>
      )}
      <h2 className="sub">Gates</h2>
      <ul className="gates">
        {d.gates.dev.map((g) => {
          const h = d.gates.heldout?.find((x) => x.id === g.id);
          return (
            <li key={g.id}>
              <span className={`chip ${g.pass ? "chip-go" : "chip-stop"}`}>dev {g.pass ? "pass" : "fail"}</span>
              {h && <span className={`chip ${h.pass ? "chip-go" : "chip-stop"}`}>held-out {h.pass ? "pass" : "fail"}</span>}
              <span>{g.text}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Table({ rows }: { rows: DesignMetrics[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Design</th><th>Qualified mtgs / 100</th><th>Pipeline / month</th><th>€ / qualified mtg</th><th>Enrichment / month</th><th>Violations / 100</th><th>False claims / 1k</th><th>Dupes / month</th></tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.design} className={m.design === "platform" ? "is-best" : ""}>
              <th scope="row">{m.label}</th>
              <td>{m.qualifiedMeetingsPer100Accounts.toFixed(1)}</td>
              <td>€{Math.round(m.pipelineEurPerMonth / 1000)}k</td>
              <td>{m.costEurPerQualifiedMeeting > 0 ? `€${Math.round(m.costEurPerQualifiedMeeting)}` : "–"}</td>
              <td>€{Math.round(m.enrichmentEurPerMonth)}</td>
              <td>{m.violationsPer100Contacts.toFixed(1)}</td>
              <td>{m.unsupportedPer1kMessages.toFixed(1)}</td>
              <td>{m.crmDuplicatesPerMonth.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
