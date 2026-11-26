// Shared shapes. A plant is the account: that is where an assembly line, its engineers and its budget are.

export type SignalType =
  | "ie_hiring" | "lean_hiring" | "assembler_hiring" | "new_line" | "plant_expansion" | "reshoring_us" | "closure" | "hiring_freeze";

export const SIGNAL_TYPES: readonly SignalType[] = [
  "ie_hiring", "lean_hiring", "assembler_hiring", "new_line", "plant_expansion", "reshoring_us", "closure", "hiring_freeze",
];

export type PlantType = "manual_assembly" | "mixed_assembly" | "automated_assembly" | "process" | "warehouse";
export type Role = "plant_manager" | "head_industrial_engineering" | "lean_manager" | "production_manager" | "vp_operations";

/** A raw document from a job board, a press release or an exhibitor list. Untrusted text. */
export interface SignalDoc {
  id: string;
  source: "jobboard" | "press" | "fair";
  publishedAt: string;
  text: string;
}

/** What a reader claims a document says. Nothing here is trusted until validateSignal accepts it. */
export interface ExtractedSignal {
  docId: string;
  company: string;
  plantCity: string | null;
  country: string | null;
  type: string;
  date: string;
  quote: string;
}

export interface Company {
  key: string;
  name: string;
  domain: string;
  hqCountry: string;
  industry: string;
  employees: number;
}

export interface Plant {
  key: string;
  companyKey: string;
  city: string;
  country: string;
  plantType: PlantType | null;
  lines: number | null;
}

export interface AcceptedSignal {
  docId: string;
  companyKey: string;
  plantKey: string | null;
  type: SignalType;
  date: string;
  quote: string;
}

export interface Contact {
  key: string;
  plantKey: string | null;
  companyKey: string;
  role: Role;
  name: string;
  email: string | null;
  phone: string | null;
  consent: { express: string | null; presumed: string | null };
}
