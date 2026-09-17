#!/usr/bin/env node
/* CueFinder conversion-layer tests — the kill rule, enforced in code:
 * if a CTA can't point at something real, it fails here instead of shipping.
 * - every mailto CTA: well-formed, canonical contact, subject+body, clean encoding
 * - every https product link: resolves HTTP 200 (or must not be linked at all)
 * - exact labels preserved, honesty qualifiers present, no invented claims
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const APP = path.join(__dirname, "..", "app");
const CONTACT = "hp@cumulativeweb.com"; // verified canonical CWI contact (see index.html honesty footer)
const STORE = "https://cumulativewebinc.github.io/cwi-store/";

let passed = 0;
function ok(name, cond, extra) {
  if (!cond) { console.error("FAIL:", name, extra || ""); process.exitCode = 1; }
  else { passed++; console.log("ok:", name); }
}
const html = fs.readFileSync(path.join(APP, "index.html"), "utf8");
const appjs = fs.readFileSync(path.join(APP, "app.js"), "utf8");

// ---------- conversion regions ----------
function slice(from, to) {
  const a = html.indexOf(from);
  const b = html.indexOf(to, a);
  if (a === -1 || b === -1) { console.error("FAIL: region not found", from); process.exitCode = 1; return ""; }
  return html.slice(a, b);
}
const strip = slice('<aside class="sup-strip"', "</aside>");
const storeCard = slice('<div class="store-card"', '<p class="fine">');
ok("supervisor strip present", strip.length > 0);
ok("store card present", storeCard.length > 0);

// ---------- exact labels (what the CTA is, nothing more) ----------
["Request evidence report — $49", "License inquiry"].forEach(l =>
  ok("strip label exact: " + l, strip.includes(l)));
["The $0 Playlist Pitch Kit", "Playlist Evidence Report", "$19", "$49",
 "Request by email — $19", "Request by email — $49"].forEach(l =>
  ok("store label present: " + l, storeCard.includes(l)));
ok("track-detail hook label in app.js",
  appjs.includes("Get this track") && appjs.includes("evidence report ($49)"));
ok("store-pending note (kill-rule disclosure)",
  storeCard.includes("still being built") && storeCard.includes("mailto:" + CONTACT));

// ---------- mailto well-formedness ----------
function mailtos(src) {
  const out = [];
  const re = /<a\b[^>]*href=(["'])mailto:([^"']+)\1[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(src))) out.push({ raw: m[2].replace(/&amp;/g, "&"), label: m[3].replace(/<[^>]*>/g, "").trim() });
  return out;
}
function checkMailto(m) {
  const [addr, query] = m.raw.split("?");
  if (addr !== CONTACT) return "address " + addr + " is not the canonical contact";
  if (!query) return "no query params";
  const p = new URLSearchParams(query);
  if (!p.get("subject")) return "missing subject";
  if (!p.get("body")) return "missing body";
  try { decodeURIComponent(query); } catch (e) { return "encoding broken"; }
  return null;
}
const ctaMailtos = mailtos(strip).concat(mailtos(storeCard))
  // the store-note's plain contact link is a reference, not a conversion CTA
  .filter(m => m.label !== CONTACT);
ok("conversion layer has >= 4 CTA mailtos", ctaMailtos.length >= 4, ctaMailtos.length);
ctaMailtos.forEach(m => {
  const err = checkMailto(m);
  ok("mailto well-formed: " + m.label.slice(0, 40), !err, err || "");
});
// loose global rule: every mailto on the page goes to the canonical contact
const globalBad = [];
{
  const re = /href=(["'])mailto:([^?"']+)/g;
  let m;
  while ((m = re.exec(html))) if (m[2] !== CONTACT) globalBad.push(m[2]);
}
ok("all page mailtos target the canonical contact", globalBad.length === 0, globalBad.join(","));

// ---------- dynamic track-detail mailto (evaluated, not eyeballed) ----------
const fnSrc = appjs.match(/function evidenceMailto\(title\) \{[\s\S]*?\n  \}/);
ok("evidenceMailto helper defined", !!fnSrc);
if (fnSrc) {
  const evidenceMailto = eval("(" + fnSrc[0].replace("function evidenceMailto(title)", "function (title)") + ")");
  const tricky = "Doves & Diamonds <test>";
  const made = evidenceMailto(tricky).replace(/^mailto:/, "");
  const err = checkMailto({ raw: made });
  ok("evidenceMailto well-formed with tricky title", !err, err || "");
  ok("evidenceMailto pre-fills the track title",
    made.includes(encodeURIComponent(tricky)) && made.includes(encodeURIComponent("$49")));
  const z = evidenceMailto("Zooted Zone").replace(/^mailto:/, "");
  ok("evidenceMailto subject names the product price",
    new URLSearchParams(z.split("?")[1]).get("subject").includes("$49"));
}

// ---------- honesty qualifiers: no invented claims ----------
[["No promises your results will match ours", "pitch kit carries the no-promise qualifier"],
 ["50% refund", "evidence report carries the refund term"],
 ["claims-", "evidence report admits unverifiable claims"]].forEach(([s, n]) =>
  ok("honesty: " + n, storeCard.includes(s)));
ok("honesty: no 'buy now' / 'limited' / 'guarantee' urgency tricks",
  !/\b(buy now|limited (time|offer)|act now|guaranteed? results?)\b/i.test(strip + storeCard));

// ---------- product links resolve to real targets ----------
function head(url) {
  return new Promise(resolve => {
    const req = https.get(url, { headers: { "User-Agent": "cuefinder-conversion-test" } }, res => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", () => resolve(-1));
    req.setTimeout(15000, () => { req.destroy(); resolve(-1); });
  });
}
(async () => {
  // every https href inside the conversion regions must resolve 200
  const hrefs = [];
  const re = /<a\b[^>]*href=(["'])(https?:[^"']+)\1/g;
  [strip, storeCard].forEach(src => { let m; while ((m = re.exec(src))) hrefs.push(m[2]); });
  let bad = [];
  for (const u of hrefs) {
    const st = await head(u);
    if (st !== 200) bad.push(u + " -> " + st);
    else process.stdout.write(".");
  }
  console.log();
  ok("all https CTAs in conversion layer resolve HTTP 200", bad.length === 0, bad.join("; ") || hrefs.length + " links");

  // kill rule on the store: if linked, it must be live; if 404, mailto fallback must exist (it does)
  const storeLinked = hrefs.some(u => u.startsWith(STORE));
  const storeStatus = await head(STORE);
  if (storeLinked) {
    ok("cwi-store linked and live", storeStatus === 200, "HTTP " + storeStatus);
  } else {
    ok("cwi-store not linked; mailto fallback carries the products", ctaMailtos.length >= 4, "store HTTP " + storeStatus);
  }
  console.log(`\n${passed} checks passed.`);
})();
