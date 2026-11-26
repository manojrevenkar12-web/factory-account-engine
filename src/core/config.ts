// Loads the seller's playbook, the channel rules and the platform settings.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Playbook } from "./accounts/score.ts";
import type { ProviderConfig } from "./enrich/waterfall.ts";
import type { ClaimPolicy } from "./outreach/claims.ts";
import type { ChannelRules } from "./outreach/channel.ts";

export const ROOT = new URL("../../", import.meta.url).pathname;

export interface SellerPlaybook extends Playbook {
  seller: { name: string; product: string; sender: string; postalAddress: string; unsubscribe: string };
  proofPoints: { id: string; text: string }[];
  messageNeutral: string[];
}

export interface PlatformConfig {
  asOf: string;
  capacity: { accountsPerMonth: number; contactsPerAccount: number };
  costs: { sdrEurPerHour: number; minutesPerTouch: Record<"email" | "phone" | "linkedin" | "letter", number>; minutesManualResearchPerAccount: number; minutesReviewPerAccount: number };
  enrichment: { providers: ProviderConfig[]; verifyEmailCostEur: number };
  claims: ClaimPolicy;
  signals: { maxQuoteChars: number };
  model: { provider: "anthropic"; model: string; maxTokens: number; timeoutMs: number };
  service: { port: number; apiKeys: string; database: string };
}

const read = <T>(root: string, p: string): T => JSON.parse(readFileSync(join(root, p), "utf8")) as T;

export function loadConfig(root = ROOT): { playbook: SellerPlaybook; channels: ChannelRules; platform: PlatformConfig } {
  return {
    playbook: read<SellerPlaybook>(root, "config/seller/playbook.json"),
    channels: read<ChannelRules>(root, "config/seller/channels.json"),
    platform: read<PlatformConfig>(root, "config/platform.json"),
  };
}
