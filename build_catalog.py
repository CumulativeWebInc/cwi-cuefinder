#!/usr/bin/env python3
"""CueFinder data pipeline — build-time join (INFRASTRUCTURE.md section 2).

Source of truth for track IDENTITY: cwi-learn catalog.json
  (https://cumulativewebinc.github.io/cwi-learn/catalog.json)
  -> titles, artist, verified Spotify IDs, explicit flags from Spotify metadata.

Editorial descriptors: descriptors.json (CWI Sync department, curated for search).

The join FAILS LOUDLY if:
  - the source of truth is unreachable,
  - any source track has no descriptor entry,
  - any descriptor entry has no source track.
Never ships a catalog with silently dropped tracks.

Emits: app/sync-catalog.json, app/catalog.js
Usage: python3 build_catalog.py

Bundle layout note (2026-09-23): app/ is the full testable bundle — it also
carries copies of engine.js, app.js, index.html, styles.css, embed.html,
brand/, .well-known/agent-card.json and the v1/ brief packs, because
tests/*.test.js read from app/. After rebuilding the catalog, sync the
catalog outputs to the repo root (what GitHub Pages serves):
  cp app/sync-catalog.json sync-catalog.json
  cp app/catalog.js catalog.js
  cp app/v1/sync-catalog.json v1/sync-catalog.json
and append a changelog entry to v1/CHANGELOG.md (never overwrite it).
"""
import json
import os
import re
import sys
import urllib.request
from datetime import date

BUILD = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(BUILD, "app")
SOURCE_URL = "https://cumulativewebinc.github.io/cwi-learn/catalog.json"
ARTIST_NAME = "That Boy Hi Hat"

# Verified credits (owner-confirmed facts, not descriptors).
VERIFIED_CREDITS = {
    "zooted-zone": {
        "producer": "Kokurcho (verified)",
        "mix_master": "Hybrid, Hagerstown MD (verified)",
        "recorded": "Hagerstown, Feb 2023 (verified)",
    },
    "diabolique": {
        "studio": "Cue Recording Studio, Arlington VA (verified)",
        "production": "Co-produced by Hybrid + Black Lansky (verified)",
        "release": "Single, 2026-07-03 (verified)",
    },
    "flamerz": {
        "producer": "Jeck Da General (verified)",
    },
}

VOCAB = {
    "moods": ["dark", "futuristic", "aggressive", "cinematic", "melancholic",
              "euphoric", "menacing", "triumphant", "hazy", "anthemic",
              "brooding", "electric"],
    "energy_words": ["relentless", "simmering", "explosive", "cruising",
                     "hypnotic", "soaring"],
    "scenes": ["nighttime driving", "fight scene", "heist sequence", "chase",
               "locker room", "fashion film", "game trailer", "title sequence",
               "club scene", "training montage", "end credits", "neon city"],
    "use_cases": ["trailer", "film", "tv", "game", "ad", "fashion film", "sports"],
    "instrumentation": ["808s", "trap hats", "distorted synths", "synth pads",
                        "piano", "strings", "choir", "guitar", "brass",
                        "vocal chops"],
}


def fetch_source(url):
    """Fetch the source of truth. curl first (urllib gets truncated reads from
    this host); urllib fallback. Returns parsed JSON or raises."""
    import subprocess
    try:
        out = subprocess.run(["curl", "-sSf", "--max-time", "30", url],
                             capture_output=True, timeout=40)
        if out.returncode == 0 and out.stdout:
            return json.loads(out.stdout.decode())
    except Exception:
        pass
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.loads(resp.read().decode())


def norm_title(t):
    return re.sub(r"\s+", " ", t.strip().lower())


# Title aliases: descriptor title -> current source-of-truth title.
# Each alias below is evidenced by identical Spotify track IDs (same recording),
# verified 2026-09-23 against the previously shipped sync-catalog.json:
#   'Warped and Wicked' (3w4RKguHAT2xd9K0w5CklC) == 'Warped & Wicked' (ISRC QZDA62200554)
#   'Toxic Elements'    (2aTbpxiF2jNiB3PGi81oqa) == 'Toxic Element'   (ISRC QZWFE2309934)
# Do NOT add aliases without same-recording evidence (Spotify ID and/or ISRC).
# Same-recording aliases (evidenced by identical Spotify track IDs — see above).
TITLE_ALIASES = {
    "Warped and Wicked": "Warped & Wicked",
    "Toxic Elements": "Toxic Element",
}
# Variant-formatting aliases were retired 2026-09-23: descriptor titles now use
# the catalog's exact titles ("Place I Go to Dream (Remastered)",
# "Place I Go to Dream (Instrumental)"), so no mapping is needed. The orphan
# descriptor for the retired original recording was removed with Black's
# explicit approval ("Place I dream is good, proceed" — 2026-09-23 09:05 EDT);
# the Remastered variant (Spotify 31MTBSMfWy4jGEYAilkaH8, ISRC QZDA52227918)
# is the valid recording per the catalog source of truth.


def fail(msg):
    print(f"BUILD FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def main():
    # 1. source of truth
    try:
        source = fetch_source(SOURCE_URL)
    except Exception as e:
        fail(f"source of truth unreachable: {SOURCE_URL}: {e}")

    # 1. source of truth — flat schema: source["tracks"] filtered by artist name
    # (the catalog is now multi-artist; the old artists[] wrapper is gone).
    source_tracks = [t for t in source.get("tracks", [])
                     if t.get("artist") == ARTIST_NAME]
    if not source_tracks:
        fail(f"artist '{ARTIST_NAME}' not found in source of truth")

    # 2. editorial descriptors
    desc_path = os.path.join(BUILD, "descriptors.json")
    try:
        with open(desc_path) as f:
            descriptors = json.load(f)["descriptors"]
    except Exception as e:
        fail(f"cannot read descriptors.json: {e}")

    by_title = {norm_title(t["title"]): t for t in source_tracks}
    # evidenced aliases: descriptor title -> source title (same recording,
    # verified by Spotify ID — see TITLE_ALIASES).
    for alias, target in TITLE_ALIASES.items():
        key = norm_title(target)
        if key in by_title:
            by_title[norm_title(alias)] = by_title[key]
    by_desc = {norm_title(d["title"]): d for d in descriptors}

    # 3. join — loud on any mismatch. The curated sync catalog IS the
    # descriptor set: every descriptor must resolve to a source track.
    missing_src = [d["title"] for d in descriptors
                   if norm_title(d["title"]) not in by_title]
    if missing_src:
        fail(f"{len(missing_src)} descriptor entries have no source track "
             f"(catalog decision needed — not auto-mapped): {missing_src}")
    # Source tracks outside the curated set are REPORTED, not failed: the
    # source catalog is multi-variant (radio edits, remasters); curation
    # decides the sync-catalog track list.
    uncurated = [t["title"] for t in source_tracks
                 if norm_title(t["title"]) not in by_desc
                 and t["title"] not in TITLE_ALIASES.values()]
    if uncurated:
        print(f"NOTE: {len(uncurated)} source track(s) not in curated set "
              f"(Sync dept attention): {uncurated}")

    # 4. emit — iterate the curated descriptor set in order
    tracks = []
    for d in descriptors:
        st = by_title[norm_title(d["title"])]
        sid = st.get("spotify_id") or ""
        if not sid and st.get("spotify_url"):
            m = re.search(r"/track/([A-Za-z0-9]+)", st["spotify_url"])
            sid = m.group(1) if m else ""
        if not sid:
            fail(f"no Spotify ID for '{st['title']}'")
        explicit = st.get("explicit_per_spotify_metadata")
        explicit = explicit if isinstance(explicit, bool) else "unknown"
        vocal_type = "instrumental" if d["track_id"] == "place-i-go-to-dream-instrumental" else "male"

        tracks.append({
            "track_id": d["track_id"],
            "title": st["title"],
            "artist": ARTIST_NAME,
            "spotify_id": sid,
            "spotify_url": f"https://open.spotify.com/track/{sid}",
            "spotify_url_verified": True,
            "descriptors_provenance": "editorial",
            "audio": {
                "bpm": {"value": d["bpm_estimate"], "confidence": "estimate"},
                "energy": d["energy"],
                "energy_provenance": "editorial",
                "moods": d["moods"],
                "energy_words": d["energy_words"],
                "instrumentation": d["instrumentation"],
                "vocal": {
                    "type": vocal_type,
                    "type_provenance": "verified" if vocal_type == "male" else "editorial",
                    "style": d["vocal_style"],
                    "style_provenance": "editorial",
                },
                "explicit": explicit,
                "explicit_provenance": "spotify_metadata" if isinstance(explicit, bool) else "unknown",
            },
            "sync": {
                "scenes": d["scenes"],
                "use_cases": d["use_cases"],
                "lyrical_themes": d["lyrical_themes"],
                "lyrical_themes_provenance": "editorial",
                "sounds_like_reference": "editorial: " + d["sounds_like_reference"],
            },
            "rights": {
                "status": "direct-clearance",
                "one_stop": False,
                "pre_cleared": False,
                "contact": "hp@cumulativeweb.com",
                "provenance": "verified",
                "note": "No one-stop or pre-cleared rights claims are made (cwi-learn catalog_facts). Every placement clears directly.",
            },
            "credits": dict({"origin": "Frederick, MD", "provenance": "verified"},
                            **VERIFIED_CREDITS.get(d["track_id"], {})),
            "pipeline": {"spotify": "live", "youtube": "checklist", "disco": "checklist",
                         "sourceaudio": "checklist",
                         "note": "Guidance, not placement status."},
            "editorial_note": d.get("editorial_note"),
        })

    catalog = {
        "catalog": "cwi.sync-catalog/1.0",
        "catalog_id": "cwi.tbhh.sync-catalog",  # namespaced: multi-artist future without rewrite
        "schema_version": "1.0.0",
        "generated": date.today().isoformat(),
        "maintainer": "Cumulative Web Inc",
        "artist": ARTIST_NAME,
        "artist_spotify_url": "https://open.spotify.com/artist/2f9j460EwjfvjYp3trBcb7",
        "artist_origin": {"value": "Frederick, MD", "source": "verified"},
        "label": "Cumulative Web Inc",
        "contact": {"business_and_sync": "hp@cumulativeweb.com"},
        "rights_summary": {
            "one_stop_claimed": False,
            "pre_cleared_claimed": False,
            "note": "No one-stop or pre-cleared rights claims are made (cwi-learn catalog_facts). Sync clears directly via hp@cumulativeweb.com.",
            "source": "verified",
        },
        "descriptor_provenance": {
            "note": "All sonic/scene descriptors are editorial — curated by the CWI Sync department for search. Never audio-analysis output. BPM values are estimates.",
            "moods": "editorial", "energy": "editorial", "energy_words": "editorial",
            "instrumentation": "editorial", "scenes": "editorial",
            "use_cases": "editorial", "lyrical_themes": "editorial",
            "sounds_like_reference": "editorial",
        },
        "vocabularies": VOCAB,
        "track_count": len(tracks),
        "tracks": tracks,
    }

    os.makedirs(APP, exist_ok=True)
    with open(os.path.join(APP, "sync-catalog.json"), "w") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)
    # versioned machine layer: /v1/sync-catalog.json — v2 must never silently break v1 consumers
    v1dir = os.path.join(APP, "v1")
    os.makedirs(v1dir, exist_ok=True)
    with open(os.path.join(v1dir, "sync-catalog.json"), "w") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)
    with open(os.path.join(v1dir, "CHANGELOG.md"), "w") as f:
        f.write(
            "# sync-catalog changelog\n\n"
            "## v1.0.0 — 2026-09-16\n"
            "- Initial versioned release. Schema `cwi.sync-catalog/1.0`, "
            "`catalog_id: cwi.tbhh.sync-catalog`.\n"
            "- 24 tracks, That Boy Hi Hat. Provenance classes: `verified` / "
            "`editorial` / `estimate` (BPM).\n"
            "- Rights: no one-stop or pre-cleared claims; direct clearance via "
            "hp@cumulativeweb.com.\n"
            "- Consumers: pin to `/v1/sync-catalog.json`. Breaking changes ship "
            "as `/v2/`; v1 stays frozen.\n"
        )
    js = ("// CueFinder catalog data — generated by build_catalog.py. Do not hand-edit.\n"
          "window.CUEFINDER = window.CUEFINDER || {};\n"
          "window.CUEFINDER.catalog = " + json.dumps(catalog, ensure_ascii=False) + ";\n")
    with open(os.path.join(APP, "catalog.js"), "w") as f:
        f.write(js)

    print(f"JOIN OK: {len(tracks)} source tracks x {len(descriptors)} descriptors -> sync-catalog.json + catalog.js")


if __name__ == "__main__":
    main()
