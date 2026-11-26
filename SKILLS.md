# Repeatable tasks

## Add a signal type
1. Add it to `config/seller/playbook.json` under `signals`: weight, half-life in days, label and evidence terms in
   German and English.
2. Add patterns to `RegexReader` in `src/core/model/readers.ts` and the type to the Claude prompt's list.
3. Add the type to the world's text generator and rates in `config/lab/world.json`, so the lab can measure it.
4. `npm test && npm run lab:dev && npm run report`. Commit the regenerated files.

## Add a country
1. Add its channel rules and legal basis text to `config/seller/channels.json`. Until you do, the strictest rule applies.
2. Add it to `icp.servedCountries` in the playbook.
3. Add the same rule to the world's law table in `config/lab/world.json`, from the law itself, not from the playbook.

## Change a weight, threshold, budget or price
Edit `config/`, then `npm run lab:dev && npm run report`. Gates must still pass on dev; held-out is not re-run.

## Add an enrichment provider
Add it to `config/platform.json` with price and observed hit rates per field, write an HTTP adapter implementing
`ProviderClient` (`src/core/enrich/waterfall.ts`), and add it to the world's providers so the lab prices it.

## Connect a real HubSpot
1. Create the unique company property `fae_account_key` (single-line text, unique values) and the same on contacts.
2. Import `n8n/hubspot-sync.json`, set the HubSpot credential and the engine's URL and API key.
3. Run `/v1/sync/plan` with a small `accountsToWork` first and check the key attachments before any upsert.

## Change how the world behaves
Edit `config/lab/world.json` or `src/lab/world/`. Record why in the commit. Never change the world to make a design
look better; change it when it was unrealistic, and say what evidence made you change it.

## Refresh the screenshots
`npm run demo`, `cd web && npm run build && npm run preview`, then `python scripts/screenshots.py`.
