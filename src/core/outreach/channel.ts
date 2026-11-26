// Code decides which channels a first, unsolicited touch may use, per country and per consent evidence.
// Rules live in config/seller/channels.json so counsel can change them without touching code.

export type Channel = "email" | "phone" | "linkedin" | "letter";
export type Rule = "allowed" | "allowed_with_optout" | "allowed_unless_tps" | "express_consent" | "presumed_consent" | "connect_only" | "forbidden";

export interface ChannelRules {
  default: Record<Channel, Rule> & { basis: string };
  countries: Record<string, Record<Channel, Rule> & { basis: string }>;
  presumedConsentEvidence: string[];
  expressConsentEvidence: string[];
}

export interface ChannelDecision {
  allowed: Channel[];
  blocked: { channel: Channel; reason: string }[];
  basis: string;
  needsOptOut: boolean;
}

export function decideChannels(
  country: string,
  consent: { express: string | null; presumed: string | null },
  suppressed: boolean,
  rules: ChannelRules,
): ChannelDecision {
  const r = rules.countries[country] ?? rules.default;
  if (suppressed) {
    return { allowed: [], blocked: (["email", "phone", "linkedin", "letter"] as Channel[]).map((c) => ({ channel: c, reason: "on the suppression list" })), basis: r.basis, needsOptOut: false };
  }
  const express = consent.express !== null && rules.expressConsentEvidence.includes(consent.express);
  const presumed = express || (consent.presumed !== null && rules.presumedConsentEvidence.includes(consent.presumed));
  const allowed: Channel[] = [];
  const blocked: ChannelDecision["blocked"] = [];
  for (const c of ["email", "phone", "linkedin", "letter"] as Channel[]) {
    const rule = r[c];
    let ok: boolean;
    let why = "";
    switch (rule) {
      case "allowed": case "allowed_with_optout": case "allowed_unless_tps": case "connect_only": ok = true; break;
      case "express_consent": ok = express; why = "needs prior express consent"; break;
      case "presumed_consent": ok = presumed; why = "needs at least presumed consent with documented evidence"; break;
      case "forbidden": ok = false; why = "not allowed"; break;
    }
    if (ok) allowed.push(c); else blocked.push({ channel: c, reason: `${country}: ${c} ${why}` });
  }
  return { allowed, blocked, basis: r.basis, needsOptOut: r.email === "allowed_with_optout" && allowed.includes("email") };
}

/** Sequence order: the cheapest allowed channel that reaches a person first, then the rest. */
export function sequenceFor(d: ChannelDecision, maxSteps = 3): Channel[] {
  const order: Channel[] = ["email", "phone", "linkedin", "letter"];
  return order.filter((c) => d.allowed.includes(c)).slice(0, maxSteps);
}
