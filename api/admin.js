import crypto from "node:crypto";
import { q, ready } from "../lib/db.js";
import { getSettings, saveSettings, seatsTaken, toClient, linkFor, readBody, fail, rand, DEFAULT_POLICY } from "../lib/core.js";
import { sendTicket, mailReady } from "../lib/mail.js";

const hash = (s) => crypto.createHash("sha256").update(String(s)).digest();
function authorized(req) {
  const want = process.env.ADMIN_PASSWORD;
  const got = req.headers["x-admin-key"];
  if (!want || !got) return false;
  return crypto.timingSafeEqual(hash(got), hash(want));
}

const SET = {
  waitlist: "waitlist = true",
  offer: "waitlist = false",
  checkin: "checked_in_at = now()",
  undo: "checked_in_at = null",
  refund: "refunded_at = now()",
  unrefund: "refunded_at = null",
  cancel: "cancelled = true",
  restore: "cancelled = false",
  revoke: "ticket_code = null, issued_at = null, emailed_at = null, checked_in_at = null"
};

async function emailTicket(req, row) {
  const s = await getSettings();
  try {
    const out = await sendTicket(row, { ...s, policy: s.policy || DEFAULT_POLICY }, linkFor(req, row));
    if (!out.sent) return { row, emailed: false, emailError: out.reason };
    row = (await q("update regs set emailed_at = now() where id = $1 returning *", [row.id]))[0];
    return { row, emailed: true };
  } catch (e) {
    console.error("ticket email failed", e);
    return { row, emailed: false, emailError: "The email didn't go out. Check the Gmail app password, then press Email ticket." };
  }
}

// Organizer actions. Every request needs the organizer password.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: "Set ADMIN_PASSWORD in Vercel to turn on the organizer page." });
  if (!authorized(req)) return res.status(401).json({ error: "That password isn't right." });
  try {
    await ready();
    const b = readBody(req);
    const a = b.action;

    if (a === "list") {
      const rows = await q("select * from regs order by created_at asc");
      return res.status(200).json({
        regs: rows.map((r) => toClient(r, true)),
        settings: await getSettings(), confirmed: await seatsTaken(),
        emailReady: mailReady(), defaultPolicy: DEFAULT_POLICY
      });
    }
    if (a === "settings") return res.status(200).json({ settings: await saveSettings(b.settings || {}) });

    const id = String(b.id || "");
    let row = (await q("select * from regs where id = $1", [id]))[0];
    if (!row) return res.status(404).json({ error: "That registration no longer exists." });

    if (a === "confirm") {
      if (row.cancelled) return res.status(400).json({ error: "This registration was cancelled. Restore it first." });
      for (let i = 0; i < 5 && !row.ticket_code; i++) {
        try {
          row = (await q("update regs set ticket_code = $2, issued_at = now(), waitlist = false, updated_at = now() where id = $1 returning *", [id, rand(10)]))[0];
        } catch (err) { if (!/duplicate|unique/i.test(String(err?.message))) throw err; }
      }
      let out = { row, emailed: false };
      if (b.email !== false) out = await emailTicket(req, row);
      return res.status(200).json({ reg: toClient(out.row, true), emailed: out.emailed, emailError: out.emailError });
    }
    if (a === "delete") {
      if (!row.cancelled) return res.status(400).json({ error: "Cancel this registration first, then delete it." });
      await q("delete from regs where id = $1 and cancelled", [id]);
      return res.status(200).json({ deleted: true });
    }
    if (a === "email") {
      if (!row.ticket_code) return res.status(400).json({ error: "Confirm the payment first." });
      const out = await emailTicket(req, row);
      return res.status(200).json({ reg: toClient(out.row, true), emailed: out.emailed, emailError: out.emailError });
    }
    if (SET[a]) {
      if (a === "checkin" && !row.ticket_code) return res.status(400).json({ error: "Confirm the payment first." });
      row = (await q(`update regs set ${SET[a]}, updated_at = now() where id = $1 returning *`, [id]))[0];
      return res.status(200).json({ reg: toClient(row, true) });
    }
    res.status(400).json({ error: "Unknown action." });
  } catch (err) { fail(res, err); }
}
