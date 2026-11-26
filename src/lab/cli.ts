// lab dev [--check] | lab heldout | lab gate | lab report | lab demo

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { loadConfig, ROOT } from "../core/config.ts";
import type { DesignSpec } from "./designs.ts";
import { buildDemo } from "./demo.ts";
import { dashboard, evaluateGates, fullReport, headline, type Gate, type Results } from "./report.ts";
import { SimModel } from "./simmodel.ts";
import { runStudy } from "./study.ts";
import { World } from "./world/world.ts";

const path = (...p: string[]): string => join(ROOT, ...p);
const readJson = <T>(p: string): T => JSON.parse(readFileSync(path(p), "utf8")) as T;
const writeJson = (p: string, v: unknown): void => writeFileSync(path(p), JSON.stringify(v, null, 2) + "\n");

function configHash(): string {
  const h = createHash("sha256");
  const files = ["config/platform.json", ...readdirSync(path("config/lab")).map((f) => `config/lab/${f}`), ...readdirSync(path("config/seller")).map((f) => `config/seller/${f}`)];
  for (const f of files.sort()) h.update(f).update(readFileSync(path(f)));
  return h.digest("hex").slice(0, 16);
}

function run(kind: "dev" | "heldout"): Results {
  const world = new World();
  const cfg = loadConfig();
  const designs = readJson<{ designs: DesignSpec[] }>("config/lab/designs.json").designs;
  const seeds = readJson<Record<"dev" | "heldout", number[]>>("config/lab/seeds.json")[kind];
  const m = runStudy(world, { ...cfg, sim: new SimModel(world) }, designs, seeds);
  return { run: kind, seeds, companiesPerSeed: world.cfg.companiesPerSeed as number, configHash: configHash(), designs: Object.fromEntries(m.map((x) => [x.design, x])) };
}
function loadResults(kind: "dev" | "heldout"): Results | null {
  const p = `reports/${kind}.json`;
  return existsSync(path(p)) ? readJson<Results>(p) : null;
}

function report(): void {
  const dev = loadResults("dev");
  if (!dev) throw new Error("reports/dev.json missing: run `npm run lab:dev` first");
  const held = loadResults("heldout");
  const gates = readJson<{ gates: Gate[] }>("config/lab/gates.json").gates;
  const dg = evaluateGates(dev, gates);
  const hg = held ? evaluateGates(held, gates) : null;
  writeFileSync(path("REPORT.md"), fullReport(dev, held, dg, hg));
  const readme = readFileSync(path("README.md"), "utf8");
  const start = "<!-- results:start -->";
  const end = "<!-- results:end -->";
  const i = readme.indexOf(start);
  const j = readme.indexOf(end);
  if (i < 0 || j < i) throw new Error("README.md has no results markers");
  writeFileSync(path("README.md"), readme.slice(0, i + start.length) + "\n" + dashboard(dev, held, dg, hg) + "\n" + readme.slice(j));
  mkdirSync(path("web/public/data"), { recursive: true });
  writeJson("web/public/data/results.json", { dev, heldout: held, gates: { dev: dg, heldout: hg }, headline: headline(dev) });
  console.log("wrote REPORT.md, README.md dashboard, web/public/data/results.json");
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  mkdirSync(path("reports"), { recursive: true });
  if (cmd === "dev") {
    const r = run("dev");
    if (args.includes("--check")) {
      const committed = loadResults("dev");
      if (!committed || !isDeepStrictEqual(committed, r)) {
        console.error("reports/dev.json is stale: run `npm run lab:dev && npm run report` and commit the result");
        process.exit(1);
      }
      console.log("reports/dev.json reproduces exactly");
      return;
    }
    writeJson("reports/dev.json", r);
    console.log(`dev: seeds ${r.seeds.join(", ")}, config ${r.configHash}`);
  } else if (cmd === "heldout") {
    if (existsSync(path("reports/heldout.lock"))) {
      console.error("held-out seeds already ran (reports/heldout.lock). They run once; change the dev work instead.");
      process.exit(1);
    }
    const r = run("heldout");
    writeJson("reports/heldout.json", r);
    writeJson("reports/heldout.lock", { ranAt: new Date().toISOString(), configHash: r.configHash, seeds: r.seeds });
    console.log(`held-out: seeds ${r.seeds.join(", ")}, config ${r.configHash}`);
  } else if (cmd === "gate") {
    const gates = readJson<{ gates: Gate[] }>("config/lab/gates.json").gates;
    let failed = false;
    for (const kind of ["dev", "heldout"] as const) {
      const r = loadResults(kind);
      if (!r) { console.log(`${kind}: not run`); continue; }
      for (const g of evaluateGates(r, gates)) {
        console.log(`${kind} ${g.pass ? "pass" : "FAIL"} ${g.id}: ${g.left} ${g.op} ${g.right}`);
        if (!g.pass) failed = true;
      }
    }
    if (failed) process.exit(1);
  } else if (cmd === "report") {
    report();
  } else if (cmd === "demo") {
    mkdirSync(path("web/public/data"), { recursive: true });
    const demo = await buildDemo();
    mkdirSync(path("data"), { recursive: true });
    writeJson("web/public/data/demo.json", demo.view);
    writeJson("data/demo-market.json", demo.market);
    console.log("wrote web/public/data/demo.json and data/demo-market.json");
  } else {
    console.error("usage: lab dev [--check] | heldout | gate | report | demo");
    process.exit(2);
  }
}

await main();
