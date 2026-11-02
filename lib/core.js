import crypto from "node:crypto";
import { q, ready } from "./db.js";

export const DEF = {
  capacity: 80, deposit: 5, venmo: "", zelle: "arpitsutariya13@gmail.com (Arpit Nilesh Sutariya)", pickup: "3096 McClintock Ave, Los Angeles, CA 90089", depart: "4:00 PM", ret: "",
  contact: "", contactPhone: "", policy: ""
};
export const DEFAULT_POLICY = "You get it back when you check in on the bus, or if you cancel by Thursday, Nov 5.";
export const MAX_GUESTS = 3;
// New sign-ups close at the end of Tuesday, Nov 3 in Los Angeles (PST). Must match signupsClosed in index.html.
export const SIGNUP_DEADLINE = Date.UTC(2026, 10, 4, 8);

const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function rand(n) {
  const b = crypto.randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHA[b[i] % ALPHA.length];
  return s;
}
export const secret = () => crypto.randomBytes(18).toString("base64url");
export const party = (r) => 1 + (Array.isArray(r.guests) ? r.guests.length : 0);

export async function getSettings() {
  await ready();
  const rows = await q("select data from settings where id = 1");
  // A setting saved blank falls back to its default
  const saved = Object.entries(rows[0]?.data || {}).filter(([, v]) => v !== "");
  return { ...DEF, ...Object.fromEntries(saved) };
}

export async function saveSettings(patch = {}) {
  const cur = await getSettings();
  const next = { ...cur };
  const str = (v, n = 200) => String(v ?? "").trim().slice(0, n);
  if ("capacity" in patch) next.capacity = Math.min(500, Math.max(1, parseInt(patch.capacity, 10) || DEF.capacity));
  if ("deposit" in patch) next.deposit = Math.min(1000, Math.max(0, Number(patch.deposit) || 0));
  for (const k of ["venmo", "zelle", "pickup", "depart", "ret", "contact", "contactPhone", "policy"]) {
    if (k in patch) next[k] = str(patch[k], k === "policy" ? 300 : 120);
  }
  await q(
    "insert into settings (id, data) values (1, $1::jsonb) on conflict (id) do update set data = excluded.data",
    [JSON.stringify(next)]
  );
  return next;
}

export async function seatsTaken() {
  const rows = await q(
    "select coalesce(sum(1 + jsonb_array_length(guests)), 0)::int as n from regs where ticket_code is not null and not cancelled"
  );
  return Number(rows[0]?.n || 0);
}

export async function publicInfo() {
  const s = await getSettings();
  return { ...s, policy: s.policy || DEFAULT_POLICY, confirmed: await seatsTaken() };
}

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;
export function validate(b = {}) {
  const errors = {};
  const name = String(b.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (name.length < 2) errors.name = "Enter your full name.";
  const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
  if (!EMAIL_RE.test(email)) errors.email = "Enter a complete email address.";
  const phone = String(b.phone || "").trim().slice(0, 30);
  let d = phone.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  if (d.length !== 10) errors.phone = "Enter a 10-digit phone number.";
  const raw = Array.isArray(b.guests) ? b.guests : [];
  if (raw.length > MAX_GUESTS) errors.guests = `Groups can bring up to ${MAX_GUESTS} guests.`;
  const guests = raw.slice(0, MAX_GUESTS).map((g) => String(g || "").trim().replace(/\s+/g, " ").slice(0, 80));
  guests.forEach((g, i) => { if (g.length < 2) errors["g" + i] = "Enter this guest's full name."; });
  const method = ["same", "venmo", "zelle", "paypal"].includes(b.refund?.method) ? b.refund.method : "same";
  const handle = String(b.refund?.handle || "").trim().slice(0, 100);
  if (method !== "same" && handle.length < 3) errors.rhandle = "Add the account we should refund.";
  return {
    errors,
    data: { name, email, phone, guests, refund: method === "same" ? { method } : { method, handle } }
  };
}

const iso = (v) => (v ? new Date(v).toISOString() : null);
export function toClient(r, admin = false) {
  const o = {
    ref: r.ref, name: r.name, email: r.email, phone: r.phone,
    guests: r.guests || [], refund: r.refund || { method: "same" },
    waitlist: !!r.waitlist, cancelled: !!r.cancelled, createdAt: iso(r.created_at),
    ticket: r.ticket_code ? {
      code: r.ticket_code, issuedAt: iso(r.issued_at), emailedAt: iso(r.emailed_at),
      checkedInAt: iso(r.checked_in_at), refundedAt: iso(r.refunded_at)
    } : null
  };
  if (admin) o.id = r.id;
  return o;
}

export function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}
export const linkFor = (req, r) => `${siteUrl(req)}/?t=${encodeURIComponent(r.token)}#signup`;

export function readBody(req) {
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body || {};
}

export function fail(res, err) {
  console.error(err);
  const msg = /DATABASE_URL/.test(String(err?.message))
    ? "The database isn't connected yet. The organizer needs to finish setup."
    : "Something went wrong on our side. Please try again in a minute.";
  res.status(500).json({ error: msg });
}
