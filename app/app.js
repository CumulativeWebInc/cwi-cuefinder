/* CueFinder UI — command-palette surface.
 * Design contract: DESIGN-UPGRADE.md. Competitive edges: COMPETITIVE.md.
 * Engine contract: engine.js (pure rank, index-narrowed candidates). */
(function () {
  "use strict";
  var catalog = window.CUEFINDER.catalog;
  var tracks = catalog.tracks;
  var ENG = window.CUEFINDER_ENGINE;
  var INDEX = ENG.buildIndex(tracks); // precomputed once — the 24 → 10,000 path

  var $ = function (id) { return document.getElementById(id); };
  var q = $("q"), rows = $("rows"), count = $("count"), timing = $("timing"),
      empty = $("empty"), refine = $("refine"), fchips = $("fchips");

  var EXAMPLES = [
    "dark futuristic nighttime driving",
    "fight scene explosive",
    "fashion film hazy"
  ];
  var REFINEMENT_WORDS = ["slower", "faster", "softer", "harder"];

  var state = {
    q: "", bpmMin: 60, bpmMax: 160, energy: "any",
    moods: [], vocal: "any", cleanReq: "any", scene: "any",
    pivot: null, // {trackId, title} when in "similar descriptors" mode
    active: 0
  };
  var lastResults = [];

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  /* ---- deterministic descriptor-waveform fingerprint ----
   * Generated from the track_id hash + energy value. A descriptor
   * visualization — never audio analysis. Labeled as such everywhere. */
  function waveSVG(trackId, energy, w, h) {
    w = w || 56; h = h || 40;
    var seed = 0;
    for (var i = 0; i < trackId.length; i++) seed = (seed * 31 + trackId.charCodeAt(i)) >>> 0;
    function rnd() { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; }
    var bars = 22, bw = w / bars, out = "";
    for (var b = 0; b < bars; b++) {
      var amp = 0.25 + 0.75 * rnd();
      amp = amp * (0.5 + energy * 0.9);
      var bh = Math.max(3, Math.min(h, amp * h));
      var x = (b * bw).toFixed(1), y = ((h - bh) / 2).toFixed(1);
      out += '<rect x="' + x + '" y="' + y + '" width="' + (bw - 1.6).toFixed(1) +
        '" height="' + bh.toFixed(1) + '" rx="1" fill="' +
        (b % 5 === 0 ? "#FFB224" : "#3DFF88") + '" opacity="' + (b % 5 === 0 ? 0.9 : 0.55) + '"/>';
    }
    return '<svg class="r-wave" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h +
      '" aria-hidden="true"><title>descriptor visualization — waveform-like fingerprint generated from descriptors, not audio analysis</title>' +
      out + "</svg>";
  }

  function lyricsLabel(t) {
    var e = t.audio.explicit;
    if (e === true) return "explicit · Spotify metadata";
    if (e === false) return "clean · Spotify metadata";
    return "explicit status unknown";
  }

  /* ---- conversion layer: real mailto mechanisms ----
   * The $49 evidence report is fulfilled by the CWI Sync department at
   * hp@cumulativeweb.com (the catalog's canonical clearance contact).
   * Track name is pre-filled via encoded mailto params — no checkout,
   * no JS required, works on every device. */
  function evidenceMailto(title) {
    var subj = "CueFinder \u2014 evidence report request ($49) \u2014 " + title;
    var body = "Track: " + title + "\nArtist: That Boy Hi Hat\n\n" +
      "Please send the verified placement & rights evidence report for this track ($49).\n\n" +
      "Name / production:\nUse case:";
    return "mailto:hp@cumulativeweb.com?subject=" + encodeURIComponent(subj) +
      "&body=" + encodeURIComponent(body);
  }

  /* ---- row rendering: dense ~64px, rights badge after title, mono explanation ---- */
  function explHTML(r) {
    if (r.browse) return '<span class="browse">browse mode — full catalog, no query</span>';
    var m = r.matched.map(esc).join(" + ");
    var miss = r.missed.length
      ? ' <s title="no match">' + r.missed.map(esc).join("</s> <s>") + "</s>"
      : "";
    return m + miss;
  }

  function rowHTML(r, i) {
    var t = r.track, a = t.audio;
    var meta = a.bpm.value + " BPM est. · " + (a.vocal.type === "male" ? "male vocal" : a.vocal.type) +
      " · nrg " + a.energy.toFixed(2) + " <span class='tag'>editorial</span>";
    return '<li class="row" role="option" id="row-' + i + '" aria-selected="' + (i === state.active) +
      '" data-id="' + t.track_id + '" aria-label="' + esc(t.title) + ", match score " + r.score.toFixed(1) + '">' +
      '<span class="r-idx">' + (i + 1) + "</span>" +
      waveSVG(t.track_id, a.energy) +
      '<div class="r-main"><div class="r-line1">' +
      '<span class="r-title">' + esc(t.title) + "</span>" +
      '<span class="r-rights" title="Direct clearance — hp@cumulativeweb.com">DIRECT CLEARANCE</span>' +
      '<span class="r-meta">' + meta + "</span>" +
      '</div><div class="r-expl">' + explHTML(r) + "</div></div>" +
      '<button class="r-sim" data-sim="' + t.track_id + '" aria-label="Find tracks with similar descriptors to ' + esc(t.title) + '">similar descriptors</button>' +
      "</li>";
  }

  function renderFacetChips() {
    var html = "";
    if (state.bpmMin > 60 || state.bpmMax < 160)
      html += '<button class="fchip" data-f="bpm" aria-label="Remove BPM facet">' + state.bpmMin + "–" + state.bpmMax + " bpm ✕</button>";
    if (state.cleanReq !== "any")
      html += '<button class="fchip" data-f="lyrics" aria-label="Remove lyrics facet">' + esc(state.cleanReq) + " ✕</button>";
    if (state.vocal !== "any")
      html += '<button class="fchip" data-f="vocal" aria-label="Remove vocal facet">' + esc(state.vocal) + " ✕</button>";
    if (state.energy !== "any")
      html += '<button class="fchip" data-f="energy" aria-label="Remove energy facet">' + esc(state.energy) + " energy ✕</button>";
    fchips.innerHTML = html;
    Array.prototype.forEach.call(fchips.querySelectorAll(".fchip"), function (b) {
      b.onclick = function () { clearFacet(b.dataset.f); };
    });
  }

  function clearFacet(f) {
    if (f === "bpm") { state.bpmMin = 60; state.bpmMax = 160; }
    if (f === "lyrics") state.cleanReq = "any";
    if (f === "vocal") state.vocal = "any";
    if (f === "energy") state.energy = "any";
    syncAdvUI(); run(true);
  }

  function renderRefinements(parsed) {
    var chips = [];
    if (state.pivot) {
      chips.push('<button class="rchip" data-r="pivot">similar: ' + esc(state.pivot.title) + "</button>");
    }
    REFINEMENT_WORDS.forEach(function (w) {
      if ((" " + state.q.toLowerCase() + " ").indexOf(" " + w + " ") !== -1)
        chips.push('<button class="rchip" data-r="' + w + '">' + w + "</button>");
    });
    refine.hidden = !chips.length;
    refine.innerHTML = chips.join("");
    Array.prototype.forEach.call(refine.querySelectorAll(".rchip"), function (b) {
      b.onclick = function () { removeRefinement(b.dataset.r); };
    });
  }

  function removeRefinement(w) {
    if (w === "pivot") { state.pivot = null; run(true); return; }
    var re = new RegExp("(^|\\s)" + w + "(\\s|$)", "i");
    state.q = state.q.replace(re, " ").replace(/\s+/g, " ").trim();
    q.value = state.q;
    run(true);
  }

  function run(immediate) {
    state.q = q.value.trim();
    var filters = {
      bpmMin: state.bpmMin > 60 ? state.bpmMin : null,
      bpmMax: state.bpmMax < 160 ? state.bpmMax : null,
      energy: state.energy, moods: state.moods, vocal: state.vocal,
      cleanReq: state.cleanReq, scene: state.scene
    };
    var res;
    if (state.pivot) {
      var t0 = performance.now();
      var sim = ENG.similarTracks(state.pivot.trackId, tracks, 12);
      var t1 = performance.now();
      res = {
        results: sim.map(function (s) {
          return { track: s.track, score: s.score, matched: s.shared, missed: [], pivot: true };
        }),
        ms: t1 - t0, candidateCount: tracks.length, totalTracks: tracks.length,
        parsed: null
      };
    } else {
      res = ENG.search(tracks, state.q, filters, INDEX);
    }
    lastResults = res.results;
    state.active = 0;

    var hasQ = state.q.length > 0 || state.pivot;
    empty.hidden = hasQ;
    rows.hidden = !hasQ;
    q.setAttribute("aria-expanded", hasQ ? "true" : "false");

    if (hasQ) {
      rows.innerHTML = res.results.length
        ? res.results.map(rowHTML).join("")
        : '<li class="row no-match" role="option" aria-selected="false"><span class="r-idx">–</span>' +
          '<div class="r-main"><div class="r-expl"><span class="browse">no licensable matches — loosen a term or drop a facet.</span></div></div></li>';
      Array.prototype.forEach.call(rows.querySelectorAll(".row"), function (el) {
        el.addEventListener("click", function (e) {
          if (e.target.dataset.sim) { startPivot(e.target.dataset.sim); return; }
          openSheet(el.dataset.id);
        });
      });
      Array.prototype.forEach.call(rows.querySelectorAll("[data-sim]"), function (b) {
        b.addEventListener("click", function (e) { e.stopPropagation(); startPivot(b.dataset.sim); });
      });
      paintActive();
    }

    // competitive edge 6: result counts phrased as licensable matches
    var n = res.results.length;
    count.innerHTML = hasQ
      ? '<span class="n">' + n + "</span> licensable match" + (n === 1 ? "" : "es") +
        (state.pivot ? " · similar descriptors to " + esc(state.pivot.title) : "")
      : '<span class="n">24</span> licensable matches';
    // competitive edge 1: live timing readout
    var ms = res.ms;
    timing.textContent = "ranked " + res.candidateCount + " of " + res.totalTracks +
      " tracks in " + (ms < 10 ? ms.toFixed(1) : Math.round(ms)) + "ms";
    if (window.console) console.log("[cuefinder] ranked " + res.candidateCount + "/" + res.totalTracks +
      " tracks in " + ms.toFixed(2) + "ms");

    renderFacetChips();
    renderRefinements(res.parsed);
    writeHash();
  }

  var debounceTimer = null;
  function schedule() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () { run(); }, 32); // 32ms debounce per spec
  }

  function paintActive() {
    Array.prototype.forEach.call(rows.querySelectorAll(".row"), function (el, i) {
      el.setAttribute("aria-selected", i === state.active ? "true" : "false");
    });
    q.setAttribute("aria-activedescendant", lastResults.length ? "row-" + state.active : "");
    var el = $("row-" + state.active);
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  function moveActive(d) {
    if (!lastResults.length) return;
    state.active = (state.active + d + lastResults.length) % lastResults.length;
    paintActive();
  }

  function startPivot(trackId) {
    var t = tracks.filter(function (x) { return x.track_id === trackId; })[0];
    if (!t) return;
    state.pivot = { trackId: trackId, title: t.title };
    commitRecent("similar: " + t.title);
    run(true);
  }

  /* ---- one-sheet ---- */
  function openSheet(id) {
    var t = tracks.filter(function (x) { return x.track_id === id; })[0];
    if (!t) return;
    commitRecent(state.q || t.title);
    var a = t.audio, s = t.sync;
    var credits = Object.keys(t.credits).filter(function (k) { return k !== "provenance" && k !== "origin"; }).map(function (k) {
      return "<dt>" + esc(k) + "</dt><dd>" + esc(t.credits[k]) + "</dd>";
    }).join("");
    $("sheet-body").innerHTML =
      "<h2 id='sheet-title'>" + esc(t.title) +
      '<span class="r-rights" title="Direct clearance — hp@cumulativeweb.com">DIRECT CLEARANCE</span></h2>' +
      '<p class="prov"><b class="v">verified</b> identity, credits, Spotify link · ' +
      '<b class="e">editorial</b> descriptors — not audio analysis · ' +
      'BPM <b class="est">estimate</b>, never measured</p>' +
      waveSVG(t.track_id, a.energy, 220, 64) +
      '<div class="wave-cap">descriptor visualization — waveform-like fingerprint generated from descriptors, not audio analysis</div>' +
      "<dl class='sheet-grid'>" +
      "<dt>BPM</dt><dd>" + a.bpm.value + ' <span class="tag">est.</span></dd>' +
      "<dt>ENERGY</dt><dd>" + a.energy.toFixed(2) + ' <span class="tag">editorial</span></dd>' +
      "<dt>MOODS</dt><dd>" + esc(a.moods.join(", ")) + "</dd>" +
      "<dt>ENERGY WORDS</dt><dd>" + esc(a.energy_words.join(", ")) + "</dd>" +
      "<dt>SCENES</dt><dd>" + esc(s.scenes.join(", ")) + "</dd>" +
      "<dt>USE CASES</dt><dd>" + esc(s.use_cases.join(", ")) + "</dd>" +
      "<dt>INSTRUMENTS</dt><dd>" + esc(a.instrumentation.join(", ")) + "</dd>" +
      "<dt>THEMES</dt><dd>" + esc(s.lyrical_themes.join(", ")) + "</dd>" +
      "<dt>REFERENCE</dt><dd>" + esc(s.sounds_like_reference) + "</dd>" +
      "<dt>VOCAL</dt><dd>" + esc(a.vocal.type) + (a.vocal.style !== "n/a" ? " · " + esc(a.vocal.style) : "") + "</dd>" +
      "<dt>LYRICS</dt><dd>" + esc(lyricsLabel(t)) + "</dd>" +
      "<dt>ORIGIN</dt><dd>" + esc(t.credits.origin) + ' <span class="tag">verified</span></dd>' +
      credits +
      (t.editorial_note ? "<dt>NOTE</dt><dd>" + esc(t.editorial_note) + "</dd>" : "") +
      "</dl>" +
      '<p class="sheet-note">No one-stop or pre-cleared rights claims are made on this catalog. ' +
      'Every placement clears directly — <a href="mailto:hp@cumulativeweb.com">hp@cumulativeweb.com</a>.</p>' +
      '<div class="sheet-actions">' +
      '<a class="gobtn" href="' + t.spotify_url + '" target="_blank" rel="noopener">Spotify</a>' +
      '<a class="ghostbtn" href="' + evidenceMailto(t.title) + '" title="Opens an email to hp@cumulativeweb.com with this track pre-filled">Get this track\u2019s evidence report ($49)</a>' +
      '<button class="ghostbtn" id="sheet-sim">Similar descriptors</button>' +
      "</div>";
    $("sheet").hidden = false;
    $("sheet-sim").onclick = function () { $("sheet").hidden = true; startPivot(id); };
    $("sheet-close").focus();
  }

  /* ---- brief mode ---- */
  function openBrief() { $("brief").hidden = false; $("brief-text").focus(); }
  function closeBrief() { $("brief").hidden = true; }
  function runBrief() {
    var text = $("brief-text").value;
    var p = ENG.parseQuery(text);
    var bits = [];
    ["moods", "scenes", "useCases", "instruments", "energyWords"].forEach(function (k) {
      p[k].forEach(function (v) { bits.push('<span class="b-mood">' + esc(v) + "</span>"); });
    });
    if (p.bpmMin !== null || p.bpmMax !== null)
      bits.push('<span class="b-mood">' + (p.bpmMin === null ? "…" : p.bpmMin) + "–" + (p.bpmMax === null ? "…" : p.bpmMax) + " bpm</span>");
    if (p.vocal) bits.push('<span class="b-mood">' + esc(p.vocal) + "</span>");
    if (p.cleanReq) bits.push('<span class="b-mood">' + esc(p.cleanReq) + "</span>");
    if (p.energyTarget !== null) bits.push('<span class="b-mood">energy≈' + p.energyTarget.toFixed(2) + "</span>");
    var out = $("brief-out");
    out.hidden = false;
    out.innerHTML = bits.length
      ? "extracted → " + bits.join(" · ") + '<div class="brief-actions"><button class="gobtn" id="brief-go">Run as query</button></div>'
      : '<span class="b-miss">no descriptors detected — try mood, scene, BPM, or instrumentation words.</span>';
    var go = $("brief-go");
    if (go) go.onclick = function () {
      q.value = text.replace(/\s+/g, " ").trim();
      closeBrief();
      run(true);
      q.focus();
    };
  }

  /* ---- recents ---- */
  function getRecents() {
    try { return JSON.parse(localStorage.getItem("cuefinder.recents") || "[]"); } catch (e) { return []; }
  }
  function commitRecent(query) {
    query = (query || "").trim();
    if (query.length < 2) return;
    try {
      var r = getRecents().filter(function (x) { return x !== query; });
      r.unshift(query);
      localStorage.setItem("cuefinder.recents", JSON.stringify(r.slice(0, 6)));
      renderRecents();
    } catch (e) {}
  }
  function renderRecents() {
    var r = getRecents();
    var box = $("recents");
    if (!r.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<span class="recents-label">RECENT</span>' + r.map(function (x) {
      return '<button class="recchip" title="' + esc(x) + '">' + esc(x.length > 40 ? x.slice(0, 40) + "…" : x) + "</button>";
    }).join("");
    Array.prototype.forEach.call(box.querySelectorAll(".recchip"), function (b, i) {
      b.onclick = function () { q.value = r[i]; run(true); q.focus(); };
    });
  }

  /* ---- examples / advanced panel ---- */
  var exBox = $("examples");
  EXAMPLES.forEach(function (ex) {
    var b = document.createElement("button");
    b.className = "exchip"; b.textContent = ex; b.title = ex;
    b.onclick = function () { q.value = ex; run(true); q.focus(); };
    exBox.appendChild(b);
  });

  var moodWrap = $("moodchips");
  ENG.MOODS.forEach(function (m) {
    var b = document.createElement("button");
    b.className = "mchip"; b.textContent = m; b.dataset.mood = m;
    b.setAttribute("aria-pressed", "false");
    b.onclick = function () {
      b.classList.toggle("on");
      b.setAttribute("aria-pressed", b.classList.contains("on") ? "true" : "false");
      var i = state.moods.indexOf(m);
      if (i === -1) state.moods.push(m); else state.moods.splice(i, 1);
      run(true);
    };
    moodWrap.appendChild(b);
  });

  var sceneWrap = $("scenebtns");
  ENG.SCENES.forEach(function (s) {
    var b = document.createElement("button");
    b.className = "sbtn"; b.textContent = s; b.dataset.scene = s;
    b.setAttribute("aria-pressed", "false");
    b.onclick = function () {
      var was = state.scene === s;
      state.scene = was ? "any" : s;
      Array.prototype.forEach.call(sceneWrap.children, function (c) {
        c.classList.remove("on"); c.setAttribute("aria-pressed", "false");
      });
      if (!was) { b.classList.add("on"); b.setAttribute("aria-pressed", "true"); }
      run(true);
    };
    sceneWrap.appendChild(b);
  });

  function syncAdvUI() {
    $("bpmMin").value = state.bpmMin; $("bpmMax").value = state.bpmMax;
    $("bpmMinVal").textContent = state.bpmMin; $("bpmMaxVal").textContent = state.bpmMax;
    Array.prototype.forEach.call(moodWrap.children, function (c) {
      var on = state.moods.indexOf(c.dataset.mood) !== -1;
      c.classList.toggle("on", on); c.setAttribute("aria-pressed", on ? "true" : "false");
    });
    Array.prototype.forEach.call(sceneWrap.children, function (c) {
      var on = state.scene === c.dataset.scene;
      c.classList.toggle("on", on); c.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  $("advtoggle").onclick = function () {
    var adv = $("adv");
    adv.hidden = !adv.hidden;
    this.setAttribute("aria-expanded", adv.hidden ? "false" : "true");
    this.textContent = adv.hidden ? "advanced" : "hide advanced";
  };
  ["bpmMin", "bpmMax"].forEach(function (id) {
    $(id).addEventListener("change", function () {
      state.bpmMin = +$("bpmMin").value; state.bpmMax = +$("bpmMax").value;
      if (state.bpmMin > state.bpmMax) { var t = state.bpmMin; state.bpmMin = state.bpmMax; state.bpmMax = t; }
      syncAdvUI(); run(true);
    });
  });

  /* ---- hash: shareable query URLs (deterministic ranking on reload) ---- */
  function writeHash() {
    var parts = [];
    if (state.q) parts.push("q=" + encodeURIComponent(state.q));
    if (state.bpmMin > 60) parts.push("bpmMin=" + state.bpmMin);
    if (state.bpmMax < 160) parts.push("bpmMax=" + state.bpmMax);
    if (state.energy !== "any") parts.push("energy=" + state.energy);
    if (state.moods.length) parts.push("moods=" + state.moods.map(encodeURIComponent).join(","));
    if (state.vocal !== "any") parts.push("vocal=" + state.vocal);
    if (state.cleanReq !== "any") parts.push("lyrics=" + state.cleanReq);
    if (state.scene !== "any") parts.push("scene=" + encodeURIComponent(state.scene));
    history.replaceState(null, "", parts.length ? "#" + parts.join("&") : location.pathname);
  }
  function readHash() {
    if (!location.hash) return;
    var h = {};
    location.hash.slice(1).split("&").forEach(function (kv) {
      var i = kv.indexOf("=");
      if (i > -1) h[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
    if (h.q) { state.q = h.q; q.value = h.q; }
    if (h.bpmMin) state.bpmMin = +h.bpmMin;
    if (h.bpmMax) state.bpmMax = +h.bpmMax;
    if (h.energy) state.energy = h.energy;
    if (h.moods) state.moods = h.moods.split(",").filter(function (m) { return ENG.MOODS.indexOf(m) !== -1; });
    if (h.vocal) state.vocal = h.vocal;
    if (h.lyrics) state.cleanReq = h.lyrics;
    if (h.scene && ENG.SCENES.indexOf(h.scene) !== -1) state.scene = h.scene;
  }

  /* ---- events ---- */
  q.addEventListener("input", schedule);
  q.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); moveActive(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveActive(-1); }
    else if (e.key === "Enter") {
      commitRecent(state.q || q.value);
      if (lastResults.length) openSheet(lastResults[state.active].track.track_id);
    }
    else if (e.key === "Escape") { q.value = ""; state.pivot = null; run(true); }
    else if (e.key === "Backspace" && q.value === "") {
      // backspace on empty input removes the last facet chip
      if (state.bpmMin > 60 || state.bpmMax < 160) clearFacet("bpm");
      else if (state.cleanReq !== "any") clearFacet("lyrics");
      else if (state.vocal !== "any") clearFacet("vocal");
      else if (state.energy !== "any") clearFacet("energy");
    }
    else if (e.key >= "1" && e.key <= "9") {
      var i = +e.key - 1;
      if (i < lastResults.length) { state.active = i; paintActive(); }
    }
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "/" && document.activeElement !== q && document.activeElement.tagName !== "TEXTAREA") ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
      e.preventDefault(); q.focus();
    }
    if (e.key === "Escape") {
      if (!$("sheet").hidden) $("sheet").hidden = true;
      if (!$("brief").hidden) closeBrief();
    }
  });

  $("copylink").onclick = function () {
    var btn = $("copylink");
    var done = function () { btn.textContent = "link copied"; setTimeout(function () { btn.textContent = "copy search link"; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.href).then(done, done);
    else done();
  };
  $("briefbtn").onclick = openBrief;
  $("brief-close").onclick = closeBrief;
  $("brief").addEventListener("click", function (e) { if (e.target === $("brief")) closeBrief(); });
  $("brief-run").onclick = runBrief;
  $("sheet-close").onclick = function () { $("sheet").hidden = true; q.focus(); };
  $("sheet").addEventListener("click", function (e) { if (e.target === $("sheet")) $("sheet").hidden = true; });

  readHash(); syncAdvUI(); renderRecents(); run(true);
  q.focus(); // autofocus: the query bar IS the app
})();
