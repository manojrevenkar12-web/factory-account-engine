import { useState } from "react";
import type { Demo } from "../../shared/types.ts";
import { EmptyState } from "../../shared/ui/States.tsx";
import "./sync.css";

export function SyncView({ demo }: { demo: Demo }) {
  const s = demo.sync;
  const [open, setOpen] = useState(0);
  const total = s.attachKeys + s.companyUpserts + s.contactUpserts + s.parentChild;
  if (total === 0) return <EmptyState title="Nothing to sync">HubSpot already matches the account database. The next weekly run will send only what changed.</EmptyState>;
  const req = s.firstRequests[open];
  return (
    <section>
      <div className="head">
        <h1>HubSpot sync plan</h1>
        <p>HubSpot cannot upsert companies by domain, so every account carries a unique key. Existing records get the key first, matched by domain, name or alias, so the {demo.market.hubspotRecords} records already in the CRM are not duplicated. Plants become child companies of their group.</p>
      </div>
      <dl className="plan">
        <Count n={s.attachKeys} label="existing records get a key" />
        <Count n={s.companyUpserts} label="companies and plants upserted" />
        <Count n={s.parentChild} label="plant-to-group links" />
        <Count n={s.contactUpserts} label="contacts upserted" />
      </dl>
      <h2 className="sub">First requests, in batches of 100</h2>
      {s.firstRequests.length === 0 ? <p className="muted">No requests planned.</p> : (
        <div className="req">
          <div className="req-list" role="tablist" aria-label="Requests">
            {s.firstRequests.map((r, k) => (
              <button type="button" role="tab" key={k} aria-selected={k === open} className="req-tab" onClick={() => setOpen(k)}>
                <b>{r.method}</b> {r.path}
              </button>
            ))}
          </div>
          {req && <pre className="req-body" role="tabpanel">{JSON.stringify(req.body, null, 2).slice(0, 2400)}</pre>}
        </div>
      )}
    </section>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return <div><dt>{label}</dt><dd>{n}</dd></div>;
}
