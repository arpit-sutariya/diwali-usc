import fs from "node:fs";
import forge from "node-forge";
import { PKPass, PassType } from "passkit-generator";
import { party, DEFAULT_POLICY } from "./core.js";

// Apple Wallet passes. Off until these are set in Vercel (see walletReady in core.js):
//   APPLE_PASS_TYPE_ID  e.g. pass.com.yourname.diwali
//   APPLE_TEAM_ID       the 10-character Team ID from developer.apple.com
//   APPLE_PASS_P12      the Pass Type ID certificate exported from Keychain as .p12, base64-encoded
//   APPLE_PASS_P12_PASSWORD  the password chosen when exporting the .p12 (if any)
//   APPLE_WWDR_CERT     Apple's WWDR G4 certificate (.cer or .pem), base64-encoded
const IMAGES = ["icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png", "logo@3x.png"];
const read = (f) => fs.readFileSync(new URL(`../img/pass/${f}`, import.meta.url));

let certs;
function certificates() {
  if (certs) return certs;
  const der = forge.util.decode64(process.env.APPLE_PASS_P12.replace(/\s+/g, ""));
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), process.env.APPLE_PASS_P12_PASSWORD || "");
  const bag = (type) => (p12.getBags({ bagType: type })[type] || [])[0];
  const cert = bag(forge.pki.oids.certBag), key = bag(forge.pki.oids.pkcs8ShroudedKeyBag) || bag(forge.pki.oids.keyBag);
  if (!cert || !key) throw new Error("APPLE_PASS_P12 needs both the certificate and its private key.");
  // The WWDR certificate may be pasted as PEM or as base64 of the .cer file
  const raw = Buffer.from(process.env.APPLE_WWDR_CERT.replace(/\s+/g, ""), "base64").toString("latin1");
  const wwdr = raw.includes("-----BEGIN") ? raw : forge.pki.certificateToPem(forge.pki.certificateFromAsn1(forge.asn1.fromDer(raw)));
  certs = { wwdr, signerCert: forge.pki.certificateToPem(cert.cert), signerKey: forge.pki.privateKeyToPem(key.key) };
  return certs;
}

// Bus departure on Saturday, Nov 7 (PST, UTC-8), from a setting like "4:00 PM"
function departure(s) {
  const m = String(s.depart || "").match(/(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m/i);
  let h = 16, min = 0;
  if (m) { h = (+m[1] % 12) + (/p/i.test(m[3]) ? 12 : 0); min = +(m[2] || 0); }
  return new Date(Date.UTC(2026, 10, 7, h + 8, min));
}

export function buildPass(r, s, link) {
  const n = party(r);
  const pass = new PKPass(Object.fromEntries(IMAGES.map((f) => [f, read(f)])), certificates(), {
    formatVersion: 1,
    passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID,
    teamIdentifier: process.env.APPLE_TEAM_ID,
    organizationName: "Diwali bus from USC",
    description: "USC bus to Diwali at BAPS Chino Hills",
    serialNumber: r.ref,
    logoText: "Diwali at the Mandir",
    backgroundColor: "rgb(255,255,255)",
    foregroundColor: "rgb(31,27,23)",
    labelColor: "rgb(169,86,8)"
  });
  const t = new PassType("eventTicket");
  t.headerFields.push({ key: "date", label: "SAT, NOV 7", value: s.depart || "4:00 PM" });
  t.primaryFields.push({ key: "event", label: "USC BUS TO", value: "Diwali at BAPS" });
  t.secondaryFields.push(
    { key: "name", label: "NAME", value: r.name + (n > 1 ? ` +${n - 1}` : "") },
    { key: "admit", label: "ADMIT", value: String(n), textAlignment: "PKTextAlignmentRight" }
  );
  t.auxiliaryFields.push(
    { key: "pickup", label: "PICKUP", value: s.pickup || "To be announced" },
    { key: "ref", label: "REF", value: r.ref, textAlignment: "PKTextAlignmentRight" }
  );
  t.backFields.push(
    ...(n > 1 ? [{ key: "group", label: "Group", value: [r.name, ...(r.guests || [])].join(", ") }] : []),
    { key: "board", label: "Boarding", value: `Show this QR code when you board${n > 1 ? "; your group boards together" : ""}. Please be at the pickup spot 10 minutes early.` },
    { key: "mandir", label: "Mandir", value: "BAPS Shri Swaminarayan Mandir, 15100 Fairfield Ranch Road, Chino Hills, CA 91709" },
    { key: "refund", label: "Deposit", value: `Fully refundable. ${s.policy || DEFAULT_POLICY}` },
    { key: "dress", label: "Dress", value: "Please dress modestly (shoulders and knees covered)." },
    ...(s.contact ? [{ key: "contact", label: "Questions", value: [s.contact, s.contactPhone].filter(Boolean).join(" · ") }] : []),
    { key: "link", label: "Your registration", value: link }
  );
  pass.types.push(t);
  pass.setBarcodes({ message: `DIW26:${r.ref}:${r.ticket_code}`, format: "PKBarcodeFormatQR", messageEncoding: "iso-8859-1", altText: r.ref });
  pass.setRelevantDate(departure(s));
  pass.setExpirationDate(new Date(Date.UTC(2026, 10, 9, 8))); // greys out after Sunday, Nov 8
  return pass.getAsBuffer();
}
