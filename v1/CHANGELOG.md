# sync-catalog changelog

## v1.2.0 — 2026-09-23
- RETIRED: `place-i-go-to-dream` descriptor removed — the original recording is
  absent from the catalog source of truth (retired); the Remastered variant
  (Spotify 31MTBSMfWy4jGEYAilkaH8, ISRC QZDA52227918) is the valid recording.
  Authorized by Black 2026-09-23 ("Place I dream is good, proceed").
- Titles now use the catalog's exact titles: "Place I Go to Dream (Remastered)",
  "Place I Go to Dream (Instrumental)" (were " - Remastered" / " - Instrumental").
- 23 tracks (was 24). All other descriptors byte-identical to v1.1.0.
- Brief packs unchanged: none referenced the retired descriptor; every pack
  track record remains verbatim against the new catalog (150/150).
- Test bundle completed: app/ is now the full testable bundle (engine.js, site
  files, v1 packs); suites green — engine 19/19, gates 64/64, brief-packs
  150/150, conversion 22/22.


## v1.1.0 — 2026-09-17
- NEW: 5 machine-readable sync brief packs at `/v1/brief-packs` (schema `cwi.brief-packs/1.0`):
  sports hype, trailer tension, fashion film, horror/thriller, sneaker commercial.
  Per-pack files at `/v1/brief-packs-<pack-id>.json`; `.json` twin + `/v1/index.json`
  agent index. Every track record carried through verbatim from v1/sync-catalog.json —
  no new descriptors, no invented data.
- Rights posture unchanged: no one-stop or pre-cleared claims; direct clearance via
  hp@cumulativeweb.com. Agent card (`.well-known/agent-card.json`) lists the new URLs.

## v1.0.0 — 2026-09-16
- Initial versioned release. Schema `cwi.sync-catalog/1.0`, `catalog_id: cwi.tbhh.sync-catalog`.
- 24 tracks, That Boy Hi Hat. Provenance classes: `verified` / `editorial` / `estimate` (BPM).
- Rights: no one-stop or pre-cleared claims; direct clearance via hp@cumulativeweb.com.
- Consumers: pin to `/v1/sync-catalog.json`. Breaking changes ship as `/v2/`; v1 stays frozen.
