// The account database (SQLite through node:sqlite). Every write is an upsert on a natural key, so a
// re-run of the same intake changes nothing.

import { DatabaseSync } from "node:sqlite";
import type { AcceptedSignal, Company, Contact, Plant } from "../types.ts";

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS companies (key TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT NOT NULL, hq_country TEXT NOT NULL, industry TEXT NOT NULL, employees INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS plants (key TEXT PRIMARY KEY, company_key TEXT NOT NULL REFERENCES companies(key), city TEXT NOT NULL, country TEXT NOT NULL, plant_type TEXT, lines INTEGER)`,
  `CREATE TABLE IF NOT EXISTS signals (doc_id TEXT NOT NULL, company_key TEXT NOT NULL, plant_key TEXT, type TEXT NOT NULL, date TEXT NOT NULL, quote TEXT NOT NULL, PRIMARY KEY (doc_id, type))`,
  `CREATE TABLE IF NOT EXISTS contacts (key TEXT PRIMARY KEY, company_key TEXT NOT NULL, plant_key TEXT, role TEXT NOT NULL, name TEXT NOT NULL, email TEXT, phone TEXT, consent_express TEXT, consent_presumed TEXT)`,
  `CREATE TABLE IF NOT EXISTS suppression (address TEXT PRIMARY KEY, reason TEXT NOT NULL, at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS touches (contact_key TEXT NOT NULL, step INTEGER NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL, PRIMARY KEY (contact_key, step))`,
  `CREATE INDEX IF NOT EXISTS signals_company ON signals(company_key)`,
];

export class AccountStore {
  readonly db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON");
    for (const m of MIGRATIONS) this.db.exec(m);
  }

  upsertCompany(c: Company): void {
    this.db.prepare(`INSERT INTO companies VALUES (?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET name=excluded.name, domain=excluded.domain, hq_country=excluded.hq_country, industry=excluded.industry, employees=excluded.employees`)
      .run(c.key, c.name, c.domain, c.hqCountry, c.industry, c.employees);
  }

  upsertPlant(p: Plant): void {
    this.db.prepare(`INSERT INTO plants VALUES (?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET city=excluded.city, country=excluded.country, plant_type=COALESCE(excluded.plant_type, plants.plant_type), lines=COALESCE(excluded.lines, plants.lines)`)
      .run(p.key, p.companyKey, p.city, p.country, p.plantType, p.lines);
  }

  addSignal(s: AcceptedSignal): boolean {
    const r = this.db.prepare(`INSERT OR IGNORE INTO signals VALUES (?,?,?,?,?,?)`).run(s.docId, s.companyKey, s.plantKey, s.type, s.date, s.quote);
    return Number(r.changes) > 0;
  }

  upsertContact(c: Contact): void {
    this.db.prepare(`INSERT INTO contacts VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET email=COALESCE(excluded.email, contacts.email), phone=COALESCE(excluded.phone, contacts.phone), consent_express=COALESCE(excluded.consent_express, contacts.consent_express), consent_presumed=COALESCE(excluded.consent_presumed, contacts.consent_presumed)`)
      .run(c.key, c.companyKey, c.plantKey, c.role, c.name, c.email, c.phone, c.consent.express, c.consent.presumed);
  }

  suppress(address: string, reason: string, at: string): void {
    this.db.prepare(`INSERT OR IGNORE INTO suppression VALUES (?,?,?)`).run(address.toLowerCase(), reason, at);
  }

  isSuppressed(address: string | null): boolean {
    if (!address) return false;
    return this.db.prepare(`SELECT 1 FROM suppression WHERE address = ?`).get(address.toLowerCase()) !== undefined;
  }

  /** Records a sequence step once; a retry of the same step returns false and sends nothing. */
  recordTouch(contactKey: string, step: number, channel: string): boolean {
    const r = this.db.prepare(`INSERT OR IGNORE INTO touches VALUES (?,?,?, 'queued')`).run(contactKey, step, channel);
    return Number(r.changes) > 0;
  }

  companies(): Company[] {
    return (this.db.prepare(`SELECT * FROM companies ORDER BY key`).all() as Record<string, unknown>[]).map((r) => ({
      key: String(r.key), name: String(r.name), domain: String(r.domain), hqCountry: String(r.hq_country), industry: String(r.industry), employees: Number(r.employees),
    }));
  }

  plants(): Plant[] {
    return (this.db.prepare(`SELECT * FROM plants ORDER BY key`).all() as Record<string, unknown>[]).map((r) => ({
      key: String(r.key), companyKey: String(r.company_key), city: String(r.city), country: String(r.country),
      plantType: (r.plant_type as Plant["plantType"]) ?? null, lines: r.lines === null ? null : Number(r.lines),
    }));
  }

  signals(): AcceptedSignal[] {
    return (this.db.prepare(`SELECT * FROM signals ORDER BY date DESC, doc_id`).all() as Record<string, unknown>[]).map((r) => ({
      docId: String(r.doc_id), companyKey: String(r.company_key), plantKey: r.plant_key === null ? null : String(r.plant_key),
      type: r.type as AcceptedSignal["type"], date: String(r.date), quote: String(r.quote),
    }));
  }

  count(table: "companies" | "plants" | "signals" | "contacts" | "touches"): number {
    return Number((this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
  }
}
