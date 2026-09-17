#!/usr/bin/env node
/* CueFinder brief-packs tests — v1.1.0 sync brief packs.
 * KILL RULES: (1) 5 packs, each >= 2 tracks, all descriptors verbatim from
 * sync-catalog.json (deep-equal — no drift, no invention).
 * (2) No one-stop / pre-cleared claims anywhere, affirmative or implied.
 * (3) Provenance labels and controlled vocabularies preserved on every track.
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const V1 = path.join(__dirname, "..", "app", "v1");
const bundle = JSON.parse(fs.readFileSync(path.join(V1, "brief-packs.json"), "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(V1, "sync-catalog.json"), "utf8"));

let passed = 0;
function ok(name, cond, extra) {
  if (!cond) { console.error("FAIL:", name, extra || ""); process.exitCode = 1; }
  else { passed++; console.log("ok:", name); }
}

const byId = Object.fromEntries(catalog.tracks.map(t => [t.track_id, t]));

// ---------- bundle shape ----------
ok("schema id", bundle.schema === "cwi.brief-packs/1.0");
ok("catalog_id matches v1 catalog", bundle.catalog_id === catalog.catalog_id);
ok("5 packs", bundle.pack_count === 5 && bundle.brief_packs.length === 5);
const want = ["sports-hype", "trailer-tension", "fashion-film", "horror-thriller", "sneaker-commercial"];
ok("pack ids", JSON.stringify(bundle.pack_ids) === JSON.stringify(want), bundle.pack_ids.join(","));
ok("extensionless twin identical to .json",
  fs.readFileSync(path.join(V1, "brief-packs"), "utf8") === fs.readFileSync(path.join(V1, "brief-packs.json"), "utf8"));

// ---------- per-pack ----------
const VB = catalog.vocabularies;
for (const pack of bundle.brief_packs) {
  const pid = pack.pack_id;
  ok(pid + ": single-pack file parses",
    JSON.parse(fs.readFileSync(path.join(V1, `brief-packs-${pid}.json`), "utf8")).pack_id === pid);
  ok(pid + ": name + description", !!pack.name && pack.description.length > 40);
  ok(pid + ": >=2 tracks", pack.track_count >= 2 && pack.tracks.length === pack.track_count);
  ok(pid + ": catalog_ref pins v1 catalog", pack.catalog_ref.endsWith("/v1/sync-catalog.json"));
  ok(pid + ": rights_summary denies one-stop/pre-cleared",
    pack.rights_summary.one_stop_claimed === false && pack.rights_summary.pre_cleared_claimed === false);

  for (const t of pack.tracks) {
    const src = byId[t.track_id];
    ok(pid + "/" + t.track_id + ": exists in catalog", !!src);
    if (!src) continue;
    for (const k of ["audio", "sync", "rights", "credits"]) {
      ok(pid + "/" + t.track_id + ": " + k + " verbatim from catalog",
        JSON.stringify(t[k]) === JSON.stringify(src[k]));
    }
    ok(pid + "/" + t.track_id + ": BPM labeled estimate", t.audio.bpm.confidence === "estimate");
    ok(pid + "/" + t.track_id + ": provenance preserved",
      t.descriptors_provenance === src.descriptors_provenance &&
      t.audio.energy_provenance === src.audio.energy_provenance);
    const bad = (t.audio.moods || []).filter(m => !VB.moods.includes(m))
      .concat((t.audio.energy_words || []).filter(w => !VB.energy_words.includes(w)))
      .concat((t.sync.scenes || []).filter(s => !VB.scenes.includes(s)))
      .concat((t.sync.use_cases || []).filter(u => !VB.use_cases.includes(u)));
    ok(pid + "/" + t.track_id + ": controlled vocab only", bad.length === 0, bad.join(","));
    ok(pid + "/" + t.track_id + ": match_note carries no claims beyond descriptors",
      /pre-?cleared|one-?stop|licensed/i.test(t.match_note) === false);
  }
}

// ---------- global: no affirmative one-stop / pre-cleared claims ----------
function strings(o, acc) {
  if (typeof o === "string") acc.push(o);
  else if (Array.isArray(o)) o.forEach(x => strings(x, acc));
  else if (o && typeof o === "object") Object.values(o).forEach(x => strings(x, acc));
  return acc;
}
const all = strings(bundle, []);
const hits = all.filter(s => /pre-?cleared|one-?stop/i.test(s));
ok("rights language present only as explicit denial",
  hits.length > 0 && hits.every(s => /\b(no|never|not|false)\b/i.test(s)),
  JSON.stringify(hits).slice(0, 200));
ok("no true one_stop/pre_cleared booleans anywhere",
  !/"(one_stop|pre_cleared)":\s*true/.test(JSON.stringify(bundle)));

// ---------- index ----------
const idx = JSON.parse(fs.readFileSync(path.join(V1, "index.json"), "utf8"));
ok("v1 index lists brief-packs endpoint",
  idx.endpoints.some(e => e.path === "/v1/brief-packs"));
ok("v1 index lists all 5 single-pack files",
  want.every(id => idx.endpoints.some(e => e.path === `/v1/brief-packs-${id}.json`)));

console.log(`\n${passed} checks passed`);
