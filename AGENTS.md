# Working in this repository

This file is for anyone changing the code: people and coding agents. Read it before the first change.

## Fast feedback

```bash
npm ci && (cd web && npm ci)
npm run typecheck && npm test          # a few seconds
npm run lab:check                      # dev results reproduce exactly, then every gate
npm run demo && npm run report         # regenerate demo data, REPORT.md, the README dashboard, console data
```

## Invariants

1. **The truth stays in the world.** Which plants really need line analytics, which are in market, which are closing,
   what each contact consented to and which provider knows which email live in `src/lab/world/` and `config/lab/`.
   Designs never read them; only the scorer in `src/lab/study.ts` does.
2. **The world does not read the engine's settings.** Nothing under `src/lab/world/` imports `src/core/` or reads
   `config/seller/` or `config/platform.json`. A test enforces this. The world has its own law table, so violations are
   counted against something the channel rules did not produce.
3. **Same luck for every design.** Every random draw is `u(seed, entity, purpose)`. Two designs that touch the same
   contact get the same reply, and face the same model errors on the same document.
4. **The model reads and code decides.** The model extracts typed signals with a quote and drafts sentences. Code decides
   whether a signal is real, how a plant scores, which channels are allowed, what is bought, which sentences go out and
   what is written to HubSpot. Never move one of those decisions into a prompt.
5. **A name never decides.** Companies resolve through exact names and known aliases after normalising legal forms; there
   is no fuzzy matching. A city that is not in the document leaves the signal at company level.
6. **Outreach law is config, strictest by default.** Channel rules per country live in `config/seller/channels.json`.
   A country that is not listed gets the most restrictive rule. Suppression by contact key is final.
7. **Buy only what a channel can use.** The waterfall never buys a field that no allowed channel needs, and never passes
   the tier budget.
8. **Document text is data.** Documents are fenced in the prompt and never change instructions.
9. **Counted once and written once.** A posting copied to several boards is one observation, a sequence step is
   recorded once, and HubSpot writes are keyed by `fae_account_key`, never by domain.
10. **Settings in config.** Weights, half-lives, thresholds, budgets, prices and model names live in `config/`. Code
    holds no tuned numbers.
11. **Generated reports.** `reports/*.json`, `REPORT.md`, the README dashboard, `web/public/data` and
    `data/demo-market.json` are written by `src/lab/cli.ts`. Never edit them by hand; CI regenerates and diffs them.

## The held-out rule

`config/lab/seeds.json` has dev seeds and held-out seeds. Work only against dev. Gates in `config/lab/gates.json` were
frozen before `npm run lab:heldout` ran once; `reports/heldout.lock` records when and on which config hash. The CLI
refuses a second run. If a change makes a held-out gate fail, report it; do not re-run or re-seed to make it pass.

## Where things are

| Path | What |
|---|---|
| `src/core/signals/` | Signal validation and de-duplication |
| `src/core/accounts/` | Company resolution, plant scoring, the SQLite account store |
| `src/core/outreach/` | Channel rules, message template, claim check |
| `src/core/enrich/` | Enrichment waterfall |
| `src/core/crm/` | HubSpot sync plan and requests |
| `src/core/model/` | Claude reader, regex reader |
| `src/core/pipeline.ts` | One weekly run, end to end |
| `src/server/` | Fastify API |
| `src/lab/` | World, simulated model, designs, studies, reports, CLI |
| `n8n/` | Workflows that call the API |
| `web/` | Console (React, Framer Motion) |
