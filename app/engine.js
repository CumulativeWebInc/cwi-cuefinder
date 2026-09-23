/* CueFinder search engine — pure logic, no DOM.
 * Works in the browser (window.CUEFINDER_ENGINE) and in Node (module.exports).
 *
 * Controlled vocabularies per BRAND.md section 3 (moods, energy words, scenes,
 * use cases, instrumentation) — shared by engine + catalog.
 * Common non-controlled words resolve through a documented synonym map to the
 * nearest controlled term; unmapped words simply do not match.
 * Explanations follow the brand voice: terse mono readouts joined with " + ".
 *
 * SCALE (INFRASTRUCTURE.md section 6): the 24 -> 10,000 track path.
 * - buildIndex(tracks) precomputes a token index (mood/scene/instrument/
 *   use-case/energy-word -> track positions) at build/load time.
 * - search() ranks from the index's candidate set instead of the full catalog.
 * - rank() is a pure function of (candidates, parsedQuery): no DOM, no state,
 *   no network. It can move into a Web Worker untouched — postMessage the
 *   parsed query + candidates in, receive ranked results out.
 * - Static JSON on the CDN keeps reads at $0 regardless of catalog size.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.CUEFINDER_ENGINE = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- controlled vocabularies (BRAND.md section 3) ----
  var MOODS = ["dark", "futuristic", "aggressive", "cinematic", "melancholic",
    "euphoric", "menacing", "triumphant", "hazy", "anthemic", "brooding", "electric"];

  var ENERGY_WORDS = ["relentless", "simmering", "explosive", "cruising", "hypnotic", "soaring"];

  var SCENES = ["nighttime driving", "fight scene", "heist sequence", "chase",
    "locker room", "fashion film", "game trailer", "title sequence",
    "club scene", "training montage", "end credits", "neon city"];

  var USE_CASES = ["trailer", "film", "tv", "game", "ad", "fashion film", "sports"];

  var INSTRUMENTS = ["808s", "trap hats", "distorted synths", "synth pads",
    "piano", "strings", "choir", "guitar", "brass", "vocal chops"];

  // ---- documented synonym maps (non-controlled -> nearest controlled term) ----
  var MOOD_SYNONYMS = {
    "moody": "dark",
    "future": "futuristic", "sci-fi": "futuristic", "scifi": "futuristic", "spacey": "futuristic",
    "hard": "aggressive", "fierce": "aggressive",
    "epic": "cinematic", "filmic": "cinematic",
    "sad": "melancholic", "somber": "melancholic", "nostalgic": "melancholic", "emotional": "melancholic",
    "happy": "euphoric", "uplifting": "euphoric", "joyful": "euphoric",
    "ominous": "menacing", "threatening": "menacing",
    "triumphal": "triumphant", "victorious": "triumphant", "luxurious": "triumphant", "fancy": "triumphant",
    "smooth": "hazy", "chill": "hazy", "dreamy": "hazy", "romantic": "hazy", "seductive": "hazy",
    "anthem": "anthemic", "stadium": "anthemic", "confident": "anthemic", "bold": "anthemic",
    "gritty": "brooding", "raw": "brooding", "haunting": "brooding", "spooky": "brooding",
    "eerie": "brooding", "introspective": "brooding", "reflective": "brooding",
    "wild": "electric", "rebellious": "electric", "punk": "electric", "charged": "electric"
  };

  var ENERGY_TARGETS = {
    "explosive": 0.95, "relentless": 0.92, "soaring": 0.80, "cruising": 0.55,
    "hypnotic": 0.45, "simmering": 0.35,
    "high-energy": 0.90, "high energy": 0.90, "energetic": 0.80, "intense": 0.90,
    "hard-hitting": 0.90, "low-energy": 0.30, "low energy": 0.30,
    "mellow": 0.40, "laid-back": 0.35, "laidback": 0.35, "calm": 0.25, "soft": 0.30, "gentle": 0.25,
    // refinement words — appended by the UI ("slower", "faster") or typed directly
    "slower": 0.32, "faster": 0.85, "softer": 0.28, "harder": 0.90
  };

  // scene -> trigger phrases (checked longest-first)
  var SCENE_TRIGGERS = {
    "nighttime driving": ["nighttime driving", "night driving", "driving"],
    "fight scene": ["fight scene", "fight", "combat"],
    "heist sequence": ["heist sequence", "heist"],
    "chase": ["car chase", "chase", "pursuit"],
    "locker room": ["locker room"],
    "fashion film": ["fashion film", "fashion", "runway"],
    "game trailer": ["game trailer"],
    "title sequence": ["title sequence", "opening credits", "opening titles"],
    "club scene": ["club scene", "nightclub", "dancefloor", "dance floor", "club"],
    "training montage": ["training montage", "montage"],
    "end credits": ["end credits", "credits"],
    "neon city": ["neon city"]
  };

  // use case -> trigger words (checked after scene phrases are consumed)
  var USECASE_TRIGGERS = {
    "trailer": ["trailer"],
    "film": ["film", "movie", "cinema"],
    "tv": ["tv", "television", "show", "series"],
    "game": ["video game", "gaming", "game"],
    "ad": ["advertisement", "commercial", "brand film", "ad"],
    "sports": ["sports", "sport"],
    "fashion film": ["fashion film"]
  };

  var INSTRUMENT_SYNONYMS = {
    "808": "808s", "808's": "808s",
    "synth": "distorted synths", "synths": "distorted synths", "synthesizer": "distorted synths",
    "pads": "synth pads", "keys": "piano", "orchestral": "strings", "orchestra": "strings",
    "hi-hats": "trap hats", "hihats": "trap hats", "hats": "trap hats",
    "guitars": "guitar", "sub-bass": "808s", "sub bass": "808s"
  };

  function norm(q) {
    return (" " + (q || "").toLowerCase()
      .replace(/[–—]/g, "-")
      .replace(/[.,!?;:()"“”‘’']/g, " ")
      .replace(/\s+/g, " ") + " ");
  }

  function takePhrase(text, phrase) {
    var needle = " " + phrase + " ";
    return text.indexOf(needle) !== -1 ? text.split(needle).join(" ") : null;
  }

  function parseQuery(raw) {
    var text = norm(raw);
    var p = {
      raw: raw || "", moods: [], scenes: [], useCases: [], instruments: [],
      energyWords: [], energyTarget: null,
      bpmMin: null, bpmMax: null, vocal: null, cleanReq: null, genreHit: false,
      titleBits: []
    };
    function take(phrases, hit) {
      var ps = phrases.slice().sort(function (a, b) { return b.length - a.length; });
      for (var i = 0; i < ps.length; i++) {
        var rest = takePhrase(text, ps[i]);
        if (rest !== null) { text = rest; hit(ps[i]); return true; }
      }
      return false;
    }

    // scenes (phrases first — "game trailer" must win over bare "trailer")
    Object.keys(SCENE_TRIGGERS).forEach(function (scene) {
      take(SCENE_TRIGGERS[scene], function () { p.scenes.push(scene); });
    });

    // use cases
    Object.keys(USECASE_TRIGGERS).forEach(function (uc) {
      take(USECASE_TRIGGERS[uc], function () {
        if (p.useCases.indexOf(uc) === -1) p.useCases.push(uc);
      });
    });

    // energy words + generic energy terms + refinement words (longest first)
    Object.keys(ENERGY_TARGETS).sort(function (a, b) { return b.length - a.length; }).forEach(function (w) {
      take([w], function () {
        p.energyTarget = ENERGY_TARGETS[w];
        if (ENERGY_WORDS.indexOf(w) !== -1 && p.energyWords.indexOf(w) === -1) p.energyWords.push(w);
      });
    });

    // BPM
    var m = text.match(/(\d{2,3})\s*(?:-|to)\s*(\d{2,3})\s*bpm/);
    if (m) { p.bpmMin = +m[1]; p.bpmMax = +m[2]; text = text.replace(m[0], " "); }
    else {
      m = text.match(/under\s*(\d{2,3})\s*bpm/);
      if (m) { p.bpmMax = +m[1]; text = text.replace(m[0], " "); }
      else {
        m = text.match(/over\s*(\d{2,3})\s*bpm/);
        if (m) { p.bpmMin = +m[1]; text = text.replace(m[0], " "); }
        else {
          m = text.match(/(?:about|around|near|~)\s*(\d{2,3})\s*bpm/);
          if (m) { p.bpmMin = +m[1] - 8; p.bpmMax = +m[1] + 8; text = text.replace(m[0], " "); }
          else {
            m = text.match(/(\d{2,3})\s*bpm/);
            if (m) { p.bpmMin = +m[1] - 6; p.bpmMax = +m[1] + 6; text = text.replace(m[0], " "); }
          }
        }
      }
    }
    if (p.bpmMin === null && p.bpmMax === null) {
      if (take(["slow tempo"], function () {})) p.bpmMax = 95;
      else if (take(["fast tempo"], function () {})) p.bpmMin = 130;
      else if (take(["mid-tempo", "mid tempo"], function () {})) { p.bpmMin = 90; p.bpmMax = 115; }
    }

    // instruments (controlled first, then synonyms)
    INSTRUMENTS.slice().sort(function (a, b) { return b.length - a.length; }).forEach(function (ins) {
      take([ins], function () { if (p.instruments.indexOf(ins) === -1) p.instruments.push(ins); });
    });
    Object.keys(INSTRUMENT_SYNONYMS).forEach(function (syn) {
      take([syn], function () {
        var v = INSTRUMENT_SYNONYMS[syn];
        if (p.instruments.indexOf(v) === -1) p.instruments.push(v);
      });
    });

    // vocal
    take(["female vocal"], function () { p.vocal = "female"; });
    take(["male vocal"], function () { p.vocal = "male"; });
    take(["no vocals", "no vocal", "instrumental"], function () { p.vocal = "instrumental"; });

    // clean / explicit (consumed from text so they don't become title bits)
    if (take(["radio-safe", "radio safe", "fcc safe"], function () {})) p.cleanReq = "clean";
    else { var cr = takePhrase(text, "clean"); if (cr !== null) { text = cr; p.cleanReq = "clean"; } }
    if (!p.cleanReq) { var er = takePhrase(text, "explicit"); if (er !== null) { text = er; p.cleanReq = "explicit"; } }

    // genre (informational — whole catalog matches)
    if (take(["alternative rap", "alt-rap", "alt rap", "post-trap futurism", "post-trap", "post trap", "hip-hop", "hip hop", "rap"], function () {})) {
      p.genreHit = true;
    }

    // moods: synonyms first, then controlled words
    Object.keys(MOOD_SYNONYMS).forEach(function (syn) {
      take([syn], function () {
        var v = MOOD_SYNONYMS[syn];
        if (p.moods.indexOf(v) === -1) p.moods.push(v);
      });
    });
    MOODS.forEach(function (mood) {
      take([mood], function () {
        if (p.moods.indexOf(mood) === -1) p.moods.push(mood);
      });
    });

    // leftover words (>=2 chars) become title/alias fuzzy bits, e.g. "zz" -> Zooted Zone
    text.trim().split(/\s+/).forEach(function (w) {
      if (w.length >= 2 && p.titleBits.indexOf(w) === -1) p.titleBits.push(w);
    });

    return p;
  }

  // fuzzy subsequence: every char of q appears in order in s
  function subseqScore(q, s) {
    var qi = 0;
    var first = -1, last = -1;
    for (var i = 0; i < s.length && qi < q.length; i++) {
      if (s[i] === q[qi]) { if (first === -1) first = i; last = i; qi++; }
    }
    if (qi < q.length) return 0;
    var span = last - first + 1;
    // compact matches outrank scattered ones; exact substring gets a bonus
    var base = (q.length * q.length) / span;
    if (s.indexOf(q) !== -1) base += 2;
    return base;
  }

  function titleScore(title, bits) {
    var t = title.toLowerCase();
    var s = 0;
    bits.forEach(function (b) { s += subseqScore(b, t); });
    return s;
  }

  /* Precomputed token index — built once per catalog load.
   * 24 tracks: trivial. 10,000 tracks: same code, same shape, no rewrite.
   * The worker-ready ranking contract: rank(candidates, parsed) is pure. */
  function buildIndex(tracks) {
    var idx = { byId: {}, moods: {}, scenes: {}, instruments: {}, useCases: {}, energyWords: {}, size: tracks.length };
    function add(map, key, i) {
      if (!map[key]) map[key] = [];
      map[key].push(i);
    }
    tracks.forEach(function (t, i) {
      idx.byId[t.track_id] = i;
      t.audio.moods.forEach(function (m) { add(idx.moods, m, i); });
      t.sync.scenes.forEach(function (s) { add(idx.scenes, s, i); });
      t.audio.instrumentation.forEach(function (x) { add(idx.instruments, x, i); });
      t.sync.use_cases.forEach(function (u) { add(idx.useCases, u, i); });
      t.audio.energy_words.forEach(function (w) { add(idx.energyWords, w, i); });
    });
    return idx;
  }

  function candidatesFromIndex(idx, p, tracks) {
    var seen = {}, out = [];
    function addList(list) {
      if (!list) return;
      list.forEach(function (i) { if (!seen[i]) { seen[i] = true; out.push(i); } });
    }
    p.moods.forEach(function (m) { addList(idx.moods[m]); });
    p.scenes.forEach(function (s) { addList(idx.scenes[s]); });
    p.instruments.forEach(function (x) { addList(idx.instruments[x]); });
    p.useCases.forEach(function (u) { addList(idx.useCases[u]); });
    p.energyWords.forEach(function (w) { addList(idx.energyWords[w]); });
    // title bits always scan the full catalog (cheap: 24 titles; at 10k, a trigram sidecar)
    if (p.titleBits.length) {
      tracks.forEach(function (t, i) {
        if (!seen[i] && titleScore(t.title, p.titleBits) > 0) { seen[i] = true; out.push(i); }
      });
    }
    return out;
  }

  function scoreTrack(t, p) {
    var score = 0, ex = [];
    var matched = [], missed = [];
    var audio = t.audio, sync = t.sync;

    p.scenes.forEach(function (s) {
      if (sync.scenes.indexOf(s) !== -1) { score += 4; ex.push(s.replace(/ /g, "-") + " tag"); matched.push(s); }
      else missed.push(s);
    });
    p.useCases.forEach(function (u) {
      if (sync.use_cases.indexOf(u) !== -1) { score += 2; ex.push(u + " use-case"); matched.push(u); }
      else missed.push(u);
    });
    p.moods.forEach(function (mood) {
      var idx = audio.moods.indexOf(mood);
      // first-listed mood is the track's primary descriptor — weight it slightly higher
      if (idx !== -1) { score += 2 + (idx === 0 ? 0.5 : 0); ex.push(mood); matched.push(mood); }
      else missed.push(mood);
    });
    p.energyWords.forEach(function (w) {
      if (audio.energy_words.indexOf(w) !== -1) { score += 1.5; ex.push('"' + w + '" energy'); matched.push(w); }
      else missed.push(w);
    });

    if (p.energyTarget !== null) {
      var diff = Math.abs(audio.energy - p.energyTarget);
      var eScore = Math.max(0, 3 - diff * 7.5);
      score += eScore;
      if (eScore > 0.5) { ex.push("energy " + audio.energy.toFixed(2)); matched.push("energy"); }
      else missed.push("energy");
    }

    if (p.bpmMin !== null || p.bpmMax !== null) {
      var lo = p.bpmMin === null ? 0 : p.bpmMin, hi = p.bpmMax === null ? 999 : p.bpmMax;
      var bpm = audio.bpm.value;
      var label = (p.bpmMin !== null && p.bpmMax !== null)
        ? (p.bpmMin + "–" + p.bpmMax + " range")
        : (p.bpmMax !== null ? "under " + p.bpmMax : "over " + p.bpmMin);
      if (bpm >= lo && bpm <= hi) { score += 3; ex.push(bpm + " BPM (est.) in " + label); matched.push("bpm"); }
      else if (Math.abs(bpm - lo) <= 8 || Math.abs(bpm - hi) <= 8) { score += 1; ex.push(bpm + " BPM (est.) near " + label); matched.push("bpm"); }
      else { score -= 2; ex.push(bpm + " BPM (est.) outside " + label); missed.push("bpm"); }
    }

    p.instruments.forEach(function (ins) {
      if (audio.instrumentation.indexOf(ins) !== -1) { score += 1.5; ex.push(ins + " in mix"); matched.push(ins); }
      else missed.push(ins);
    });

    if (p.vocal) {
      if (audio.vocal.type === p.vocal) { score += 2; ex.push(p.vocal === "male" ? "male vocal" : "instrumental"); matched.push(p.vocal === "male" ? "male vocal" : "instrumental"); }
      else { score -= 4; ex.push("not " + p.vocal); missed.push(p.vocal); }
    }

    if (p.cleanReq === "clean") {
      if (audio.explicit === false) { score += 2; ex.push("clean per Spotify metadata"); matched.push("clean"); }
      else if (audio.explicit === true) { score -= 6; ex.push("explicit per Spotify metadata — no clean version exists"); missed.push("clean"); }
      else { score -= 4; ex.push("explicit status unknown — not confirmed clean"); missed.push("clean"); }
    } else if (p.cleanReq === "explicit") {
      if (audio.explicit === true) { score += 2; ex.push("explicit per Spotify metadata"); matched.push("explicit"); }
      else if (audio.explicit === "unknown") { score -= 2; ex.push("explicit status unknown"); missed.push("explicit"); }
    }

    if (p.titleBits.length) {
      var ts = titleScore(t.title, p.titleBits);
      if (ts > 0) {
        score += 2 + ts;
        ex.push('title "' + p.titleBits.join(" ") + '"');
        matched.push('title:"' + p.titleBits.join(" ") + '"');
      } else missed.push('title:"' + p.titleBits.join(" ") + '"');
    }

    if (p.genreHit) ex.push("alt-rap catalog");

    return { score: score, explanations: ex, matched: matched, missed: missed };
  }

  /* rank(): pure ranking over a candidate set. No DOM, no state, no network.
   * This is the Web-Worker-ready seam: postMessage {candidates, parsed} in,
   * ranked results out — the function body moves untouched. */
  function rank(candidates, parsed) {
    var results = candidates.map(function (t) {
      var s = scoreTrack(t, parsed);
      return { track: t, score: s.score, explanations: s.explanations, matched: s.matched, missed: s.missed };
    });
    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.track.audio.energy !== a.track.audio.energy) return b.track.audio.energy - a.track.audio.energy;
      return a.track.title < b.track.title ? -1 : 1;
    });
    return results;
  }

  function search(tracks, rawQuery, uiFilters, index) {
    var t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    var p = parseQuery(rawQuery);
    var f = uiFilters || {};
    if (f.bpmMin != null && f.bpmMin !== "") p.bpmMin = +f.bpmMin;
    if (f.bpmMax != null && f.bpmMax !== "") p.bpmMax = +f.bpmMax;
    if (f.energy && f.energy !== "any") {
      p.energyTarget = f.energy === "low" ? 0.30 : f.energy === "mid" ? 0.55 : 0.90;
    }
    if (f.vocal && f.vocal !== "any") p.vocal = f.vocal;
    if (f.cleanReq && f.cleanReq !== "any") p.cleanReq = f.cleanReq;
    if (f.moods && f.moods.length) {
      f.moods.forEach(function (m) { if (p.moods.indexOf(m) === -1) p.moods.push(m); });
    }
    if (f.scene && f.scene !== "any") {
      if (p.scenes.indexOf(f.scene) === -1) p.scenes.push(f.scene);
    }

    var hasCriteria = p.moods.length || p.scenes.length || p.useCases.length ||
      p.instruments.length || p.energyWords.length || p.energyTarget !== null ||
      p.bpmMin !== null || p.bpmMax !== null || p.vocal || p.cleanReq || p.titleBits.length;

    // Index narrowing (the scale path): for token-only queries the candidate set
    // comes from the precomputed posting lists. Queries with global criteria
    // (BPM, energy target, vocal, lyrics) score every track, so they scan all.
    var tokenOnly = !(p.bpmMin !== null || p.bpmMax !== null || p.energyTarget !== null || p.vocal || p.cleanReq);
    var candIdx = (index && hasCriteria && tokenOnly)
      ? candidatesFromIndex(index, p, tracks)
      : tracks.map(function (_, i) { return i; });
    var candidates = candIdx.map(function (i) { return tracks[i]; });

    var results = rank(candidates, p);
    if (!hasCriteria) results.forEach(function (r) {
      r.explanations = ["browse mode"]; r.matched = []; r.missed = [];
    });
    var t1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    return { parsed: p, results: results, ms: t1 - t0, candidateCount: candidates.length, totalTracks: tracks.length };
  }

  /* "Similar descriptors" pivot: given one track, rank the rest by shared
   * descriptors. Never implies audio analysis — descriptors only. */
  function similarTracks(trackId, tracks, limit) {
    var base = null;
    tracks.forEach(function (t) { if (t.track_id === trackId) base = t; });
    if (!base) return [];
    var scored = [];
    tracks.forEach(function (t) {
      if (t.track_id === trackId) return;
      var s = 0, shared = [];
      t.audio.moods.forEach(function (m, i) {
        var bi = base.audio.moods.indexOf(m);
        if (bi !== -1) { s += 2 + (i === 0 || bi === 0 ? 0.5 : 0); shared.push(m); }
      });
      t.audio.energy_words.forEach(function (w) {
        if (base.audio.energy_words.indexOf(w) !== -1) { s += 1.5; shared.push('"' + w + '"'); }
      });
      t.audio.instrumentation.forEach(function (x) {
        if (base.audio.instrumentation.indexOf(x) !== -1) { s += 1.5; shared.push(x); }
      });
      t.sync.scenes.forEach(function (sc) {
        if (base.sync.scenes.indexOf(sc) !== -1) { s += 2; shared.push(sc.replace(/ /g, "-")); }
      });
      s -= Math.abs(t.audio.energy - base.audio.energy) * 3;
      scored.push({ track: t, score: s, shared: shared });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, limit || 6);
  }

  return { parseQuery: parseQuery, scoreTrack: scoreTrack, search: search,
           rank: rank, buildIndex: buildIndex, similarTracks: similarTracks,
           subseqScore: subseqScore,
           MOODS: MOODS, ENERGY_WORDS: ENERGY_WORDS, SCENES: SCENES,
           USE_CASES: USE_CASES, INSTRUMENTS: INSTRUMENTS };
});
