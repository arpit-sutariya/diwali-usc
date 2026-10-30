import { q, ready } from "../lib/db.js";
import { validate, getSettings, seatsTaken, toClient, linkFor, readBody, fail, party } from "../lib/core.js";
import { sendLink } from "../lib/mail.js";

async function byToken(t) {
  if (!t || typeof t !== "string" || t.length > 64) return null;
  return (await q("select * from regs where token = $1", [t]))[0] || null;
}

// A registrant's own page: read status, edit before confirmation, cancel, or recover a lost link.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    await ready();
    if (req.method === "GET") {
      const r = await byToken(req.query?.t);
      if (!r) return res.status(404).json({ error: "We couldn't find that registration. Use the link from your email." });
      return res.status(200).json({ reg: toClient(r) });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Use GET or POST." });

    const b = readBody(req);
    if (b.action === "lookup") {
      const email = String(b.email || "").trim().toLowerCase();
      const r = (await q("select * from regs where lower(email) = $1 and not cancelled order by created_at desc limit 1", [email]))[0];
      if (r) { try { await sendLink(r, await getSettings(), linkFor(req, r)); } catch (e) { console.error("link email failed", e); } }
      return res.status(200).json({ ok: true }); // same answer either way, so emails can't be probed
    }

    const r = await byToken(b.t);
    if (!r) return res.status(404).json({ error: "We couldn't find that registration. Use the link from your email." });

    if (b.action === "cancel") {
      if (r.checked_in_at) return res.status(400).json({ error: "You've already checked in, so this can't be cancelled." });
      const row = (await q("update regs set cancelled = true, updated_at = now() where id = $1 returning *", [r.id]))[0];
      return res.status(200).json({ reg: toClient(row) });
    }

    if (b.action === "update") {
      if (r.cancelled) return res.status(400).json({ error: "This registration was cancelled. Register again below." });
      if (r.ticket_code) return res.status(400).json({ error: "Your seat is already confirmed. Contact the organizer to change your group." });
      const { errors, data } = validate(b);
      if (Object.keys(errors).length) return res.status(400).json({ error: "Please fix the highlighted fields.", fields: errors });
      if (data.email !== r.email) {
        const dup = await q("select 1 from regs where lower(email) = $1 and not cancelled and id <> $2 limit 1", [data.email, r.id]);
        if (dup.length) return res.status(400).json({ error: "Another registration already uses that email.", fields: { email: "Another registration already uses that email." } });
      }
      const s = await getSettings();
      const left = Math.max(0, s.capacity - (await seatsTaken()));
      const grew = 1 + data.guests.length > party(r);
      const waitlist = r.waitlist || (grew && 1 + data.guests.length > left);
      const row = (await q(
        `update regs set name = $2, email = $3, phone = $4, guests = $5::jsonb, refund = $6::jsonb, waitlist = $7, updated_at = now()
         where id = $1 returning *`,
        [r.id, data.name, data.email, data.phone, JSON.stringify(data.guests), JSON.stringify(data.refund), waitlist]
      ))[0];
      return res.status(200).json({ reg: toClient(row) });
    }

    res.status(400).json({ error: "Unknown action." });
  } catch (err) { fail(res, err); }
}
