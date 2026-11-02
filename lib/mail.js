import nodemailer from "nodemailer";
import QRCode from "qrcode";
import { party, DEFAULT_POLICY, walletReady } from "./core.js";

export const mailReady = () =>
  !!globalThis.__testMail || !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

let transporter;
function transport() {
  if (globalThis.__testMail) return globalThis.__testMail;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: String(process.env.GMAIL_APP_PASSWORD).replace(/\s+/g, "") }
    });
  }
  return transporter;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const due = (r, s) => money((Number(s.deposit) || 0) * party(r));
const group = (r) => [r.name, ...(r.guests || [])].join(", ");
const refundTo = (r) => {
  const f = r.refund || {};
  const names = { venmo: "Venmo", zelle: "Zelle", paypal: "PayPal" };
  return !f.method || f.method === "same" ? "The same account you pay from" : `${names[f.method] || f.method} ${f.handle || ""}`.trim();
};

async function send(s, msg) {
  if (!mailReady()) return { sent: false, reason: "Email isn't set up yet (GMAIL_USER and GMAIL_APP_PASSWORD)." };
  const fromName = (s.contact ? `${s.contact} · ` : "") + "Diwali bus from USC";
  await transport().sendMail({ from: `"${fromName.replace(/"/g, "")}" <${process.env.GMAIL_USER || "test@example.com"}>`, ...msg });
  return { sent: true };
}

function layout(eyebrow, title, inner) {
  return `<!doctype html><html><body style="margin:0;background:#f6f2ec;padding:24px 12px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #ebe4dc">
    <div style="height:6px;background:#f7941d"></div>
    <div style="padding:28px 28px 8px;font-family:'Times New Roman',Times,serif;color:#1f1b17;font-size:17px;line-height:1.55">
      <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#a95608;margin:0 0 6px">${esc(eyebrow)}</p>
      <h1 style="font-weight:400;font-size:28px;line-height:1.2;margin:0 0 16px">${esc(title)}</h1>
      ${inner}
    </div>
    <div style="padding:16px 28px 24px;font-family:'Times New Roman',Times,serif;color:#8c8379;font-size:13px;border-top:1px solid #ebe4dc">
      BAPS Shri Swaminarayan Mandir · 15100 Fairfield Ranch Road, Chino Hills, CA 91709<br>
      Bus trip organized by USC students. This email isn't sent by BAPS.
    </div>
  </div></body></html>`;
}
const row = (k, v, mono) => `<tr><td style="color:#8c8379;padding:5px 18px 5px 0;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:5px 0;${mono ? "font-family:Menlo,monospace" : ""}">${esc(v)}</td></tr>`;
const button = (href, label) => `<p style="margin:22px 0"><a href="${esc(href)}" style="display:inline-block;background:#1f1b17;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-family:'Times New Roman',Times,serif;font-size:16px">${esc(label)}</a></p>`;
const tripRows = (s) =>
  row("Date", "Saturday, November 7, 2026") +
  row("Bus leaves USC", s.depart || "Time to be announced") +
  row("Pickup", s.pickup || "To be announced") +
  row("Mandir", "15100 Fairfield Ranch Road, Chino Hills, CA 91709");
const signoff = (s) => `<p>See you there!${s.contact ? "<br>" + esc(s.contact) : ""}${s.contactPhone ? "<br>" + esc(s.contactPhone) : ""}</p>`;

export async function sendPending(r, s, link) {
  const pay = [s.venmo && `Venmo: ${s.venmo}`, s.zelle && `Zelle: ${s.zelle}`].filter(Boolean);
  const html = r.waitlist
    ? layout("You're on the waitlist", "Diwali at BAPS Chino Hills", `
      <p>Hi ${esc(r.name)}, thanks for signing up${party(r) > 1 ? ` for ${party(r)} people` : ""}. The bus doesn't have enough seats right now, so you're on the waitlist.</p>
      <p><b style="font-weight:400">Please don't send a deposit yet.</b> If seats open up, the link below will show payment instructions.</p>
      <table style="border-collapse:collapse;font-size:16px;margin:8px 0">${row("Reference", r.ref, true)}${party(r) > 1 ? row("Group", group(r)) : ""}</table>
      ${button(link, "View your registration")}`)
    : layout("You're registered", "Diwali at BAPS Chino Hills", `
      <p>Hi ${esc(r.name)}, you're signed up for the USC bus${party(r) > 1 ? ` with ${party(r) - 1} guest${party(r) > 2 ? "s" : ""}` : ""}. One more step: send your refundable deposit.</p>
      <table style="border-collapse:collapse;font-size:16px;margin:8px 0 4px">
        ${row("Deposit", `${due(r, s)}${party(r) > 1 ? ` (${money(Number(s.deposit) || 0)} × ${party(r)} people)` : ""}`)}
        ${row("Reference", r.ref, true)}
        ${pay.map((p) => row("Send to", p)).join("") || row("Send to", "Payment details coming soon")}
        ${party(r) > 1 ? row("Group", group(r)) : ""}
        ${row("Refund to", refundTo(r))}
      </table>
      <p>Put <b style="font-family:Menlo,monospace;font-weight:400">${esc(r.ref)}</b> in the payment note. Your QR ticket arrives by email once the organizer confirms your payment.</p>
      <p style="color:#615950">Your deposit is fully refundable. ${esc(s.policy || DEFAULT_POLICY)}</p>
      ${button(link, "View your registration")}
      ${signoff(s)}`);
  const text = `Hi ${r.name},\n\nYou're registered for the USC bus to Diwali at BAPS Chino Hills (Saturday, Nov 7, 2026).\nReference: ${r.ref}\nDeposit: ${due(r, s)}\n${pay.join("\n")}\nPut ${r.ref} in the payment note.\n\nView your registration: ${link}`;
  return send(s, { to: r.email, subject: r.waitlist ? `You're on the Diwali bus waitlist · ${r.ref}` : `Send your deposit to hold your seat · ${r.ref}`, html, text });
}

export async function sendTicket(r, s, link, passLink) {
  const n = party(r);
  const png = await QRCode.toBuffer(`DIW26:${r.ref}:${r.ticket_code}`, { width: 520, margin: 2, color: { dark: "#1f1b17", light: "#ffffff" } });
  const html = layout("You're confirmed", "Your Diwali bus ticket", `
    <p>Hi ${esc(r.name)}, your ${due(r, s)} deposit is confirmed and ${n > 1 ? `${n} seats are` : "your seat is"} reserved on the USC bus.</p>
    <div style="text-align:center;margin:18px 0 6px"><img src="cid:qr" width="260" height="260" alt="QR ticket ${esc(r.ref)}" style="border:1px solid #ebe4dc;border-radius:12px"></div>
    <p style="text-align:center;margin:0 0 4px;font-size:22px">${esc(r.name)}${n > 1 ? ` +${n - 1}` : ""}</p>
    <p style="text-align:center;margin:0 0 18px;font-family:Menlo,monospace;color:#a95608">${esc(r.ref)}</p>
    <table style="border-collapse:collapse;font-size:16px;margin:8px 0">
      ${row("Admit", n === 1 ? "1 person" : `${n} people`)}${n > 1 ? row("Group", group(r)) : ""}${tripRows(s)}
    </table>
    <p>Show this QR code when you board${n > 1 ? "; your group boards together" : ""}.</p>
    ${button(link, "Open your ticket")}
    ${walletReady() && passLink ? `<p style="margin:-10px 0 22px"><a href="${esc(passLink)}" style="color:#1f1b17">Add to Apple Wallet</a></p>` : ""}
    <p style="color:#615950">Your deposit is fully refundable. ${esc(s.policy || DEFAULT_POLICY)}<br>Refund to: ${esc(refundTo(r))}</p>
    <p style="color:#615950">Please dress modestly (shoulders and knees covered) and be at the pickup spot 10 minutes early.</p>
    ${signoff(s)}`);
  const text = `Hi ${r.name},\n\nYou're confirmed for the USC bus to Diwali at BAPS Chino Hills.\nReference: ${r.ref}\nAdmit: ${n}\nDate: Saturday, Nov 7, 2026\nBus leaves USC: ${s.depart || "TBA"}\nPickup: ${s.pickup || "TBA"}\n\nOpen your ticket: ${link}`;
  return send(s, {
    to: r.email, subject: `Your Diwali bus ticket · ${r.ref}`, html, text,
    attachments: [{ filename: `diwali-ticket-${r.ref}.png`, content: png, cid: "qr" }]
  });
}

export async function sendLink(r, s, link) {
  const html = layout("Your registration", "Here's your link", `
    <p>Hi ${esc(r.name)}, here's the private link to your registration for the USC bus to Diwali at BAPS Chino Hills (reference <span style="font-family:Menlo,monospace">${esc(r.ref)}</span>).</p>
    ${button(link, "Open your registration")}
    <p style="color:#615950">Keep this link to yourself; it shows your ticket.</p>`);
  return send(s, { to: r.email, subject: `Your Diwali bus link · ${r.ref}`, html, text: `Your registration link: ${link}` });
}
