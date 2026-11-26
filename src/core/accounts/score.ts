// Code scores plants: how well the plant fits (industry, plant type, lines) and how ready it is now
// (recent signals, decayed by their half-life). The model never ranks accounts.

import type { AcceptedSignal, Company, Plant, SignalType } from "../types.ts";

export interface Playbook {
  icp: {
    industryFit: Record<string, number>;
    plantTypeFit: Record<string, number>;
    minLines: number;
    servedCountries: string[];
    plantRoles: string[];
    hqRoles: string[];
  };
  signals: Record<SignalType, { weight: number; halfLifeDays: number; label: string; evidence?: string[] }>;
  scoring: { fitWeight: number; timingWeight: number; tierA: number; tierB: number; signalWindowDays: number };
  budgetEurPerAccount: Record<"A" | "B" | "C", number>;
}

export interface PlantScore {
  plantKey: string;
  fit: number;
  timing: number;
  score: number;
  tier: "A" | "B" | "C";
  reasons: string[];
}

/** Company-level signals (no known plant) count for every plant of the company, at this share. */
export const COMPANY_SIGNAL_SHARE = 0.35;

const round = (x: number): number => Math.round(x * 1000) / 1000;

export function scorePlant(plant: Plant, company: Company, signals: AcceptedSignal[], pb: Playbook, asOf: string): PlantScore {
  const reasons: string[] = [];
  const industry = pb.icp.industryFit[company.industry] ?? 0.2;
  const type = plant.plantType ? (pb.icp.plantTypeFit[plant.plantType] ?? 0.2) : 0.55;
  const lines = plant.lines === null ? 0.8 : plant.lines >= pb.icp.minLines ? 1 : 0.4;
  const fit = industry * type * lines;
  reasons.push(`fit ${round(fit)}: ${company.industry} ${industry}, ${plant.plantType ?? "plant type unknown"} ${type}, ${plant.lines ?? "?"} lines ${lines}`);

  const now = Date.parse(asOf);
  let raw = 0;
  let closed = false;
  for (const s of signals) {
    if (s.companyKey !== plant.companyKey) continue;
    if (s.plantKey !== null && s.plantKey !== plant.key) continue;
    const def = pb.signals[s.type];
    const age = (now - Date.parse(s.date)) / 86_400_000;
    const share = s.plantKey === null ? COMPANY_SIGNAL_SHARE : 1;
    const v = def.weight * share * Math.pow(0.5, age / def.halfLifeDays);
    raw += v;
    if (s.type === "closure" && s.plantKey === plant.key) closed = true;
    reasons.push(`${s.type} on ${s.date}${s.plantKey === null ? " (company level)" : ""}: ${v >= 0 ? "+" : ""}${round(v)}`);
  }
  const timing = 1 - Math.exp(-Math.max(0, raw));
  let score = pb.scoring.fitWeight * fit + pb.scoring.timingWeight * timing;
  if (!pb.icp.servedCountries.includes(plant.country)) { score = 0; reasons.push(`${plant.country} is not served`); }
  if (closed) { score = 0; reasons.push("plant closure signal"); }
  const tier = score >= pb.scoring.tierA ? "A" : score >= pb.scoring.tierB ? "B" : "C";
  return { plantKey: plant.key, fit: round(fit), timing: round(timing), score: round(score), tier, reasons };
}
