#!/usr/bin/env node
/* CueFinder engine tests — BRAND.md schema + kill rules.
 * KILL RULES: (1) 10 diverse queries must rank meaningfully differently.
 * (2) no descriptor presented as measured. (3) BPM always labeled estimate.
 */
const assert = require("assert");
const catalog = require("../app/sync-catalog.json");
const E = require("../app/engine.js");
const tracks = catalog.tracks;

let passed = 0;
function ok(name, cond, extra) {
  if (!cond) { console.error("FAIL:", name, extra || ""); process.exitCode = 1; }
  else { passed++; console.log("ok:", name); }
}

// --- schema / honesty ---
ok("24 tracks", tracks.length === 24);
ok("schema id", catalog.catalog === "cwi.sync-catalog/1.0");
const VB = catalog.vocabularies;
ok("controlled vocabularies present",
  VB.moods.length === 12 && VB.energy_words.length === 6 && VB.scenes.length === 12 &&
  VB.use_cases.length === 7 && VB.instrumentation.length === 10);
tracks.forEach(t => {
  assert.strictEqual(t.descriptors_provenance, "editorial", t.track_id);
  assert.strictEqual(t.audio.bpm.confidence, "estimate", t.track_id + " bpm must be estimate");
  assert.ok(t.audio.energy >= 0 && t.audio.energy <= 1, t.track_id + " energy 0-1");
  assert.ok(t.audio.moods.every(m => VB.moods.includes(m)), t.track_id + " moods controlled");
  assert.ok(t.audio.energy_words.every(w => VB.energy_words.includes(w)), t.track_id + " energy_words controlled");
  assert.ok(t.audio.instrumentation.every(i => VB.instrumentation.includes(i)), t.track_id + " instruments controlled");
  assert.ok(t.sync.scenes.every(s => VB.scenes.includes(s)), t.track_id + " scenes controlled");
  assert.ok(t.sync.use_cases.every(u => VB.use_cases.includes(u)), t.track_id + " use_cases controlled");
  assert.ok(t.sync.sounds_like_reference.startsWith("editorial:"), t.track_id + " sounds_like labeled editorial");
  assert.ok(["male", "instrumental"].includes(t.audio.vocal.type), t.track_id);
  // rights honesty: no pre-cleared / one-stop claims
  assert.strictEqual(t.rights.one_stop, false, t.track_id);
  assert.strictEqual(t.rights.pre_cleared, false, t.track_id);
  assert.strictEqual(t.rights.provenance, "verified", t.track_id);
  assert.ok(/^https:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]+$/.test(t.spotify_url), t.track_id);
  assert.ok(["spotify_metadata", "unknown"].includes(t.audio.explicit_provenance), t.track_id);
});
ok("all descriptors editorial, BPM estimate, energy 0-1, vocab controlled", true);
ok("rights: no one-stop/pre-cleared claims, provenance verified", true);
ok("pipeline honest", tracks.every(t =>
  t.pipeline.spotify === "live" && t.pipeline.youtube === "checklist" &&
  t.pipeline.disco === "checklist" && t.pipeline.sourceaudio === "checklist"));

// --- kill rule 1: ranking discrimination, 12 diverse queries ---
const QUERIES = [
  "dark futuristic alt-rap, nighttime driving scene, 95-105 BPM, male vocal, cinematic, clean",
  "fight scene explosive aggressive",
  "fashion film hazy",
  "game trailer epic cinematic",
  "simmering melancholic end credits",
  "club scene 140 bpm",
  "neon city futuristic",
  "no vocals",
  "clean",
  "melancholic piano",
  "heist sequence menacing",
  "training montage relentless 808s"
];
const tops = QUERIES.map(q => {
  const r = E.search(tracks, q);
  return { q, top: r.results[0].track.title, score: r.results[0].score.toFixed(1) };
});
tops.forEach(t => console.log(`  "${t.q.slice(0,50)}..." -> ${t.top} (${t.score})`));
const uniqueTops = new Set(tops.map(t => t.top));
ok("12 queries produce >= 8 distinct top results (got " + uniqueTops.size + ")", uniqueTops.size >= 8);

// --- sensibility ---
function top(q) { return E.search(tracks, q).results[0].track.title; }
ok("fight scene -> fighter", ["Toxic Elements", "Ultimate", "Flex My Flame", "Misfits and Hooligans", "Zooted Zone", "Warped and Wicked", "Shaka Zulu"].includes(top("fight scene explosive aggressive")), top("fight scene explosive aggressive"));
ok("fashion film hazy -> fashion track", ["Doves & Diamonds", "Painted Lady", "Roses over Monaco", "Diabolique", "Scorpions & Sapphires", "Golden Diamond", "Rainbows And Roses"].includes(top("fashion film hazy")), top("fashion film hazy"));
ok("no vocals -> instrumental", top("no vocals") === "Place I Go to Dream - Instrumental");
ok("club 140bpm -> fast club", ["Zooted Zone", "Flex My Flame", "Misfits and Hooligans", "Ultimate", "Flamerz"].includes(top("club scene 140 bpm")), top("club scene 140 bpm"));
ok("melancholic piano -> piano ballad", ["Tears and Scars", "Spirits n Shadows", "Place I Go to Dream"].includes(top("melancholic piano")), top("melancholic piano"));
ok("clean query never tops an explicit track", (() => {
  const r = E.search(tracks, "aggressive clean");
  return r.results[0].track.audio.explicit !== true;
})());
ok("explicit track flagged on clean query", (() => {
  const r = E.search(tracks, "dark clean");
  const flamerz = r.results.find(x => x.track.track_id === "flamerz");
  return flamerz.explanations.some(e => e.includes("no clean version exists"));
})());
ok("use-case parsed", E.parseQuery("trailer").useCases.includes("trailer"));
ok("game trailer -> scene not use-case", (() => {
  const p = E.parseQuery("game trailer");
  return p.scenes.includes("game trailer") && !p.useCases.includes("game");
})());
ok("scene phrase parsed", E.parseQuery("nighttime driving scene").scenes.includes("nighttime driving"));
ok("energy word parsed", (() => {
  const p = E.parseQuery("relentless");
  return p.energyWords.includes("relentless") && Math.abs(p.energyTarget - 0.92) < 1e-9;
})());
ok("bpm range parsed", (() => { const p = E.parseQuery("95-105 BPM"); return p.bpmMin === 95 && p.bpmMax === 105; })());
ok("around-N bpm parsed", (() => { const p = E.parseQuery("around 100bpm"); return p.bpmMin === 92 && p.bpmMax === 108; })());
ok("radio-safe -> clean", E.parseQuery("radio-safe").cleanReq === "clean");
ok("explanations use brand voice (+ separators)", (() => {
  const r = E.search(tracks, "dark futuristic nighttime driving");
  return r.results[0].explanations.length >= 2;
})());
ok("empty query -> 24 in browse mode", E.search(tracks, "").results.length === 24);

console.log(`\n${passed} checks passed.`);
