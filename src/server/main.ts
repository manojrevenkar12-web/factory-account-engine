// Starts the engine's API over the demo account export (data/demo-market.json, simulated).
// Uses Claude to read documents when ANTHROPIC_API_KEY is set, the regex reader otherwise.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { loadConfig, ROOT } from "../core/config.ts";
import { ClaudeReader, RegexReader, type MessagesClient, type SignalReader } from "../core/model/readers.ts";
import { buildApp, parseKeys, type AccountExport } from "./app.ts";

const cfg = loadConfig();
const market = JSON.parse(readFileSync(join(ROOT, "data/demo-market.json"), "utf8")) as AccountExport & { providerHits: Record<string, { email: string | null; phone: string | null; emailValid: boolean }> };
let reader: SignalReader = new RegexReader();
if (process.env.ANTHROPIC_API_KEY) {
  reader = new ClaudeReader(new Anthropic({ timeout: cfg.platform.model.timeoutMs, maxRetries: 1 }) as unknown as MessagesClient, cfg.platform.model.model, cfg.platform.model.maxTokens);
}
const app = buildApp({
  data: market,
  keys: parseKeys(process.env[cfg.platform.service.apiKeys] ?? "fae-demo-key"),
  reader,
  // Demo provider: answers from the export. Replace with HTTP adapters for real enrichment vendors.
  providers: {
    lookup: (_p, field, t) => { const v = market.providerHits[t.contactKey]?.[field]; return v ? { value: v } : null; },
    verifyEmail: (_e, t) => market.providerHits[t.contactKey]?.emailValid ?? false,
  },
  ...cfg,
});
const port = Number(process.env.PORT ?? cfg.platform.service.port);
await app.listen({ port, host: "0.0.0.0" });
console.log(`factory-account-engine on :${port} with ${reader instanceof ClaudeReader ? "Claude" : "the regex reader"}`);
