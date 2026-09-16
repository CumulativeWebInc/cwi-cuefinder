# CueFinder — Search like a supervisor thinks.

AI sync-discovery engine for the CWI catalog: natural-language search over the
24-track That Boy Hi Hat catalog, built for music supervisors, sync teams, and
the agents that find music for them.

**Live:** https://cumulativewebinc.github.io/cwi-cuefinder/
**Machine catalog:** https://cumulativewebinc.github.io/cwi-cuefinder/sync-catalog.json
**Agent note:** https://cumulativewebinc.github.io/cwi-cuefinder/discovery.txt

Brand: "2AM at the supervisor's desk" — signal amber `#FFB224` on near-black,
Space Grotesk + IBM Plex Mono, groove-crosshair mark. Spec: `BRAND.md` (approved
2026-09-16, Agent Deck gear line, Sync & Licensing).

## Query grammar
Mood words, energy words, BPM numbers/ranges ("95-105 BPM", "around 100bpm"),
instrumentation, vocal type ("male vocal", "no vocals"), explicit/clean ("clean",
"radio-safe"), scene phrases ("nighttime driving scene"), use-case words
("trailer", "game"). Every result shows a transparent mono match explanation.
Query state encodes in the URL hash for shareable links.

## Data honesty (hard gates, BRAND.md §6)
- `verified` — titles, Spotify links, explicit flags (Spotify metadata), credits, rights.
- `editorial` — moods, energy, instrumentation, scenes, use cases. Never audio analysis.
- `estimate` — every BPM labeled `est.` Never measured.
- Rights — no one-stop / pre-cleared claims. Clearance: hp@cumulativeweb.com.

## Files
- `index.html` / `styles.css` / `app.js` — the app
- `engine.js` — pure search engine, browser + Node
- `catalog.js` — generated catalog data (run `python3 gen_data.py`, do not hand-edit)
- `sync-catalog.json` — generated machine catalog (cwi.sync-catalog/1.0)
- `discovery.txt` — agent discovery note
- `brand/cuefinder-mark.png`, `brand/favicon.png` — groove-crosshair mark
- `tests/engine.test.js` — 23 checks incl. the ranking kill rule
