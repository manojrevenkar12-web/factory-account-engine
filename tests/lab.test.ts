import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadConfig, ROOT } from "../src/core/config.ts";
import { ClaudeReader, parseSignals, RegexReader, type MessagesClient } from "../src/core/model/readers.ts";
import { runDesign, type DesignSpec } from "../src/lab/designs.ts";
import { evaluateGates, type Results } from "../src/lab/report.ts";
import { SimModel } from "../src/lab/simmodel.ts";
import { runStudy } from "../src/lab/study.ts";
import { World } from "../src/lab/world/world.ts";

const world = new World();
const cfg = loadConfig();
const m = world.market(31);

describe("the world", () => {
  it("does not read the platform's settings or import the core", () => {
    for (const f of readdirSync(`${ROOT}src/lab/world`)) {
      const src = readFileSync(`${ROOT}src/lab/world/${f}`, "utf8");
      expect(src, f).not.toMatch(/config\/platform\.json|config\/seller|\.\.\/\.\.\/core/);
    }
  });
  it("is deterministic and gives each plant a unique key", () => {
    expect(world.market(31).docs.slice(0, 20)).toEqual(m.docs.slice(0, 20));
    expect(new Set(m.plants.map((p) => p.key)).size).toBe(m.plants.length);
    expect(m.plants.some((p) => p.inMarket)).toBe(true);
  });
});

describe("readers", () => {
  it("the regex reader reads every generated document correctly", async () => {
    const r = new RegexReader();
    for (const d of m.docs.slice(0, 400)) {
      const [x] = await r.read(d);
      expect(x, d.text).toMatchObject({ type: d.truth.type, company: d.truth.nameUsed, plantCity: d.truth.cityUsed, quote: d.truth.quote });
    }
  });
  it("Claude's output is parsed defensively and the document is fenced as data", async () => {
    const d = m.docs[0] as (typeof m.docs)[number];
    expect(parseSignals('x {"signals":[{"company":"A","type":"new_line","quote":"q","plantCity":null},{"bad":1}]} y', d)).toHaveLength(1);
    expect(parseSignals("not json", d)).toEqual([]);
    let seen = "";
    const client: MessagesClient = { messages: { create: async (a) => { seen = a.messages[0]?.content ?? ""; return { content: [{ type: "text", text: '{"signals":[]}' }] }; } } };
    await new ClaudeReader(client, "m", 100).read(d);
    expect(seen).toMatch(/<<<\n[\s\S]+\n>>>/);
    const failing: MessagesClient = { messages: { create: async () => { throw new Error("timeout"); } } };
    expect(await new ClaudeReader(failing, "m", 100).read(d)).toEqual([]);
  });
});

describe("same luck for every design", () => {
  it("two runs of a design on the same market are identical", () => {
    const spec: DesignSpec = { name: "platform", kind: "platform", label: "" };
    const a = runDesign(spec, m, { ...cfg, world, sim: new SimModel(world) });
    const b = runDesign(spec, m, { ...cfg, world, sim: new SimModel(world) });
    expect(a).toEqual(b);
  });
  it("on a small market the platform beats today's process and breaks no outreach rule", () => {
    const designs = (JSON.parse(readFileSync(`${ROOT}config/lab/designs.json`, "utf8")) as { designs: DesignSpec[] }).designs.filter((d) => ["sdr_manual", "platform"].includes(d.name));
    const r = Object.fromEntries(runStudy(world, { ...cfg, sim: new SimModel(world) }, designs, [31]).map((x) => [x.design, x]));
    expect(r.platform?.qualifiedMeetingsPer100Accounts).toBeGreaterThan(r.sdr_manual?.qualifiedMeetingsPer100Accounts ?? Infinity);
    expect(r.platform?.violationsPer100Contacts).toBe(0);
    expect(r.sdr_manual?.violationsPer100Contacts).toBeGreaterThan(10);
  });
});

describe("gates", () => {
  it("compare a metric with a number or another metric", () => {
    const r = { designs: { a: { x: 10 }, b: { x: 3 } } } as unknown as Results;
    expect(evaluateGates(r, [
      { id: "1", text: "", left: "designs.a.x", op: ">=", right: "designs.b.x", factor: 3 },
      { id: "2", text: "", left: "designs.b.x", op: "==", right: 3 },
      { id: "3", text: "", left: "designs.a.x", op: ">=", right: "designs.b.x", factor: 1, plus: 8 },
    ]).map((g) => g.pass)).toEqual([true, true, false]);
  });
});

describe("n8n workflows", () => {
  it("are importable: nodes have ids and types, and every connection points at a node", () => {
    for (const f of readdirSync(`${ROOT}n8n`)) {
      const wf = JSON.parse(readFileSync(`${ROOT}n8n/${f}`, "utf8")) as { name: string; nodes: { id: string; name: string; type: string }[]; connections: Record<string, { main: { node: string }[][] }> };
      const names = new Set(wf.nodes.map((n) => n.name));
      expect(wf.name, f).toMatch(/^FAE:/);
      for (const n of wf.nodes) expect(n.type, `${f} ${n.name}`).toMatch(/^n8n-nodes-base\./);
      for (const [from, c] of Object.entries(wf.connections)) {
        expect(names.has(from), `${f}: ${from}`).toBe(true);
        for (const branch of c.main) for (const t of branch) expect(names.has(t.node), `${f}: -> ${t.node}`).toBe(true);
      }
      expect(JSON.stringify(wf)).not.toMatch(/sk-|pat-|Bearer [A-Za-z0-9]/);
    }
  });
});
