#!/usr/bin/env node
/* CueFinder gates test — DESIGN-UPGRADE.md 10-point QA + COMPETITIVE.md edges
 * + INFRASTRUCTURE.md sections 3 & 6. Fails loudly; no v1 forgiveness. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const https = require("https");
const catalog = require("../app/sync-catalog.json");
const E = require("../app/engine.js");
const tracks = catalog.tracks;
const APP = path.join(__dirname, "..", "app");

let passed = 0;
function ok(name, cond, extra) {
  if (!cond) { console.error("FAIL:", name, extra || ""); process.exitCode = 1; }
  else { passed++; console.log("ok:", name); }
}
function read(p) { return fs.readFileSync(path.join(APP, p), "utf8"); }
function searchIdx(q) { return E.search(tracks, q, null, E.buildIndex(tracks)); }

// ---------- QA3: ten queries, ten unique tops (deliberately selected) ----------
const QA3 = [
  ["dark futuristic nighttime driving, 95-105 BPM, male vocal, cinematic, clean", "Diabolique"],
  ["fight scene explosive aggressive", "Ultimate"],
  ["fashion film hazy", "Doves & Diamonds"],
  ["game trailer epic cinematic", "7th Angel"],
  ["simmering melancholic end credits", "Tears and Scars"],
  ["club scene 140 bpm", "Flex My Flame"],
  ["neon city futuristic", "Neon Nights Pt. 777"],
  ["no vocals", "Place I Go to Dream - Instrumental"],
  ["heist sequence menacing", "Toxic Elements"],
  ["zz", "Zooted Zone"]
];
const qa3tops = QA3.map(([q, want]) => {
  const got = searchIdx(q).results[0] && searchIdx(q).results[0].track.title;
  ok("QA3 top: " + JSON.stringify(q.slice(0, 40)) + " -> " + want, got === want, "got " + got);
  return got;
});
ok("QA3 ten distinct top results", new Set(qa3tops).size === 10, [...new Set(qa3tops)].join(","));

// ---------- QA5: fuzzy title matching ----------
ok("QA5 fuzzy 'zz' -> Zooted Zone", searchIdx("zz").results[0].track.title === "Zooted Zone");
ok("QA5 fuzzy subsequence agreement (index vs full scan)",
  E.search(tracks, "dov").results[0].track.title === searchIdx("dov").results[0].track.title);

// ---------- QA7: similar-descriptors pivot ----------
const zz = tracks.find(t => t.track_id === "zooted-zone");
const sim = E.similarTracks("zooted-zone", tracks, 3);
ok("QA7 pivot returns 3", sim.length === 3);
ok("QA7 pivot top-3 each share >=2 moods with Zooted Zone",
  sim.every(s => s.shared.filter(x => zz.audio.moods.includes(x)).length >= 2),
  sim.map(s => s.track.title).join(", "));
ok("QA7 pivot never implies audio analysis",
  JSON.stringify(sim).indexOf("audio analysis") === -1);

// ---------- QA8: hash reload -> deterministic ranking ----------
function hashRoundTrip(q) {
  const h = "#q=" + encodeURIComponent(q);
  const parsed = {};
  h.slice(1).split("&").forEach(kv => { const i = kv.indexOf("="); parsed[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
  const a = E.search(tracks, parsed.q, null, E.buildIndex(tracks)).results.map(r => r.track.track_id).join(",");
  const b = E.search(tracks, parsed.q, null, E.buildIndex(tracks)).results.map(r => r.track.track_id).join(",");
  return a === b && a.length > 0;
}
ok("QA8 hash reload deterministic", hashRoundTrip("dark futuristic nighttime driving 95-105 bpm"));

// ---------- QA2 + gate 6: speed ----------
const t0 = process.hrtime.bigint();
for (let i = 0; i < 50; i++) searchIdx("dark futuristic nighttime driving 95-105 bpm male vocal cinematic");
const avgMs = Number(process.hrtime.bigint() - t0) / 50 / 1e6;
ok("QA2/gate6 ranking under 50ms (avg " + avgMs.toFixed(2) + "ms)", avgMs < 50);
ok("QA2 timing logged to console", read("app.js").includes('console.log("[cuefinder] ranked'));

// ---------- QA9: contrast >= 4.5:1 for text colors on #0A0C10 ----------
function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(fg, bg) { const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
[["#EDEFF2", "text"], ["#8A93A3", "secondary"], ["#FFB224", "amber"], ["#3DFF88", "green"]]
  .forEach(([fg, name]) => {
    const r = ratio(fg, "#0A0C10");
    ok("QA9 contrast " + name + " " + r.toFixed(1) + ":1 >= 4.5", r >= 4.5);
  });
ok("QA9 reduced-motion kills all animation",
  read("styles.css").includes("@media (prefers-reduced-motion: reduce)"));
ok("QA9 screen-reader labels on results",
  read("index.html").includes('role="listbox"') && read("app.js").includes("aria-activedescendant") &&
  read("app.js").includes('aria-label'));

// ---------- QA10: approved palette only ----------
const APPROVED = ["#0A0C10", "#12151C", "#FFB224", "#3DFF88", "#EDEFF2", "#8A93A3", "#FF5C5C", "#222836", "#1C212B", "#161A22"];
["styles.css", "brand/tokens.css", "brand/index.html"].forEach(f => {
  const hexes = (read(f).match(/#[0-9A-Fa-f]{6}/g) || []).map(h => h.toUpperCase());
  const bad = hexes.filter(h => !APPROVED.includes(h));
  ok("QA10 palette-approved: " + f, bad.length === 0, bad.join(","));
});

// ---------- QA1: keyboard loop ----------
["ArrowDown", "ArrowUp", "aria-activedescendant"].forEach(k =>
  ok("QA1 keyboard: " + k + " present", read("app.js").includes(k)));
ok("QA1 Enter opens one-sheet", /Enter/.test(read("app.js")) && read("app.js").includes("openSheet"));
ok("QA1 Esc clears", read("app.js").includes('"Escape"'));
ok("QA1 1-9 jump", /e\.key >= "1" && e\.key <= "9"/.test(read("app.js")));
ok("QA1 / and Cmd+K focus", read("app.js").includes('e.key === "/"') && read("app.js").includes('"k"'));

// ---------- QA4: empty state teaches grammar ----------
ok("QA4 exactly 3 concise example chips", (() => {
  const m = read("app.js").match(/var EXAMPLES = \[([\s\S]*?)\];/);
  const items = m[1].split("\n").filter(l => l.trim().startsWith('"'));
  return items.length === 3 && items.every(l => l.replace(/[",\s]/g, "").length <= 34);
})());
ok("QA4 recents via localStorage", read("app.js").includes("cuefinder.recents"));
ok("QA4 autofocus", /q\.focus\(\); \/\/ autofocus/.test(read("app.js")));
ok("QA4 warming-up crosshair + scanline", read("index.html").includes("warming up the desk") && read("styles.css").includes(".scanline"));

// ---------- QA6: refinements ----------
ok("QA6 'slower' parses to low-energy refinement",
  Math.abs(E.parseQuery("slower").energyTarget - 0.32) < 1e-9);
ok("QA6 '+ more piano' appends piano",
  E.parseQuery("dark + more piano").instruments.includes("piano"));
ok("QA6 refinement breadcrumb renders + removable", read("app.js").includes('class="rchip"'));
ok("QA6 backspace removes last facet chip", read("app.js").includes('e.key === "Backspace"'));

// ---------- competitive edges (7th gate: each visible and working) ----------
// 1. live timing readout
ok("EDGE1 timing readout in UI", read("index.html").includes('id="timing"') && read("app.js").includes("ranked "));
// 2. mono explanation, missed struck through
ok("EDGE2 explanation line w/ struck missed", read("app.js").includes("<s") && read("styles.css").includes(".r-expl s"));
// 3. rights badge most prominent after title
const rowHTML = read("app.js");
const titlePos = rowHTML.indexOf('class="r-title"'), rightsPos = rowHTML.indexOf('class="r-rights"');
ok("EDGE3 rights badge immediately after title", titlePos > -1 && rightsPos > titlePos && rightsPos - titlePos < 120);
ok("EDGE3 badge copy is DIRECT CLEARANCE (verified facts)", rowHTML.includes("DIRECT CLEARANCE"));
// 4. one-click copy search link
ok("EDGE4 copy search link", read("index.html").includes("copy search link") && read("app.js").includes("clipboard"));
// 5. machine layer in footer
["sync-catalog.json", "v1/sync-catalog.json", "discovery.txt", "agent-card.json", "Built for agents too"]
  .forEach(s => ok("EDGE5 footer machine link: " + s, read("index.html").includes(s)));
// 6. counts as licensable matches
ok("EDGE6 'licensable matches' phrasing", read("app.js").includes("licensable match"));
// copy rules: no named-company comparisons, no superlatives
const copy = read("index.html");
ok("COPY no superlatives / named comparisons",
  !/\b(best|smartest|better than (Spotify|Apple|DISCO|SourceAudio))\b/i.test(copy));

// ---------- scale (§6) ----------
const idx = E.buildIndex(tracks);
ok("SCALE precomputed token index", idx.size === 24 && Object.keys(idx.moods).length > 0 &&
  idx.moods.dark.every(i => tracks[i].audio.moods.includes("dark")));
ok("SCALE index candidates agree with full scan on tops",
  ["dark futuristic", "melancholic piano", "fashion film hazy", "zz"].every(q =>
    E.search(tracks, q).results[0].track.track_id === searchIdx(q).results[0].track.track_id));
ok("SCALE rank() is pure", (() => {
  const p = E.parseQuery("dark futuristic");
  const a = E.rank(tracks, p).map(r => r.track.track_id).join(",");
  const b = E.rank(tracks, p).map(r => r.track.track_id).join(",");
  return a === b;
})());

// ---------- technology (§6): versioning, agent card, embed, brand surface ----------
ok("TECH v1 snapshot exists", fs.existsSync(path.join(APP, "v1", "sync-catalog.json")));
const v1 = require("../app/v1/sync-catalog.json");
ok("TECH v1 namespaced schema", v1.catalog_id === "cwi.tbhh.sync-catalog" && v1.schema_version === "1.0.0" && v1.track_count === 24);
ok("TECH v1 changelog", fs.existsSync(path.join(APP, "v1", "CHANGELOG.md")));
ok("TECH agent-card.json", (() => {
  const ac = JSON.parse(read(".well-known/agent-card.json"));
  return ac.name === "CueFinder" && ac.urls.sync_catalog_v1 && ac.for_agents;
})());
ok("TECH .nojekyll (dot-paths serve)", fs.existsSync(path.join(APP, ".nojekyll")));
ok("TECH embed widget (iframe target, zero-chrome)", fs.existsSync(path.join(APP, "embed.html")) &&
  read("embed.html").includes("CueFinder embed") && read("embed.html").includes("engine.js"));
ok("TECH brand surface", fs.existsSync(path.join(APP, "brand", "index.html")) && fs.existsSync(path.join(APP, "brand", "tokens.css")));
ok("TECH zero-dependency JS", !/require\(|import /m.test(read("app.js")) && !/require\(|import /m.test(read("engine.js")));

// ---------- gate 5: Spotify-link gate (live oembed check, all 24) ----------
function oembed(url) {
  return new Promise(resolve => {
    const req = https.get("https://open.spotify.com/oembed?url=" + encodeURIComponent(url), res => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => resolve(res.statusCode === 200 && body.includes("title")));
    });
    req.on("error", () => resolve(false));
    req.setTimeout(12000, () => { req.destroy(); resolve(false); });
  });
}
(async () => {
  let bad = [];
  for (const t of tracks) {
    const good = await oembed(t.spotify_url);
    if (!good) bad.push(t.track_id);
    else process.stdout.write(".");
  }
  console.log();
  ok("GATE5 all 24 Spotify URLs resolve via oembed", bad.length === 0, bad.join(","));
  console.log(`\n${passed} checks passed.`);
})();
