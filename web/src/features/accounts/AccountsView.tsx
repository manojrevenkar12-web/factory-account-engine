import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { motionTokens } from "../../shared/theme/tokens.ts";
import type { AccountView, ContactView, Demo } from "../../shared/types.ts";
import { EmptyState } from "../../shared/ui/States.tsx";
import { Ladder } from "./Ladder.tsx";
import "./accounts.css";

const ROLE: Record<string, string> = {
  plant_manager: "Plant manager", head_industrial_engineering: "Head of industrial engineering", lean_manager: "Lean manager", production_manager: "Production manager", vp_operations: "VP operations",
};

export function AccountsView({ demo }: { demo: Demo }) {
  const [i, setI] = useState(0);
  if (demo.accounts.length === 0) return <EmptyState title="No plant reached tier A or B">Add signal sources in the intake workflow, or lower the tier thresholds in config/seller/playbook.json.</EmptyState>;
  const a = demo.accounts[i] ?? demo.accounts[0];
  if (!a) return null;
  return (
    <section>
      <div className="head">
        <h1>Plants to work this week</h1>
        <p>Ranked by code from fit and recent, verified signals. Each plant shows who to contact, which channels the law allows in its country, what was bought to reach them, and the first message after the claim check.</p>
      </div>
      <div className="acc-layout">
        <ol className="acc-list" aria-label="Plants">
          {demo.accounts.map((x, k) => (
            <li key={x.plantKey}>
              <button type="button" className="acc-row" aria-pressed={k === i} onClick={() => setI(k)}>
                <span className={`tier tier-${x.tier}`}>{x.tier}</span>
                <span className="acc-name"><b>{x.company}</b><span>{x.city}, {x.country}</span></span>
                <span className="acc-score">{x.score.toFixed(2)}</span>
              </button>
            </li>
          ))}
        </ol>
        <AnimatePresence mode="wait">
          <motion.article key={a.plantKey} className="acc-detail" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: motionTokens.quick, ease: motionTokens.ease }}>
            <Detail a={a} />
          </motion.article>
        </AnimatePresence>
      </div>
    </section>
  );
}

function Detail({ a }: { a: AccountView }) {
  return (
    <>
      <header className="det-head">
        <span className={`tier tier-${a.tier}`}>{a.tier}</span>
        <div>
          <h2>{a.company}, {a.city} plant</h2>
          <p>{a.country} · {a.industry.replace(/_/g, " ")}</p>
        </div>
      </header>
      <div className="meters">
        <Meter label="Fit" value={a.fit} />
        <Meter label="Timing" value={a.timing} />
      </div>
      <details className="reasons"><summary>Why this score</summary><ul>{a.reasons.map((r) => <li key={r}>{r}</li>)}</ul></details>
      {a.signal ? (
        <blockquote className="signal">
          <p>“{a.signal.quote}”</p>
          <footer>{a.signal.type.replace(/_/g, " ").replace(/^ie /, "industrial engineer ")}, {a.signal.date}{a.signal.plantKey ? "" : ", company level"}</footer>
        </blockquote>
      ) : <p className="muted">No verified signal; ranked on fit alone.</p>}
      <h3 className="det-sub">People</h3>
      {a.contacts.length === 0 ? <p className="muted">No plant-level contacts in the account database yet.</p> : a.contacts.map((c) => <Person key={c.name + c.role} c={c} country={a.country} />)}
    </>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="meter">
      <span>{label}</span>
      <span className="meter-track"><motion.span className="meter-fill" initial={{ scaleX: 0 }} animate={{ scaleX: value }} transition={{ duration: motionTokens.base * 2, ease: motionTokens.ease }} /></span>
      <b>{value.toFixed(2)}</b>
    </div>
  );
}

function Person({ c, country }: { c: ContactView; country: string }) {
  return (
    <div className="person">
      <div className="person-head">
        <b>{c.name}</b><span>{ROLE[c.role] ?? c.role}</span>
      </div>
      <div className="channels">
        {c.sequence.map((s, k) => <span key={s} className="chip chip-go">{k + 1}. {s}</span>)}
        {c.blocked.map((b) => <span key={b.channel} className="chip chip-stop" title={b.reason}>no {b.channel}</span>)}
      </div>
      {c.blocked.length > 0 && <p className="basis">{country}: {c.basis}</p>}
      <Ladder calls={c.enrichment.calls} skipped={c.enrichment.skipped} spent={c.enrichment.spentEur} />
      {c.message ? (
        <div className="message">
          {c.message.sentences.map((s, k) => (
            <p key={k} className={s.kept ? "" : "dropped"} title={s.reason}>{s.text}</p>
          ))}
          {c.message.body.split("\n\n")[1] && <pre className="footer-text">{c.message.body.split("\n\n")[1]}</pre>}
        </div>
      ) : <p className="muted">No message: no allowed channel or no verified signal.</p>}
    </div>
  );
}
