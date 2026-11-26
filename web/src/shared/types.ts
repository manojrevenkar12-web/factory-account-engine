// Shapes of the generated files: web/public/data/demo.json and web/public/data/results.json.

export interface Signal { docId: string; companyKey: string; plantKey: string | null; type: string; date: string; quote: string }

export interface ContactView {
  name: string;
  role: string;
  sequence: string[];
  blocked: { channel: string; reason: string }[];
  basis: string;
  enrichment: { email: boolean; phone: boolean; spentEur: number; calls: { provider: string; field: string; hit: boolean; costEur: number }[]; skipped: string[] };
  message: { body: string; sendable: boolean; sentences: { text: string; kind: string; citation: string | null; kept: boolean; reason: string }[] } | null;
}

export interface AccountView {
  plantKey: string;
  company: string;
  city: string;
  country: string;
  industry: string;
  tier: "A" | "B" | "C";
  score: number;
  fit: number;
  timing: number;
  reasons: string[];
  signal: Signal | null;
  contacts: ContactView[];
}

export interface Demo {
  market: { companies: number; plants: number; documents: number; hubspotRecords: number; simulated: boolean };
  signals: { accepted: number; rejected: number; companyLevel: number; byType: [string, number][]; recent: Signal[] };
  tiers: { A: number; B: number; C: number };
  accounts: AccountView[];
  sync: { attachKeys: number; companyUpserts: number; contactUpserts: number; parentChild: number; firstRequests: { method: string; path: string; body: unknown }[] };
  costs: { enrichmentEur: number };
}

export interface DesignMetrics {
  design: string;
  label: string;
  inMarketShareOfWorked: number;
  qualifiedMeetingsPer100Accounts: number;
  pipelineEurPerMonth: number;
  costEurPerQualifiedMeeting: number;
  enrichmentEurPerMonth: number;
  violationsPer100Contacts: number;
  unsupportedPer1kMessages: number;
  signalPrecision: number | null;
  crmDuplicatesPerMonth: number;
}

export interface ResultsFile {
  dev: { seeds: number[]; companiesPerSeed: number; designs: Record<string, DesignMetrics> };
  heldout: { seeds: number[]; designs: Record<string, DesignMetrics> } | null;
  gates: { dev: { id: string; text: string; pass: boolean }[]; heldout: { id: string; text: string; pass: boolean }[] | null };
  headline: { label: string; value: string; note: string }[];
}
