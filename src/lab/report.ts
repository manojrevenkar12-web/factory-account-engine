// Turns result files into REPORT.md, the README dashboard and the console's data. Never edit those by hand.

import type { DesignMetrics } from "./study.ts";

export interface Results { run: "dev" | "heldout"; seeds: number[]; companiesPerSeed: number; configHash: string; designs: Record<string, DesignMetrics> }
export interface Gate { id: string; text: string; left: string; op: ">=" | "<=" | "=="; right: number | string; factor?: number; plus?: number }
export interface GateResult { id: string; text: string; pass: boolean; left: number; right: number; op: string }

function lookup(r: Results, path: string): number {
  const v = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], r);
  if (typeof v !== "number") throw new Error(`gate path ${path} is not a number`);
  return v;
}

export function evaluateGates(r: Results, gates: Gate[]): GateResult[] {
  return gates.map((g) => {
    const left = lookup(r, g.left);
    const base = typeof g.right === "number" ? g.right : lookup(r, g.right);
    const right = Math.round((base * (g.factor ?? 1) + (g.plus ?? 0)) * 1000) / 1000;
    const pass = g.op === ">=" ? left >= right : g.op === "<=" ? left <= right : left === right;
    return { id: g.id, text: g.text, pass, left, right, op: g.op };
  });
}

const eur = (x: number): string => `€${x.toLocaleString("en-US")}`;
const eurk = (x: number): string => `€${Math.round(x / 1000).toLocaleString("en-US")}k`;
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const num = (x: number | null): string => (x === null ? "–" : x.toLocaleString("en-US"));

function table(r: Results, names: string[]): string {
  const head = "| Design | In-market plants worked | Qualified meetings / 100 accounts | Pipeline / month | Cost per qualified meeting | Enrichment / month | Outreach-law violations / 100 contacts | False claims / 1k messages | Duplicate CRM records / month |";
  const sep = "|---|--:|--:|--:|--:|--:|--:|--:|--:|";
  const rows = names.map((n) => r.designs[n]).filter((m): m is DesignMetrics => !!m).map((m) =>
    `| ${m.label} | ${pct(m.inMarketShareOfWorked)} | ${num(m.qualifiedMeetingsPer100Accounts)} | ${eurk(m.pipelineEurPerMonth)} | ${eur(m.costEurPerQualifiedMeeting)} | ${eur(m.enrichmentEurPerMonth)} | ${num(m.violationsPer100Contacts)} | ${num(m.unsupportedPer1kMessages)} | ${num(m.crmDuplicatesPerMonth)} |`);
  return [head, sep, ...rows].join("\n");
}

export function headline(r: Results): { label: string; value: string; note: string }[] {
  const p = r.designs.platform as DesignMetrics;
  const s = r.designs.sdr_manual as DesignMetrics;
  const c = r.designs.clay_all as DesignMetrics;
  const nv = r.designs.platform_no_validation as DesignMetrics;
  return [
    { label: "Qualified meetings vs today", value: `${(p.qualifiedMeetingsPer100Accounts / s.qualifiedMeetingsPer100Accounts).toFixed(1)}×`, note: `${num(s.qualifiedMeetingsPer100Accounts)} → ${num(p.qualifiedMeetingsPer100Accounts)} per 100 accounts worked` },
    { label: "Cost per qualified meeting", value: `${eur(s.costEurPerQualifiedMeeting)} → ${eur(p.costEurPerQualifiedMeeting)}`, note: `enrich-everything: ${eur(c.costEurPerQualifiedMeeting)}` },
    { label: "Enrichment spend per month", value: `${eur(c.enrichmentEurPerMonth)} → ${eur(p.enrichmentEurPerMonth)}`, note: "no email bought for a country where it cannot be used" },
    { label: "Outreach-law violations", value: num(p.violationsPer100Contacts), note: `today: ${num(s.violationsPer100Contacts)} per 100 contacts, mostly cold email to Germany` },
    { label: "Signals that are true", value: pct(p.signalPrecision ?? 0), note: `without validation: ${pct(nv.signalPrecision ?? 0)}; false claims ${num(nv.unsupportedPer1kMessages)} → ${num(p.unsupportedPer1kMessages)} per 1k messages` },
    { label: "In-market plants among those worked", value: `${pct(s.inMarketShareOfWorked)} → ${pct(p.inMarketShareOfWorked)}`, note: "plants with a real need and timing this quarter" },
  ];
}

export function dashboard(dev: Results, held: Results | null, dg: GateResult[], hg: GateResult[] | null): string {
  const names = Object.keys(dev.designs);
  const main = ["sdr_manual", "clay_all", "model_alone", "platform"];
  const tiles = headline(dev);
  const out: string[] = [];
  out.push(`Dev seeds ${dev.seeds.join(", ")}: a market of ${dev.companiesPerSeed.toLocaleString("en-US")} manufacturing companies and their plants per seed. Every design works the same number of accounts per month, on the same market and the same luck.`);
  out.push("", "| | | |", "|---|---|---|");
  for (let i = 0; i < tiles.length; i += 3) out.push("| " + tiles.slice(i, i + 3).map((t) => `**${t.value}**<br>${t.label}<br><sub>${t.note}</sub>`).join(" | ") + " |");
  out.push("", "### Designs", "", table(dev, main), "");
  out.push("<details><summary>Ablations: the platform with one safeguard removed</summary>", "", table(dev, ["platform", ...names.filter((n) => n.startsWith("platform_"))]), "", "</details>", "");
  out.push("### Gates", "", "| Gate | Dev seeds | Held-out seeds |", "|---|---|---|");
  for (const g of dg) {
    const h = hg?.find((x) => x.id === g.id);
    const show = (x: GateResult): string => `${x.pass ? "pass" : "FAIL"} (${num(x.left)} ${x.op} ${num(x.right)})`;
    out.push(`| ${g.text} | ${show(g)} | ${h ? show(h) : "not run"} |`);
  }
  if (held) {
    out.push("", `Held-out seeds ${held.seeds.join(", ")} ran once, after the gates were frozen; see \`reports/heldout.lock\`.`, "", table(held, main));
  }
  return out.join("\n");
}

export function fullReport(dev: Results, held: Results | null, dg: GateResult[], hg: GateResult[] | null): string {
  const lines = ["# Results", "", "Generated by `npm run report`. Do not edit.", "", dashboard(dev, held, dg, hg), "", "## All metrics, dev seeds", ""];
  const keys = Object.keys(dev.designs.platform as DesignMetrics).filter((k) => k !== "design" && k !== "label");
  lines.push(`| Design | ${keys.join(" | ")} |`, `|---|${keys.map(() => "--:").join("|")}|`);
  for (const m of Object.values(dev.designs)) lines.push(`| ${m.design} | ${keys.map((k) => String((m as unknown as Record<string, unknown>)[k] ?? "–")).join(" | ")} |`);
  return lines.join("\n") + "\n";
}
