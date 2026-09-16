/* CueFinder search engine — pure logic, no DOM.
 * Works in the browser (window.CUEFINDER_ENGINE) and in Node (module.exports).
 * Controlled vocabularies per BRAND.md section 3 (moods, energy words, scenes,
 * use cases, instrumentation) — shared by engine + catalog.
 * Common non-controlled words resolve through a documented synonym map to the
 * nearest controlled term; unmapped words simply do not match.
 * Explanations follow the brand voice: terse mono readouts joined with " + ".
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
    "mellow": 0.40, "laid-back": 0.35, "laidback": 0.35, "calm": 0.25, "soft": 0.30, "gentle": 0.25
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
      bpmMin: null, bpmMax: null, vocal: null, cleanReq: null, genreHit: false
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

    // energy words + generic energy terms (longest first)
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

    // clean / explicit
    if (take(["radio-safe", "radio safe", "fcc safe"], function () {}) || takePhrase(text, "clean")) p.cleanReq = "clean";
    else if (takePhrase(text, "explicit")) p.cleanReq = "explicit";

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

    return p;
  }

  function scoreTrack(t, p) {
    var score = 0, ex = [];
    var audio = t.audio, sync = t.sync;

    p.scenes.forEach(function (s) {
      if (sync.scenes.indexOf(s) !== -1) { score += 4; ex.push(s.replace(/ /g, "-") + " tag"); }
    });
    p.useCases.forEach(function (u) {
      if (sync.use_cases.indexOf(u) !== -1) { score += 2; ex.push(u + " use-case"); }
    });
    p.moods.forEach(function (mood) {
      var idx = audio.moods.indexOf(mood);
      // first-listed mood is the track's primary descriptor — weight it slightly higher
      if (idx !== -1) { score += 2 + (idx === 0 ? 0.5 : 0); ex.push(mood); }
    });
    p.energyWords.forEach(function (w) {
      if (audio.energy_words.indexOf(w) !== -1) { score += 1.5; ex.push('"' + w + '" energy'); }
    });

    if (p.energyTarget !== null) {
      var diff = Math.abs(audio.energy - p.energyTarget);
      var eScore = Math.max(0, 3 - diff * 7.5);
      score += eScore;
      if (eScore > 0.5) ex.push("energy " + audio.energy.toFixed(2));
    }

    if (p.bpmMin !== null || p.bpmMax !== null) {
      var lo = p.bpmMin === null ? 0 : p.bpmMin, hi = p.bpmMax === null ? 999 : p.bpmMax;
      var bpm = audio.bpm.value;
      var label = (p.bpmMin !== null && p.bpmMax !== null)
        ? (p.bpmMin + "–" + p.bpmMax + " range")
        : (p.bpmMax !== null ? "under " + p.bpmMax : "over " + p.bpmMin);
      if (bpm >= lo && bpm <= hi) { score += 3; ex.push(bpm + " BPM (est.) in " + label); }
      else if (Math.abs(bpm - lo) <= 8 || Math.abs(bpm - hi) <= 8) { score += 1; ex.push(bpm + " BPM (est.) near " + label); }
      else { score -= 2; ex.push(bpm + " BPM (est.) outside " + label); }
    }

    p.instruments.forEach(function (ins) {
      if (audio.instrumentation.indexOf(ins) !== -1) { score += 1.5; ex.push(ins + " in mix"); }
    });

    if (p.vocal) {
      if (audio.vocal.type === p.vocal) { score += 2; ex.push(p.vocal === "male" ? "male vocal" : "instrumental"); }
      else { score -= 4; ex.push("not " + p.vocal); }
    }

    if (p.cleanReq === "clean") {
      if (audio.explicit === false) { score += 2; ex.push("clean per Spotify metadata"); }
      else if (audio.explicit === true) { score -= 6; ex.push("explicit per Spotify metadata — no clean version exists"); }
      else { score -= 4; ex.push("explicit status unknown — not confirmed clean"); }
    } else if (p.cleanReq === "explicit") {
      if (audio.explicit === true) { score += 2; ex.push("explicit per Spotify metadata"); }
      else if (audio.explicit === "unknown") { score -= 2; ex.push("explicit status unknown"); }
    }

    if (p.genreHit) ex.push("alt-rap catalog");

    return { score: score, explanations: ex };
  }

  function search(tracks, rawQuery, uiFilters) {
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
      p.bpmMin !== null || p.bpmMax !== null || p.vocal || p.cleanReq;

    var results = tracks.map(function (t) {
      var s = scoreTrack(t, p);
      if (!hasCriteria) s.explanations = ["browse mode"];
      return { track: t, score: s.score, explanations: s.explanations };
    });

    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.track.audio.energy !== a.track.audio.energy) return b.track.audio.energy - a.track.audio.energy;
      return a.track.title < b.track.title ? -1 : 1;
    });
    return { parsed: p, results: results };
  }

  return { parseQuery: parseQuery, scoreTrack: scoreTrack, search: search,
           MOODS: MOODS, ENERGY_WORDS: ENERGY_WORDS, SCENES: SCENES,
           USE_CASES: USE_CASES, INSTRUMENTS: INSTRUMENTS };
});
