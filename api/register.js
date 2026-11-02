import { q, ready } from "../lib/db.js";
import { validate, getSettings, seatsTaken, secret, rand, toClient, linkFor, readBody, fail, party, DEFAULT_POLICY, SIGNUP_DEADLINE } from "../lib/core.js";
import { sendPending, sendLink } from "../lib/mail.js";

// A new sign-up. Returns the private token that unlocks the registrant's page.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  try {
    await ready();
    const { errors, data } = validate(readBody(req));
    if (Object.keys(errors).length) return res.status(400).json({ error: "Please fix the highlighted fields.", fields: errors });

    const s = await getSettings();
    const dup = await q("select * from regs where lower(email) = $1 and not cancelled order by created_at desc limit 1", [data.email]);
    if (dup.length) {
      try { await sendLink(dup[0], s, linkFor(req, dup[0])); } catch (e) { console.error("link email failed", e); }
      return res.status(409).json({ error: "This email already has a registration. We've emailed you the link to it.", code: "already" });
    }

    if (Date.now() >= SIGNUP_DEADLINE) return res.status(403).json({ error: "Sign-ups closed on Tuesday, November 3.", code: "closed" });

    const left = Math.max(0, s.capacity - (await seatsTaken()));
    const waitlist = 1 + data.guests.length > left;
    let row;
    for (let i = 0; i < 6 && !row; i++) {
      try {
        row = (await q(
          `insert into regs (id, token, ref, name, email, phone, guests, refund, waitlist)
           values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9) returning *`,
          [secret(), secret(), "DIW-" + rand(4), data.name, data.email, data.phone, JSON.stringify(data.guests), JSON.stringify(data.refund), waitlist]
        ))[0];
      } catch (err) {
        if (!/duplicate|unique/i.test(String(err?.message))) throw err;
      }
    }
    if (!row) throw new Error("Couldn't create a unique reference code");

    let emailed = false;
    try { emailed = (await sendPending(row, { ...s, policy: s.policy || DEFAULT_POLICY }, linkFor(req, row))).sent; }
    catch (e) { console.error("pending email failed", e); }

    res.status(200).json({ token: row.token, reg: toClient(row), emailed, seats: party(row) });
  } catch (err) { fail(res, err); }
}
