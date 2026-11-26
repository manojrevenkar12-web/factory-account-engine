import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { AccountsView } from "./features/accounts/AccountsView.tsx";
import { ResultsView } from "./features/results/ResultsView.tsx";
import { SignalsView } from "./features/signals/SignalsView.tsx";
import { SyncView } from "./features/sync/SyncView.tsx";
import { useJson } from "./shared/data/useJson.ts";
import { motionTokens } from "./shared/theme/tokens.ts";
import type { Demo } from "./shared/types.ts";
import { ErrorState, Skeleton } from "./shared/ui/States.tsx";
import "./app.css";

const SECTIONS = [
  { id: "accounts", label: "Plants to work" },
  { id: "signals", label: "Signals" },
  { id: "sync", label: "HubSpot sync" },
  { id: "results", label: "Results" },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

const fromHash = (): Section => (SECTIONS.find((s) => `#${s.id}` === window.location.hash)?.id ?? "accounts");

export function App() {
  const [section, setSection] = useState<Section>(fromHash);
  const demo = useJson<Demo>("/data/demo.json");
  useEffect(() => {
    const on = () => setSection(fromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="shell">
        <header className="top">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <div>
              <p className="brand-name">Factory account engine</p>
              <p className="brand-sub">Which plants to call this week, how, and what to say</p>
            </div>
          </div>
          {demo.status === "ready" && (
            <dl className="topline">
              <div><dt>Plants</dt><dd>{demo.data.market.plants}</dd></div>
              <div><dt>Tier A</dt><dd className="is-a">{demo.data.tiers.A}</dd></div>
              <div><dt>Signals kept</dt><dd>{demo.data.signals.accepted}</dd></div>
              <div><dt>Enrichment</dt><dd>€{demo.data.costs.enrichmentEur.toFixed(0)}</dd></div>
            </dl>
          )}
        </header>
        <nav className="tabs" aria-label="Section">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="tab" aria-current={s.id === section ? "page" : undefined}>
              {s.label}
              {s.id === section && <motion.span layoutId="tab-bar" className="tab-bar" transition={{ duration: motionTokens.base, ease: motionTokens.ease }} />}
            </a>
          ))}
        </nav>
        <main className="main">
          {section !== "results" && demo.status === "loading" && <Skeleton label="Loading the account engine" lines={8} />}
          {section !== "results" && demo.status === "error" && <ErrorState message={demo.message} onRetry={demo.retry} />}
          <AnimatePresence mode="wait">
            <motion.div key={`${section}-${demo.status}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: motionTokens.base, ease: motionTokens.ease }}>
              {section === "results" && <ResultsView />}
              {section !== "results" && demo.status === "ready" && (
                <>
                  {section === "accounts" && <AccountsView demo={demo.data} />}
                  {section === "signals" && <SignalsView demo={demo.data} />}
                  {section === "sync" && <SyncView demo={demo.data} />}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
        <footer className="foot">Simulated market of {demo.status === "ready" ? demo.data.market.companies : "…"} manufacturing companies. The seller, Linewise, is fictional.</footer>
      </div>
    </MotionConfig>
  );
}
