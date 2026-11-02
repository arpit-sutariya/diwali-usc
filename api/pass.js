import { q, ready } from "../lib/db.js";
import { getSettings, linkFor, fail, walletReady } from "../lib/core.js";
import { buildPass } from "../lib/wallet.js";

// The Apple Wallet pass for a confirmed registration, unlocked by the private link token.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!walletReady()) return res.status(404).json({ error: "Apple Wallet passes aren't set up yet." });
  try {
    await ready();
    const t = req.query?.t;
    const r = typeof t === "string" && t.length <= 64 ? (await q("select * from regs where token = $1", [t]))[0] : null;
    if (!r) return res.status(404).json({ error: "We couldn't find that registration. Use the link from your email." });
    if (r.cancelled || !r.ticket_code) return res.status(400).json({ error: "This registration doesn't have a confirmed ticket." });
    const buf = buildPass(r, await getSettings(), linkFor(req, r));
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", `attachment; filename="diwali-ticket-${r.ref}.pkpass"`);
    res.status(200).send(buf);
  } catch (err) { fail(res, err); }
}
