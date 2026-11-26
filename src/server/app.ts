// HTTP API the n8n workflows call. The caller comes from the API key. Ingesting the same document twice
// changes nothing; a suppression is final.

import Fastify, { type FastifyInstance } from "fastify";
import { AccountStore } from "../core/accounts/store.ts";
import { CompanyIndex } from "../core/accounts/resolve.ts";
import { scorePlant } from "../core/accounts/score.ts";
import type { PlatformConfig, SellerPlaybook } from "../core/config.ts";
import type { HubspotCompanyRecord } from "../core/crm/hubspot.ts";
import type { ProviderClient } from "../core/enrich/waterfall.ts";
import type { SignalReader } from "../core/model/readers.ts";
import type { ChannelRules } from "../core/outreach/channel.ts";
import { runPipeline } from "../core/pipeline.ts";
import { validateSignal } from "../core/signals/validate.ts";
import type { Company, Contact, Plant, SignalDoc } from "../core/types.ts";

export interface AccountExport {
  companies: Company[];
  plants: Plant[];
  aliases: Record<string, string>;
  contacts: Contact[];
  suppressed: string[];
  hubspot: HubspotCompanyRecord[];
  docs: SignalDoc[];
}

export interface AppDeps {
  data: AccountExport;
  keys: Set<string>;
  reader: SignalReader;
  providers: ProviderClient;
  playbook: SellerPlaybook;
  channels: ChannelRules;
  platform: PlatformConfig;
}

export function parseKeys(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
  const store = new AccountStore();
  const { data, playbook, platform } = deps;
  for (const c of data.companies) store.upsertCompany(c);
  for (const p of data.plants) store.upsertPlant(p);
  for (const c of data.contacts) store.upsertContact(c);
  for (const k of data.suppressed) store.suppress(k, "imported do-not-contact", platform.asOf);
  const docs: SignalDoc[] = [...data.docs];
  const index = new CompanyIndex(data.companies, data.aliases);
  const plantMap = new Map(data.plants.map((p) => [p.key, p]));
  const evidence = Object.fromEntries(Object.entries(playbook.signals).map(([k, v]) => [k, v.evidence ?? []]));
  let lastTierA = new Set<string>();

  async function ingest(doc: SignalDoc): Promise<{ accepted: number; duplicates: number; rejected: string[] }> {
    const out = { accepted: 0, duplicates: 0, rejected: [] as string[] };
    const found = await deps.reader.read(doc);
    if (found.length === 0) out.rejected.push("no signal found");
    for (const x of found) {
      const v = validateSignal(x, doc, index, plantMap, platform.asOf, playbook.scoring.signalWindowDays, platform.signals.maxQuoteChars, evidence);
      if (!v.accepted) { out.rejected.push(v.reason); continue; }
      if (store.addSignal(v.accepted)) out.accepted++; else out.duplicates++;
    }
    return out;
  }
  const ready = (async () => { for (const d of data.docs) await ingest(d); })();
  app.addHook("onRequest", async () => { await ready; });

  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health") return;
    const h = req.headers.authorization ?? "";
    const key = h.startsWith("Bearer ") ? h.slice(7) : ((req.headers["x-api-key"] as string | undefined) ?? "");
    if (!deps.keys.has(key)) return reply.code(401).send({ error: "unknown API key" });
  });

  app.get("/health", async () => ({ ok: true, companies: store.count("companies"), plants: store.count("plants"), signals: store.count("signals") }));

  app.post<{ Body: { docs?: SignalDoc[] } }>("/v1/signals", async (req, reply) => {
    const incoming = req.body?.docs;
    if (!Array.isArray(incoming) || incoming.length === 0 || incoming.length > 500) return reply.code(400).send({ error: "send 1 to 500 docs" });
    const out = { accepted: 0, duplicates: 0, rejected: [] as { docId: string; reason: string }[] };
    for (const d of incoming) {
      if (!d || typeof d.id !== "string" || typeof d.text !== "string" || typeof d.publishedAt !== "string" || d.text.length > 5000) {
        out.rejected.push({ docId: String(d?.id ?? "?"), reason: "malformed document" });
        continue;
      }
      const doc: SignalDoc = { id: d.id, source: d.source === "press" ? "press" : "jobboard", publishedAt: d.publishedAt, text: d.text };
      if (!docs.some((x) => x.id === doc.id)) docs.push(doc);
      const r = await ingest(doc);
      out.accepted += r.accepted;
      out.duplicates += r.duplicates;
      for (const reason of r.rejected) out.rejected.push({ docId: doc.id, reason });
    }
    return reply.send(out);
  });

  app.post("/v1/score", async () => {
    const companies = new Map(store.companies().map((c) => [c.key, c]));
    const signals = store.signals();
    const scores = store.plants().map((p) => scorePlant(p, companies.get(p.companyKey) as Company, signals, playbook, platform.asOf));
    const tierA = scores.filter((s) => s.tier === "A");
    const fresh = tierA.filter((s) => !lastTierA.has(s.plantKey));
    lastTierA = new Set(tierA.map((s) => s.plantKey));
    const label = (k: string): { company: string; city: string } => {
      const p = plantMap.get(k);
      return { company: p ? (companies.get(p.companyKey)?.name ?? "") : "", city: p?.city ?? "" };
    };
    return { tiers: { A: tierA.length, B: scores.filter((s) => s.tier === "B").length, C: scores.filter((s) => s.tier === "C").length }, newTierA: fresh.map((s) => ({ ...label(s.plantKey), plantKey: s.plantKey, score: s.score, reasons: s.reasons })) };
  });

  app.post<{ Body: { contactKey?: string; reason?: string } }>("/v1/suppress", async (req, reply) => {
    const k = req.body?.contactKey;
    if (!k) return reply.code(400).send({ error: "contactKey is required" });
    store.suppress(k, String(req.body?.reason ?? "requested").slice(0, 200), new Date().toISOString());
    return reply.send({ suppressed: k });
  });

  app.post<{ Body: { accountsToWork?: number } }>("/v1/sync/plan", async (req) => {
    const r = await runPipeline(
      { docs, companies: data.companies, plants: data.plants, aliases: data.aliases, contacts: data.contacts, suppressed: new Set(data.suppressed.filter((k) => store.isSuppressed(k))), hubspot: data.hubspot, accountsToWork: Math.min(500, Number(req.body?.accountsToWork ?? 40)) },
      { reader: deps.reader, drafter: null, providers: deps.providers, playbook, channels: deps.channels, platform, store },
    );
    return { accounts: r.accounts.length, enrichmentEur: r.costs.enrichmentEur, requests: r.requests, skipped: r.sync.skipped.length };
  });

  return app;
}
