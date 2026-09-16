/* CueFinder UI — search box, filters, cards, one-sheets, shareable hash URLs. */
(function () {
  "use strict";
  var catalog = window.CUEFINDER.catalog;
  var tracks = catalog.tracks;
  var ENG = window.CUEFINDER_ENGINE;

  var $ = function (id) { return document.getElementById(id); };
  var q = $("q"), cards = $("cards"), count = $("count"), parsedBox = $("parsed");

  var EXAMPLES = [
    "dark futuristic alt-rap, nighttime driving scene, 95–105 BPM, male vocal, cinematic",
    "fight scene high energy aggressive",
    "romantic fashion film smooth piano",
    "trailer epic cinematic orchestral",
    "chill dreamy montage",
    "club banger 140 bpm",
    "game menu futuristic synth",
    "clean",
    "instrumental",
    "melancholic piano"
  ];

  var state = {
    q: "", bpmMin: 60, bpmMax: 160, energy: "any",
    moods: [], vocal: "any", cleanReq: "any", scene: "any"
  };

  // ---- build filter UI ----
  var moodWrap = $("moodchips");
  ENG.MOOD_WORDS.forEach(function (m) {
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
  Object.keys(ENG.SCENES).forEach(function (s) {
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
    b.textContent = ex.length > 44 ? ex.slice(0, 44) + "…" : ex;
    b.title = ex;
    b.onclick = function () { q.value = ex; run(); };
    chipWrap.appendChild(b);
  });

  // ---- shareable hash ----
  function writeHash() {
    var parts = [];
    if (state.q) parts.push("q=" + encodeURIComponent(state.q));
    if (state.bpmMin > 60) parts.push("bpmMin=" + state.bpmMin);
    if (state.bpmMax < 160) parts.push("bpmMax=" + state.bpmMax);
    if (state.energy !== "any") parts.push("energy=" + state.energy);
    if (state.moods.length) parts.push("moods=" + state.moods.map(encodeURIComponent).join(","));
    if (state.vocal !== "any") parts.push("vocal=" + state.vocal);
    if (state.cleanReq !== "any") parts.push("lyrics=" + state.cleanReq);
    if (state.scene !== "any") parts.push("scene=" + state.scene);
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
    if (h.moods) state.moods = h.moods.split(",");
    if (h.vocal) state.vocal = h.vocal;
    if (h.lyrics) state.cleanReq = h.lyrics;
    if (h.scene) state.scene = h.scene;
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

  // ---- rendering ----
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function explicitBadge(t) {
    if (t.explicit === true) return '<span class="tags"><span>explicit (Spotify metadata)</span></span>';
    if (t.explicit === false) return '<span class="tags"><span>clean per Spotify metadata</span></span>';
    return '<span class="tags"><span>explicit status unknown</span></span>';
  }

  function cardHTML(r, i) {
    var t = r.track;
    var moodTags = t.moods.map(function (m) { return '<span class="mood">' + esc(m) + "</span>"; }).join("");
    var sceneTags = t.scenes.map(function (s) { return '<span class="scene">' + esc(s) + "</span>"; }).join("");
    var why = r.explanations.length
      ? '<div class="why"><b>Matched:</b> ' + esc(r.explanations.join(" · ")) + "</div>" : "";
    return '<article class="card' + (i === 0 && r.score > 0 ? " top" : "") + '">' +
      '<div class="score">MATCH ' + r.score.toFixed(1) + "</div>" +
      "<h3>" + esc(t.title) + "</h3>" + why +
      '<div class="tags">' + moodTags + sceneTags + "</div>" +
      '<div class="meta"><span>BPM <b>' + t.bpm + '</b> <span class="est">est.</span></span>' +
      '<span>Energy <span class="energybar"><i style="width:' + (t.energy * 10) + '%"></i></span> <b>' + t.energy + "/10</b> <span class='est'>editorial</span></span>" +
      "<span>" + (t.vocal === "male" ? "male vocal" : "instrumental") + "</span>" +
      '<span class="rights">sync: clearance via CWI</span></div>' +
      explicitBadge(t) +
      '<div class="actions"><a class="btn" href="' + t.spotify_url + '" target="_blank" rel="noopener">Open in Spotify</a>' +
      '<button class="btn ghost" data-sheet="' + t.id + '">Sync one-sheet</button></div>' +
      "</article>";
  }

  function parsedHTML(p) {
    var bits = [];
    if (p.scenes.length) bits.push("<b>scenes:</b> " + p.scenes.join(", "));
    if (p.moods.length) bits.push("<b>moods:</b> " + p.moods.join(", "));
    if (p.energyTarget !== null) bits.push("<b>energy ≈</b> " + p.energyTarget + "/10");
    if (p.bpmMin !== null || p.bpmMax !== null)
      bits.push("<b>BPM:</b> " + (p.bpmMin || "…") + "–" + (p.bpmMax || "…"));
    if (p.instruments.length) bits.push("<b>instruments:</b> " + p.instruments.join(", "));
    if (p.vocal) bits.push("<b>vocal:</b> " + p.vocal);
    if (p.cleanReq) bits.push("<b>lyrics:</b> " + p.cleanReq);
    if (!bits.length) return "";
    return "Understood as → " + bits.join(" · ");
  }

  function pipelineChecklist(t) {
    var steps = [
      ["Spotify", "Cataloged — <a href=\"" + t.spotify_url + "\">verified track link</a>. This is the listening reference."],
      ["YouTube", "Confirm an official audio/video upload exists for reference and Content ID posture."],
      ["DISCO", "Add to the CWI DISCO catalog with these same descriptors so brief/reference search can surface it."],
      ["SourceAudio", "Add to a pre-cleared library presence so SonicSearch and NL search can index it."]
    ];
    return '<ul class="pipe">' + steps.map(function (s) {
      return "<li><b>" + s[0] + "</b> — " + s[1] +
        '<span class="glabel">guidance, not placement status</span></li>';
    }).join("") + "</ul>";
  }

  function openSheet(id) {
    var t = tracks.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    var credits = Object.keys(t.credits).map(function (k) {
      var c = t.credits[k];
      return "<dt>" + esc(k) + '</dt><dd>' + esc(c.value) + ' <span class="est">(' + esc(c.source) + ")</span></dd>";
    }).join("");
    $("sheet-body").innerHTML =
      "<h2>" + esc(t.title) + "</h2>" +
      '<p style="color:var(--mut)">' + esc(t.artist) + " · " + esc(catalog.label) + "</p>" +
      "<dl class='kv'>" +
      "<dt>BPM</dt><dd>" + t.bpm + ' <span class="est">est.</span></dd>' +
      "<dt>Energy</dt><dd>" + t.energy + '/10 <span class="est">editorial</span></dd>' +
      "<dt>Moods</dt><dd>" + esc(t.moods.join(", ")) + ' <span class="est">editorial</span></dd>' +
      "<dt>Scenes</dt><dd>" + esc(t.scenes.join(", ")) + ' <span class="est">editorial</span></dd>' +
      "<dt>Instruments</dt><dd>" + esc(t.instruments.join(", ")) + ' <span class="est">editorial</span></dd>' +
      "<dt>Vocal</dt><dd>" + (t.vocal === "male" ? "male vocal" : "instrumental") + "</dd>" +
      "<dt>Lyrics</dt><dd>" + (t.explicit === true ? "explicit (Spotify metadata)" : t.explicit === false ? "clean per Spotify metadata" : "explicit status unknown") + "</dd>" +
      (credits || "") +
      (t.editorial_note ? "<dt>Note</dt><dd>" + esc(t.editorial_note) + "</dd>" : "") +
      "</dl>" +
      "<h3>Sync clearance</h3>" +
      '<p style="font-size:14px">No one-stop or pre-cleared rights claims are made on this catalog. ' +
      "Every placement is cleared directly — one email, one conversation.</p>" +
      '<div class="contactbox">Sync &amp; licensing: <a href="mailto:hp@cumulativeweb.com">hp@cumulativeweb.com</a></div>' +
      "<h3 style='margin-top:18px'>Discovery pipeline checklist</h3>" +
      '<p style="font-size:13px;color:var(--mut)">Where this track should be indexed so supervisor AI can find it. Guidance — not a status claim.</p>' +
      pipelineChecklist(t) +
      '<div class="actions"><a class="btn" href="' + t.spotify_url + '" target="_blank" rel="noopener">Open in Spotify</a></div>';
    $("sheet").hidden = false;
  }

  // ---- main run ----
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

    count.textContent = res.results.length + " of " + tracks.length + " tracks";
    cards.innerHTML = res.results.length
      ? res.results.map(cardHTML).join("")
      : '<div class="empty">No tracks match this combination. Loosen the BPM range or drop a filter — the catalog is 24 tracks deep.</div>';

    Array.prototype.forEach.call(cards.querySelectorAll("[data-sheet]"), function (b) {
      b.onclick = function () { openSheet(b.dataset.sheet); };
    });
    writeHash();
  }

  $("go").onclick = run;
  q.addEventListener("keydown", function (e) { if (e.key === "Enter") run(); });
  q.addEventListener("input", function () { /* search on Enter/Go to keep hash stable */ });
  ["bpmMin", "bpmMax", "energy", "vocal", "cleanreq"].forEach(function (id) {
    $(id).addEventListener("change", run);
  });
  $("clear").onclick = function () {
    state = { q: "", bpmMin: 60, bpmMax: 160, energy: "any", moods: [], vocal: "any", cleanReq: "any", scene: "any" };
    q.value = ""; syncFilterUI(); run();
  };
  $("copylink").onclick = function () {
    var done = function () { $("copylink").textContent = "Link copied ✓"; setTimeout(function () { $("copylink").textContent = "Copy shareable link"; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, done); else done();
  };
  $("sheet-close").onclick = function () { $("sheet").hidden = true; };
  $("sheet").addEventListener("click", function (e) { if (e.target === $("sheet")) $("sheet").hidden = true; });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") $("sheet").hidden = true; });

  readHash(); syncFilterUI(); run();
})();
