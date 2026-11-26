// Runs every design over the same markets and turns the raw counts into the metrics the README reports.

import { runDesign, type Ctx, type DesignSpec, type RunResult } from "./designs.ts";
import type { World } from "./world/world.ts";

export interface DesignMetrics {
  design: string;
  label: string;
  accountsWorked: number;
  inMarketShareOfWorked: number;
  qualifiedMeetingsPer100Accounts: number;
  meetingsPer100Accounts: number;
  pipelineEurPerMonth: number;
  costEurPerQualifiedMeeting: number;
  enrichmentEurPerMonth: number;
  sdrHoursPerMonth: number;
  violationsPer100Contacts: number;
  unsupportedPer1kMessages: number;
  signalPrecision: number | null;
  crmDuplicatesPerMonth: number;
}

const r1 = (x: number): number => Math.round(x * 10) / 10;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

export function metrics(spec: DesignSpec, runs: RunResult[], sdrEurPerHour: number): DesignMetrics {
  const s = runs.reduce<RunResult>((a, b) => {
    const out = { ...a };
    for (const k of Object.keys(b) as (keyof RunResult)[]) out[k] = (a[k] ?? 0) + b[k];
    return out;
  }, {} as RunResult);
  const n = runs.length;
  const cost = s.enrichmentEur + (s.sdrMinutes / 60) * sdrEurPerHour;
  return {
    design: spec.name,
    label: spec.label,
    accountsWorked: Math.round(s.accountsWorked / n),
    inMarketShareOfWorked: r3(s.inMarketWorked / Math.max(1, s.accountsWorked)),
    qualifiedMeetingsPer100Accounts: r1((s.qualifiedMeetings / Math.max(1, s.accountsWorked)) * 100),
    meetingsPer100Accounts: r1((s.meetings / Math.max(1, s.accountsWorked)) * 100),
    pipelineEurPerMonth: Math.round(s.pipelineEur / n),
    costEurPerQualifiedMeeting: Math.round(cost / Math.max(1, s.qualifiedMeetings)),
    enrichmentEurPerMonth: Math.round(s.enrichmentEur / n),
    sdrHoursPerMonth: Math.round(s.sdrMinutes / 60 / n),
    violationsPer100Contacts: r1((s.violations / Math.max(1, s.contactsTouched)) * 100),
    unsupportedPer1kMessages: r1((s.unsupportedMessages / Math.max(1, s.messages)) * 1000),
    signalPrecision: s.signalsAccepted > 0 ? r3(s.signalsTrue / s.signalsAccepted) : null,
    crmDuplicatesPerMonth: r1(s.crmDuplicates / n),
  };
}

export function runStudy(world: World, ctx: Omit<Ctx, "world">, designs: DesignSpec[], seeds: number[]): DesignMetrics[] {
  const markets = seeds.map((s) => world.market(s));
  return designs.map((d) => metrics(d, markets.map((m) => runDesign(d, m, { ...ctx, world })), ctx.platform.costs.sdrEurPerHour));
}
