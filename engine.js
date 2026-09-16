/* CueFinder search engine — pure logic, no DOM.
 * Works in the browser (window.CUEFINDER_ENGINE) and in Node (module.exports).
 * Genuinely parses natural-language supervisor queries: moods, energy, BPM/ranges,
 * instrumentation, vocal type, clean/explicit, and scene/use-case phrases.
 * Scoring is weighted and every result carries a transparent match explanation.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.CUEFINDER_ENGINE = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MOOD_WORDS = [
    "dark", "futuristic", "cinematic", "aggressive", "smooth", "romantic",
    "gritty", "euphoric", "melancholic", "menacing", "triumphant", "dreamy",
    "nostalgic", "rebellious", "luxurious", "haunting", "confident",
    "introspective", "anthemic", "seductive"
  ];

  var MOOD_SYNONYMS = {
    "future": "futuristic", "sci-fi": "futuristic", "scifi": "futuristic", "spacey": "futuristic",
    "moody": "dark", "brooding": "dark", "ominous": "menacing", "threatening": "menacing",
    "epic": "cinematic", "film": "cinematic", "orchestral": "cinematic",
    "hard": "aggressive", "hype": "aggressive", "fierce": "aggressive",
    "chill": "smooth", "laid-back": "smooth", "laidback": "smooth", "mellow": "smooth",
    "sexy": "seductive", "sensual": "seductive",
    "sad": "melancholic", "emotional": "melancholic", "somber": "melancholic",
    "happy": "euphoric", "uplifting": "euphoric", "joyful": "euphoric",
    "bold": "confident", "cocky": "confident", "swagger": "confident",
    "triumphal": "triumphant", "victorious": "triumphant",
    "reflective": "introspective", "thoughtful": "introspective",
    "anthem": "anthemic", "stadium": "anthemic",
    "fancy": "luxurious", "expensive": "luxurious", "rich": "luxurious", "opulent": "luxurious",
    "spooky": "haunting", "eerie": "haunting", "ghostly": "haunting",
    "wild": "rebellious", "punk": "rebellious", "outlaw": "rebellious",
    "rough": "gritty", "raw": "gritty", "street": "gritty",
    "romantics": "romantic", "lovey": "romantic"
  };

  // scene -> trigger phrases (longest first matters)
  var SCENES = {
    "driving": ["nighttime driving", "night driving", "driving scene", "driving", "road trip", "car"],
    "chase": ["car chase", "chase scene", "chase", "pursuit"],
    "fight": ["fight scene", "fight", "combat", "battle", "brawl"],
    "fashion": ["fashion film", "fashion", "runway", "couture"],
    "trailer": ["movie trailer", "trailer"],
    "game": ["game menu", "video game", "gaming", "game"],
    "club": ["nightclub", "dancefloor", "dance floor", "club"],
    "party": ["party", "celebration"],
    "workout": ["workout", "gym", "training", "running"],
    "sports": ["sports", "highlight reel", "stadium"],
    "romance": ["love scene", "romantic scene", "date night", "romance"],
    "montage": ["training montage", "montage"],
    "commercial": ["commercial", "advertisement", "brand film", "ad"],
    "titles": ["title sequence", "opening credits", "opening titles", "opening"],
    "heist": ["heist", "caper"],
    "drama": ["drama scene", "drama"]
  };

  var INSTRUMENTS = [
    "808", "trap hats", "hi-hats", "synth", "piano", "guitar",
    "strings", "drums", "bass", "choir", "pads", "brass"
  ];
  var INSTRUMENT_SYNONYMS = {
    "hihats": "trap hats", "hi-hat": "trap hats", "hats": "trap hats",
    "keys": "piano", "guitars": "guitar", "orchestra": "strings",
    "orchestral": "strings", "synthesizer": "synth", "synths": "synth",
    "sub bass": "bass", "sub-bass": "bass", "808s": "808"
  };

  var ENERGY_WORDS = {
    "high-energy": 9, "high energy": 9, "energetic": 8, "intense": 9,
    "hype": 9, "aggressive": 8, "hard-hitting": 9,
    "mid-energy": 5, "mid energy": 5, "mid-tempo": 5,
    "low-energy": 3, "low energy": 3, "chill": 3, "mellow": 3,
    "laid-back": 3, "laidback": 3, "calm": 2, "soft": 3, "gentle": 2
  };

  function norm(q) {
    return (" " + (q || "").toLowerCase()
      .replace(/[\u2013\u2014]/g, "-")          // en/em dash -> hyphen
      .replace(/[.,!?;:()"\u201c\u201d\u2018\u2019']/g, " ")
      .replace(/\s+/g, " ") + " ");
  }

  function takePhrase(text, phrase) {
    var needle = " " + phrase + " ";
    if (text.indexOf(needle) !== -1) {
      return text.split(needle).join(" ");
    }
    return null;
  }

  function parseQuery(raw) {
    var text = norm(raw);
    var p = {
      raw: raw || "",
      moods: [], scenes: [], instruments: [],
      energyTarget: null, bpmMin: null, bpmMax: null,
      vocal: null, cleanReq: null, genreHit: false
    };

    // scenes (longest phrases first)
    Object.keys(SCENES).forEach(function (scene) {
      var phrases = SCENES[scene].slice().sort(function (a, b) { return b.length - a.length; });
      for (var i = 0; i < phrases.length; i++) {
        var rest = takePhrase(text, phrases[i]);
        if (rest !== null) { text = rest; p.scenes.push(scene); break; }
      }
    });

    // energy words (longest first)
    Object.keys(ENERGY_WORDS).sort(function (a, b) { return b.length - a.length; }).forEach(function (w) {
      var rest = takePhrase(text, w);
      if (rest !== null) { text = rest; p.energyTarget = ENERGY_WORDS[w]; }
    });

    // BPM: ranges, singles, under/over, tempo words
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
      if (takePhrase(text, "slow tempo")) { text = takePhrase(text, "slow tempo") || text; p.bpmMax = 95; }
      else if (takePhrase(text, "fast tempo")) { text = takePhrase(text, "fast tempo") || text; p.bpmMin = 130; }
      else if (takePhrase(text, "mid-tempo")) { text = takePhrase(text, "mid-tempo") || text; p.bpmMin = 90; p.bpmMax = 115; }
    }

    // instruments (longest first)
    INSTRUMENTS.slice().sort(function (a, b) { return b.length - a.length; }).forEach(function (ins) {
      var rest = takePhrase(text, ins);
      if (rest !== null) { text = rest; p.instruments.push(ins); }
    });
    Object.keys(INSTRUMENT_SYNONYMS).forEach(function (syn) {
      var rest = takePhrase(text, syn);
      if (rest !== null) { text = rest; p.instruments.push(INSTRUMENT_SYNONYMS[syn]); }
    });

    // vocal
    [["female vocal", "female"], ["male vocal", "male"], ["instrumental", "instrumental"]].forEach(function (pair) {
      var rest = takePhrase(text, pair[0]);
      if (rest !== null) { text = rest; p.vocal = pair[1]; }
    });
    if (!p.vocal) {
      var rest2 = takePhrase(text, "no vocal"); if (rest2 !== null) { text = rest2; p.vocal = "instrumental"; }
    }

    // clean / explicit
    if (takePhrase(text, "clean") || takePhrase(text, "fcc safe") || takePhrase(text, "radio edit") || takePhrase(text, "radio friendly")) {
      p.cleanReq = "clean";
    } else if (takePhrase(text, "explicit")) {
      p.cleanReq = "explicit";
    }

    // genre (matches whole catalog — informational only)
    if (takePhrase(text, "alt-rap") || takePhrase(text, "alt rap") || takePhrase(text, "alternative rap") ||
        takePhrase(text, "post-trap") || takePhrase(text, "post trap") || takePhrase(text, "post-trap futurism") ||
        takePhrase(text, "hip hop") || takePhrase(text, "hip-hop") || takePhrase(text, "rap")) {
      p.genreHit = true;
    }

    // moods: synonyms first, then direct words
    Object.keys(MOOD_SYNONYMS).forEach(function (syn) {
      var rest = takePhrase(text, syn);
      if (rest !== null) { text = rest; if (p.moods.indexOf(MOOD_SYNONYMS[syn]) === -1) p.moods.push(MOOD_SYNONYMS[syn]); }
    });
    MOOD_WORDS.forEach(function (mood) {
      var rest = takePhrase(text, mood);
      if (rest !== null) { text = rest; if (p.moods.indexOf(mood) === -1) p.moods.push(mood); }
    });

    // dedupe
    ["moods", "scenes", "instruments"].forEach(function (k) {
      p[k] = p[k].filter(function (v, i) { return p[k].indexOf(v) === i; });
    });
    return p;
  }

  function scoreTrack(t, p) {
    var score = 0, ex = [];

    // scenes — strongest supervisor signal
    p.scenes.forEach(function (s) {
      if (t.scenes.indexOf(s) !== -1) { score += 4; ex.push(s + "-scene tag"); }
    });

    // moods
    p.moods.forEach(function (mood) {
      if (t.moods.indexOf(mood) !== -1) { score += 2; ex.push(mood + " mood"); }
    });

    // energy proximity
    if (p.energyTarget !== null) {
      var diff = Math.abs(t.energy - p.energyTarget);
      var eScore = Math.max(0, 3 - diff * 0.75);
      score += eScore;
      if (eScore > 0.5) ex.push("energy " + t.energy + "/10");
    }

    // BPM
    if (p.bpmMin !== null || p.bpmMax !== null) {
      var lo = p.bpmMin === null ? 0 : p.bpmMin, hi = p.bpmMax === null ? 999 : p.bpmMax;
      var label = (p.bpmMin !== null && p.bpmMax !== null)
        ? (p.bpmMin + "\u2013" + p.bpmMax + " range")
        : (p.bpmMax !== null ? "under " + p.bpmMax : "over " + p.bpmMin);
      if (t.bpm >= lo && t.bpm <= hi) { score += 3; ex.push(t.bpm + " BPM (est.) in " + label); }
      else if (Math.abs(t.bpm - lo) <= 8 || Math.abs(t.bpm - hi) <= 8) { score += 1; ex.push(t.bpm + " BPM (est.) near " + label); }
      else { score -= 2; ex.push(t.bpm + " BPM (est.) outside " + label); }
    }

    // instruments
    p.instruments.forEach(function (ins) {
      var hit = t.instruments.some(function (ti) { return ti.indexOf(ins) !== -1 || ins.indexOf(ti) !== -1; });
      if (hit) { score += 1.5; ex.push(ins + " in mix"); }
    });

    // vocal — hard-ish match
    if (p.vocal) {
      if (t.vocal === p.vocal) { score += 2; ex.push(p.vocal === "male" ? "male vocal" : "instrumental"); }
      else { score -= 4; ex.push("not " + p.vocal); }
    }

    // clean / explicit — penalize, never silently mislabel
    if (p.cleanReq === "clean") {
      if (t.explicit === false) { score += 2; ex.push("clean per Spotify metadata"); }
      else if (t.explicit === true) { score -= 6; ex.push("\u26a0 explicit per Spotify metadata — no clean version exists"); }
      else { score -= 4; ex.push("\u26a0 explicit status unknown — not confirmed clean"); }
    } else if (p.cleanReq === "explicit") {
      if (t.explicit === true) { score += 2; ex.push("explicit per Spotify metadata"); }
      else if (t.explicit === "unknown") { score -= 2; ex.push("explicit status unknown"); }
    }

    if (p.genreHit) ex.push("alt-rap catalog match");

    return { score: score, explanations: ex };
  }

  function search(tracks, rawQuery, uiFilters) {
    var p = parseQuery(rawQuery);
    var f = uiFilters || {};
    // UI filters refine/override the parsed query
    if (f.bpmMin != null && f.bpmMin !== "") p.bpmMin = +f.bpmMin;
    if (f.bpmMax != null && f.bpmMax !== "") p.bpmMax = +f.bpmMax;
    if (f.energy && f.energy !== "any") {
      p.energyTarget = f.energy === "low" ? 3 : f.energy === "mid" ? 5 : 9;
    }
    if (f.vocal && f.vocal !== "any") p.vocal = f.vocal;
    if (f.cleanReq && f.cleanReq !== "any") p.cleanReq = f.cleanReq;
    if (f.moods && f.moods.length) {
      f.moods.forEach(function (m) { if (p.moods.indexOf(m) === -1) p.moods.push(m); });
    }
    if (f.scene && f.scene !== "any") {
      if (p.scenes.indexOf(f.scene) === -1) p.scenes.push(f.scene);
    }

    var hasCriteria = p.moods.length || p.scenes.length || p.instruments.length ||
      p.energyTarget !== null || p.bpmMin !== null || p.bpmMax !== null ||
      p.vocal || p.cleanReq;

    var results = tracks.map(function (t) {
      var s = scoreTrack(t, p);
      if (!hasCriteria) s.explanations = ["browse mode — no query terms matched"];
      return { track: t, score: s.score, explanations: s.explanations };
    });

    results.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.track.energy !== a.track.energy) return b.track.energy - a.track.energy;
      return a.track.title < b.track.title ? -1 : 1;
    });
    return { parsed: p, results: results };
  }

  return { parseQuery: parseQuery, scoreTrack: scoreTrack, search: search,
           MOOD_WORDS: MOOD_WORDS, SCENES: SCENES };
});
