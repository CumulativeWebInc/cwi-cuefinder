# sync-catalog changelog

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
