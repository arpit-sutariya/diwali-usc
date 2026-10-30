import { publicInfo, fail } from "../lib/core.js";

// Public trip details and the live confirmed-seat count.
export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ info: await publicInfo() });
  } catch (err) { fail(res, err); }
}
