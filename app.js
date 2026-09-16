/* CueFinder UI — brand build. Terse voice, mono readouts, shareable hash URLs. */
(function () {
  "use strict";
  var catalog = window.CUEFINDER.catalog;
  var tracks = catalog.tracks;
  var ENG = window.CUEFINDER_ENGINE;

  var $ = function (id) { return document.getElementById(id); };
  var q = $("q"), cards = $("cards"), count = $("count"), parsedBox = $("parsed");

  var EXAMPLES = [
    "dark futuristic nighttime driving, 95-105 BPM, male vocal, cinematic",
    "fight scene explosive",
    "fashion film hazy",
    "game trailer cinematic",
    "simmering melancholic end credits",
    "club scene 140 bpm",
    "neon city futuristic",
    "no vocals",
    "clean",
    "heist sequence menacing"
  ];

  var state = {
    q: "", bpmMin: 60, bpmMax: 160, energy: "any",
    moods: [], vocal: "any", cleanReq: "any", scene: "any"
  };

  var moodWrap = $("moodchips");
  ENG.MOODS.forEach(function (m) {
    var b = document.createElement("button");
    b.textContent = m; b.dataset.mood = m;
    b.onclick = function () {
      b.classList.toggle("on");
      var i = state.moods.indexOf(m);
      if (i === -1) state.moods.push(m); else state.moods.splice(i, 1);
      run();
    };
    moodWrap.appendChild(b);
  });

  var sceneWrap = $("scenebtns");
  ENG.SCENES.forEach(function (s) {
    var b = document.createElement("button");
    b.textContent = s; b.dataset.scene = s;
    b.onclick = function () {
      var was = state.scene === s;
      state.scene = was ? "any" : s;
      Array.prototype.forEach.call(sceneWrap.children, function (c) { c.classList.remove("on"); });
      if (!was) b.classList.add("on");
      run();
    };
    sceneWrap.appendChild(b);
  });

  var chipWrap = $("example-chips");
  EXAMPLES.forEach(function (ex) {
    var b = document.createElement("button");
    b.textContent = ex.length > 46 ? ex.slice(0, 46) + "…" : ex;
    b.title = ex;
    b.onclick = function () { q.value = ex; run(); };
    chipWrap.appendChild(b);
  });

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

  function syncFilterUI() {
    $("bpmMin").value = state.bpmMin; $("bpmMax").value = state.bpmMax;
    $("bpmMinVal").textContent = state.bpmMin; $("bpmMaxVal").textContent = state.bpmMax;
    $("energy").value = state.energy; $("vocal").value = state.vocal; $("cleanreq").value = state.cleanReq;
    Array.prototype.forEach.call(moodWrap.children, function (c) {
      c.classList.toggle("on", state.moods.indexOf(c.dataset.mood) !== -1);
    });
    Array.prototype.forEach.call(sceneWrap.children, function (c) {
      c.classList.toggle("on", state.scene === c.dataset.scene);
    });
  }

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function lyricsLabel(t) {
    var e = t.audio.explicit;
    if (e === true) return "explicit · Spotify metadata";
    if (e === false) return "clean · Spotify metadata";
    return "explicit status unknown";
  }

  function cardHTML(r, i) {
    var t = r.track, a = t.audio, s = t.sync;
    var chips = r.explanations.map(function (e, j) {
      return '<span class="' + (j < 3 ? "k" : "") + '">' + esc(e) + "</span>";
    }).join("");
    var tags = a.moods.concat(s.scenes).map(function (x) {
      return "<span>" + esc(x) + "</span>";
    }).join("");
    return '<article class="card' + (i === 0 && r.score > 0 ? " top" : "") + '">' +
      '<div class="score">MATCH ' + r.score.toFixed(1) + "</div>" +
      '<h3><a href="' + t.spotify_url + '" target="_blank" rel="noopener">' + esc(t.title) + "</a></h3>" +
      '<div class="exchips">' + chips + "</div>" +
      '<div class="tags">' + tags + "</div>" +
      '<div class="meta"><span>BPM <b>' + a.bpm.value + '</b> <span class="tag">est.</span></span>' +
      '<span>NRG <span class="energybar"><i data-w="' + Math.round(a.energy * 100) + '"></i></span> <b>' + a.energy.toFixed(2) + '</b> <span class="tag">editorial</span></span>' +
      "<span>" + (a.vocal.type === "male" ? "male vocal" : a.vocal.type) + "</span>" +
      "<span>" + esc(lyricsLabel(t)) + "</span>" +
      '<span class="rights">sync: direct clearance</span></div>' +
      '<div class="actions"><a class="btn" href="' + t.spotify_url + '" target="_blank" rel="noopener">Spotify</a>' +
      '<button class="btn ghost" data-sheet="' + t.track_id + '">One-sheet</button></div>' +
      "</article>";
  }

  function parsedHTML(p) {
    var bits = [];
    if (p.scenes.length) bits.push("<b>scenes:</b> " + p.scenes.join(", "));
    if (p.useCases.length) bits.push("<b>use:</b> " + p.useCases.join(", "));
    if (p.moods.length) bits.push("<b>moods:</b> " + p.moods.join(", "));
    if (p.energyWords.length) bits.push("<b>energy:</b> " + p.energyWords.join(", "));
    else if (p.energyTarget !== null) bits.push("<b>energy≈</b> " + p.energyTarget.toFixed(2));
    if (p.bpmMin !== null || p.bpmMax !== null)
      bits.push("<b>bpm:</b> " + (p.bpmMin === null ? "…" : p.bpmMin) + "–" + (p.bpmMax === null ? "…" : p.bpmMax));
    if (p.instruments.length) bits.push("<b>inst:</b> " + p.instruments.join(", "));
    if (p.vocal) bits.push("<b>vocal:</b> " + p.vocal);
    if (p.cleanReq) bits.push("<b>lyrics:</b> " + p.cleanReq);
    if (!bits.length) return "";
    return "parsed as → " + bits.join(" · ");
  }

  function openSheet(id) {
    var t = tracks.filter(function (x) { return x.track_id === id; })[0];
    if (!t) return;
    var a = t.audio, s = t.sync;
    var credits = Object.keys(t.credits).filter(function (k) { return k !== "provenance" && k !== "origin"; }).map(function (k) {
      return "<dt>" + esc(k) + '</dt><dd><span class="mono">' + esc(t.credits[k]) + "</span></dd>";
    }).join("");
    var pipe = [["spotify", "Cataloged — verified track link. The listening reference."],
      ["youtube", "Confirm an official audio/video upload exists for reference."],
      ["disco", "Add to the CWI DISCO catalog with these descriptors for brief/reference search."],
      ["sourceaudio", "Add to a pre-cleared library presence for NL and SonicSearch indexing."]]
      .map(function (row) {
        return "<li><b>" + row[0] + "</b> — " + row[1] +
          '<span class="glabel">status: ' + t.pipeline[row[0]] + " · guidance, not placement status</span></li>";
      }).join("");
    $("sheet-body").innerHTML =
      "<h2>" + esc(t.title) + "</h2>" +
      '<p style="color:var(--mut);font-size:13.5px;margin:4px 0 0">' + esc(t.artist) + " · " + esc(catalog.label) + "</p>" +
      "<dl class='kv'>" +
      "<dt>bpm</dt><dd><span class='mono'>" + a.bpm.value + '</span> <span class="tag">est.</span></dd>' +
      "<dt>energy</dt><dd><span class='mono'>" + a.energy.toFixed(2) + '</span> <span class="tag">editorial</span></dd>' +
      "<dt>energy words</dt><dd><span class='mono'>" + esc(a.energy_words.join(", ")) + '</span> <span class="tag">editorial</span></dd>' +
      "<dt>moods</dt><dd><span class='mono'>" + esc(a.moods.join(", ")) + '</span> <span class="tag">editorial</span></dd>' +
      "<dt>scenes</dt><dd><span class='mono'>" + esc(s.scenes.join(", ")) + '</span> <span class="tag">editorial</span></dd>' +
      "<dt>use cases</dt><dd><span class='mono'>" + esc(s.use_cases.join(", ")) + '</span> <span class="tag">editorial</span></dd>' +
      "<dt>instruments</dt><dd><span class='mono'>" + esc(a.instrumentation.join(", ")) + '</span> <span class="tag">editorial</span></dd>' +
      "<dt>lyrical themes</dt><dd><span class='mono'>" + esc(s.lyrical_themes.join(", ")) + '</span> <span class="tag">editorial</span></dd>' +
      "<dt>reference</dt><dd><span class='mono'>" + esc(s.sounds_like_reference) + "</span></dd>" +
      "<dt>vocal</dt><dd><span class='mono'>" + esc(a.vocal.type) + (a.vocal.style !== "n/a" ? " · " + esc(a.vocal.style) : "") + "</span></dd>" +
      "<dt>lyrics</dt><dd><span class='mono'>" + esc(lyricsLabel(t)) + "</span></dd>" +
      "<dt>origin</dt><dd><span class='mono'>" + esc(t.credits.origin) + ' <span class="tag">verified</span></span></dd>' +
      credits +
      (t.editorial_note ? "<dt>note</dt><dd><span class='mono'>" + esc(t.editorial_note) + "</span></dd>" : "") +
      "</dl>" +
      "<h3>Sync clearance</h3>" +
      '<p style="font-size:13.5px;color:var(--mut)">No one-stop or pre-cleared rights claims are made on this catalog. Every placement clears directly.</p>' +
      '<div class="contactbox">sync / licensing — <a href="mailto:hp@cumulativeweb.com">hp@cumulativeweb.com</a></div>' +
      "<h3>Discovery pipeline</h3>" +
      "<ul class='pipe'>" + pipe + "</ul>" +
      '<div class="actions"><a class="btn" href="' + t.spotify_url + '" target="_blank" rel="noopener">Spotify</a></div>';
    $("sheet").hidden = false;
  }

  function run() {
    state.q = q.value.trim();
    state.bpmMin = +$("bpmMin").value; state.bpmMax = +$("bpmMax").value;
    if (state.bpmMin > state.bpmMax) { var tmp = state.bpmMin; state.bpmMin = state.bpmMax; state.bpmMax = tmp; }
    state.energy = $("energy").value; state.vocal = $("vocal").value; state.cleanReq = $("cleanreq").value;
    $("bpmMinVal").textContent = state.bpmMin; $("bpmMaxVal").textContent = state.bpmMax;

    var res = ENG.search(tracks, state.q, {
      bpmMin: state.bpmMin > 60 ? state.bpmMin : null,
      bpmMax: state.bpmMax < 160 ? state.bpmMax : null,
      energy: state.energy, moods: state.moods, vocal: state.vocal,
      cleanReq: state.cleanReq, scene: state.scene
    });

    var ph = parsedHTML(res.parsed);
    parsedBox.hidden = !ph; parsedBox.innerHTML = ph;

    count.textContent = res.results.length + " / " + tracks.length + " tracks";
    cards.innerHTML = res.results.length
      ? res.results.map(cardHTML).join("")
      : '<div class="empty">no matches. loosen the bpm range or drop a filter.</div>';

    Array.prototype.forEach.call(cards.querySelectorAll("[data-sheet]"), function (b) {
      b.onclick = function () { openSheet(b.dataset.sheet); };
    });
    // animate score bars (brand: minimal motion — bars only)
    requestAnimationFrame(function () {
      Array.prototype.forEach.call(cards.querySelectorAll(".energybar i"), function (el) {
        el.style.width = el.dataset.w + "%";
      });
    });
    writeHash();
  }

  $("go").onclick = run;
  q.addEventListener("keydown", function (e) { if (e.key === "Enter") run(); });
  ["bpmMin", "bpmMax", "energy", "vocal", "cleanreq"].forEach(function (id) {
    $(id).addEventListener("change", run);
  });
  $("clear").onclick = function () {
    state = { q: "", bpmMin: 60, bpmMax: 160, energy: "any", moods: [], vocal: "any", cleanReq: "any", scene: "any" };
    q.value = ""; syncFilterUI(); run();
  };
  $("copylink").onclick = function () {
    var done = function () { $("copylink").textContent = "Link copied"; setTimeout(function () { $("copylink").textContent = "Copy share link"; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, done); else done();
  };
  $("sheet-close").onclick = function () { $("sheet").hidden = true; };
  $("sheet").addEventListener("click", function (e) { if (e.target === $("sheet")) $("sheet").hidden = true; });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") $("sheet").hidden = true; });

  readHash(); syncFilterUI(); run();
})();
