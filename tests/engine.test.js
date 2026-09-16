#!/usr/bin/env node
/* CueFinder engine tests: ranking discrimination + honesty labels.
 * KILL RULE: if distinct queries do not rank meaningfully differently, FAIL (do not ship).
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

// --- honesty labels ---
ok("24 tracks", tracks.length === 24);
tracks.forEach(t => {
  assert.strictEqual(t.bpm_source, "estimate", t.title + " bpm must be estimate");
  assert.strictEqual(t.moods_source, "editorial", t.title);
  assert.strictEqual(t.energy_source, "editorial", t.title);
  assert.strictEqual(t.scenes_source, "editorial", t.title);
});
ok("all BPM labeled estimate, all descriptors labeled editorial", true);
ok("no one-stop/pre-cleared rights claims", catalog.rights.one_stop_claimed === false && catalog.rights.pre_cleared_claimed === false);
ok("explicit provenance present", tracks.every(t => t.explicit_source === "spotify_metadata" || t.explicit_source === "unknown"));
ok("all spotify urls verified", tracks.every(t => t.spotify_url_verified === true && /^https:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]+$/.test(t.spotify_url)));

// --- ranking discrimination: 12 diverse queries ---
const QUERIES = [
  "dark futuristic alt-rap, nighttime driving scene, 95-105 BPM, male vocal, aggressive but controlled, cinematic, clean",
  "fight scene high energy aggressive",
  "romantic fashion film smooth",
  "trailer epic cinematic",
  "chill dreamy montage",
  "club banger 140 bpm",
  "game menu futuristic",
  "instrumental",
  "clean",
  "melancholic piano",
  "luxurious commercial",
  "workout intense 808"
];
const tops = QUERIES.map(q => {
  const r = E.search(tracks, q);
  return { q, top: r.results[0].track.title, score: r.results[0].score.toFixed(1) };
});
tops.forEach(t => console.log(`  "${t.q.slice(0,52)}..." -> ${t.top} (${t.score})`));
const uniqueTops = new Set(tops.map(t => t.top));
ok("12 queries produce >= 8 distinct top results (got " + uniqueTops.size + ")", uniqueTops.size >= 8);

// --- sensibility spot checks ---
function top(q) { return E.search(tracks, q).results[0].track.title; }
ok("fight scene -> high-energy fighter", ["Ultimate", "Flex My Flame", "Misfits and Hooligans", "Zooted Zone", "Warped and Wicked", "Toxic Elements"].includes(top("fight scene high energy aggressive")), top("fight scene high energy aggressive"));
ok("romantic fashion -> smooth romantic", ["Painted Lady", "Doves & Diamonds", "Roses over Monaco", "Rainbows And Roses"].includes(top("romantic fashion film smooth")), top("romantic fashion film smooth"));
ok("instrumental -> the instrumental track", top("instrumental") === "Place I Go to Dream - Instrumental");
ok("chill dreamy montage -> a Dream track", top("chill dreamy montage").startsWith("Place I Go to Dream"), top("chill dreamy montage"));
ok("club 140bpm -> fast club track", ["Zooted Zone", "Flex My Flame", "Misfits and Hooligans", "Ultimate", "Flamerz"].includes(top("club banger 140 bpm")), top("club banger 140 bpm"));
ok("melancholic piano -> sad piano track", ["Tears and Scars", "Spirits n Shadows"].includes(top("melancholic piano")), top("melancholic piano"));
ok("clean query penalizes explicit", (() => {
  const r = E.search(tracks, "aggressive clean");
  const topExp = r.results[0].track.explicit;
  return topExp === false || topExp === "unknown"; // never an explicit:true on top for "clean"
})());
ok("explicit track flagged on clean query", (() => {
  const r = E.search(tracks, "dark clean");
  const flamerz = r.results.find(x => x.track.id === "flamerz");
  return flamerz.explanations.some(e => e.includes("no clean version exists"));
})());
ok("explanations present on top result", E.search(tracks, "dark futuristic driving").results[0].explanations.length >= 2);
ok("empty query returns all 24 in browse mode", E.search(tracks, "").results.length === 24);
ok("parsed BPM range", (() => { const p = E.parseQuery("95-105 BPM"); return p.bpmMin === 95 && p.bpmMax === 105; })());
ok("parsed scene phrase", E.parseQuery("nighttime driving scene").scenes.includes("driving"));
ok("parsed mood synonym", E.parseQuery("epic sci-fi").moods.includes("cinematic") && E.parseQuery("epic sci-fi").moods.includes("futuristic"));

console.log(`\n${passed} checks passed.`);
