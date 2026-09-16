# CueFinder

AI sync-discovery engine for the CWI catalog — search the way music supervisors search.

**Live:** https://cumulativewebinc.github.io/cwi-cuefinder/
**Machine catalog:** https://cumulativewebinc.github.io/cwi-cuefinder/sync-catalog.json
**Agent note:** https://cumulativewebinc.github.io/cwi-cuefinder/llms.txt

Natural-language search over all 24 That Boy Hi Hat tracks: parses mood, energy,
BPM/ranges, instrumentation, vocal type, clean/explicit, and scene phrases
("nighttime driving", "fight scene", "fashion film", "trailer", "game menu").
Every result carries a transparent match explanation. Shareable query URLs via the hash.

## Data honesty (hard rule)
- **Verified:** titles, Spotify links, explicit flags (Spotify metadata), producer/studio credits.
- **Editorial:** mood / energy / instrumentation / scene tags — curated for search, never audio analysis.
- **BPM:** estimates, labeled `est.` everywhere.
- **Rights:** no one-stop / pre-cleared claims. Clearance: hp@cumulativeweb.com.

## Files
- `index.html` / `styles.css` / `app.js` — the app
- `engine.js` — pure search engine (browser + Node)
- `catalog.js` — generated catalog data (do not hand-edit; run `python3 gen_data.py`)
- `sync-catalog.json` — generated machine-readable catalog
- `llms.txt` — agent discovery note
- `tests/engine.test.js` — 19 checks incl. the ranking kill rule (`node tests/engine.test.js`)
