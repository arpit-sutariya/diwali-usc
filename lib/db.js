import { neon } from "@neondatabase/serverless";

let sql;
let readyPromise;

// Runs one SQL statement and returns the rows.
export async function q(text, params = []) {
  if (globalThis.__testQuery) return globalThis.__testQuery(text, params);
  if (!sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Connect a Neon database to this Vercel project.");
    sql = neon(url);
  }
  return sql.query(text, params);
}

// Creates the tables the first time the site runs.
export function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await q(`create table if not exists regs (
        id text primary key,
        token text unique not null,
        ref text unique not null,
        name text not null,
        email text not null,
        phone text not null,
        guests jsonb not null default '[]'::jsonb,
        refund jsonb not null default '{"method":"same"}'::jsonb,
        waitlist boolean not null default false,
        cancelled boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        ticket_code text unique,
        issued_at timestamptz,
        emailed_at timestamptz,
        checked_in_at timestamptz,
        refunded_at timestamptz
      )`);
      await q(`create table if not exists settings (id int primary key, data jsonb not null)`);
    })().catch((err) => { readyPromise = null; throw err; });
  }
  return readyPromise;
}
