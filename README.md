# CueFinder — Search like a supervisor thinks.

AI sync-discovery engine for the CWI catalog: natural-language search over the
24-track That Boy Hi Hat catalog, built for music supervisors, sync teams, and
the agents that find music for them.

**Live:** https://cumulativewebinc.github.io/cwi-cuefinder/
**Machine catalog:** https://cumulativewebinc.github.io/cwi-cuefinder/sync-catalog.json
**Versioned:** https://cumulativewebinc.github.io/cwi-cuefinder/v1/sync-catalog.json
**Agent note:** https://cumulativewebinc.github.io/cwi-cuefinder/discovery.txt
**Agent card:** https://cumulativewebinc.github.io/cwi-cuefinder/.well-known/agent-card.json
**Embed:** https://cumulativewebinc.github.io/cwi-cuefinder/embed.html

Brand: "2AM at the supervisor's desk" — signal amber `#FFB224` on near-black,
Space Grotesk + IBM Plex Mono, groove-crosshair mark. Spec: `BRAND.md` (approved
2026-09-16, Agent Deck gear line, Sync & Licensing).

## Query grammar
Mood words, energy words, BPM numbers/ranges ("95-105 BPM", "around 100bpm"),
instrumentation, vocal type ("male vocal", "no vocals"), explicit/clean ("clean",
"radio-safe"), scene phrases ("nighttime driving scene"), use-case words
("trailer", "game"). Refinements append: "slower", "faster", "+ more piano".
Titles fuzzy-match ("zz" → Zooted Zone). Every result shows a transparent mono
match explanation: matched tokens in green, missed tokens struck through.
Query state encodes in the URL hash; "copy search link" copies it in one click.

## Competitive edges (demonstrable, not claimed)
1. Live timing readout — "ranked 24 tracks in 3ms," measured on-device.
2. Transparent matching — mono explanation lines, missed tokens struck through.
3. Rights-first — DIRECT CLEARANCE badge is the most prominent row element after the title.
4. Zero-friction sharing — every query is a URL; one-click copy.
5. Agent-native — /v1/sync-catalog.json + /discovery.txt + /.well-known/agent-card.json.
6. Curation as a feature — counts read "N licensable matches," never "N matches."

## Data honesty (hard gates, BRAND.md §6)
- `verified` — titles, Spotify links, explicit flags (Spotify metadata), credits, rights.
- `editorial` — moods, energy, instrumentation, scenes, use cases. Never audio analysis.
- `estimate` — every BPM labeled `est.` Never measured.
- Rights — no one-stop / pre-cleared claims. Clearance: hp@cumulativeweb.com.

## Scale path (24 → 10,000 tracks)
- `engine.js#buildIndex` precomputes the token index once per catalog load.
- `rank(candidates, parsed)` is pure: no DOM, no state, no network — it moves
  into a Web Worker untouched (postMessage parsed query + candidates in, ranked out).
- Static JSON on the CDN: reads scale at $0. Schema namespaced by `catalog_id`
  ("cwi.tbhh.sync-catalog") from day one — multi-artist without a rewrite.

## Technology
- Zero-dependency vanilla JS. No framework to age out.
- Machine layer versioned: `/v1/sync-catalog.json` + `/v1/CHANGELOG.md`.
  Breaking changes ship as `/v2/`; v1 stays frozen.
- Future (documented, not built): query API + x402 micropayment SKU when CWI's
  monetization infra is ready. The static build does not block that future.

## Embed snippet
```html
<iframe src="https://cumulativewebinc.github.io/cwi-cuefinder/embed.html"
  width="100%" height="520" style="border:0" title="CueFinder search"></iframe>
```
Optional preset: `embed.html?q=dark+futuristic`

## Files
- `index.html` / `styles.css` / `app.js` — the app (command-palette surface)
- `engine.js` — pure search engine, browser + Node (index + pure rank)
- `catalog.js` — generated catalog data (run `python3 build_catalog.py`, do not hand-edit)
- `sync-catalog.json` — generated machine catalog (cwi.sync-catalog/1.0)
- `v1/sync-catalog.json` + `v1/CHANGELOG.md` — versioned machine layer
- `.well-known/agent-card.json` — agent discovery
- `discovery.txt` — agent discovery note
- `embed.html` — embeddable widget
- `brand/` — mark, favicon, og.png, tokens.css, brand page
- `tests/engine.test.js` — engine checks incl. the ranking kill rule
