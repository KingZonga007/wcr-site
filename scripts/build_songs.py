"""Turn content/songs.csv into src/data/songs.json for the site.

Album groupings are inferred from release year + publisher + the bio and are
marked confidence="inferred" until Ryan confirms. FUSE is confirmed from its
published tracklist.
"""
import csv, json, re, sys
from urllib.parse import quote

SRC = sys.argv[1]
OUT = sys.argv[2]

SPOTIFY_ARTIST = "https://open.spotify.com/artist/5K4EsfuyB0ltAeK7GmxLT5"

FUSE = {"Come You Saints", "Only You", "My Savior's Precious Blood", "Oh the Deep", "Come Spirit of God"}
WRITERS = {
    "Behold Our God": "Jonathan Baird, Meghan Baird, Ryan Baird, Stephen Altrogge",
    "All Creatures of Our God and King": "Jonathan Baird, Ryan Baird (new music and arrangement)",
    "Come You Saints": "Jonathan Baird, Ryan Baird",
}
THEMES = {
    "Behold Our God": ["God's greatness", "Isaiah 40"],
    "Isaiah 53": ["The cross", "Isaiah 53"],
    "Behold the Lamb": ["The cross"],
    "We Three Kings": ["Christmas"],
    "The Armor": ["Spiritual warfare", "Ephesians 6"],
    "The Prodigal": ["Grace", "Luke 15"],
    "The Pearl of Great Price": ["Matthew 13"],
    "Cross the Jordan": ["Hope of heaven"],
    "Some Bright Golden Morning": ["Hope of heaven"],
    "Solid Rock": ["Hymn"],
    "All Creatures of Our God and King": ["Hymn", "Creation"],
    "All That Thrills My Soul": ["Hymn"],
    "Depth of Mercy": ["Hymn", "Mercy"],
    "Oh the Deep": ["Hymn", "Love of Christ"],
}
SKIP = {"Intro"}  # album intro track, pending Ryan's call


def slugify(s):
    s = s.lower().replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def album_for(name, pub, year):
    if name in FUSE:
        return {"title": "FUSE (EP)", "confidence": "confirmed"}
    if year == 2008 and pub == "WCR":
        return {"title": "West Coast Revival", "confidence": "inferred"}
    if year == 2013 and pub == "SGM":
        return {"title": "All That Thrills My Soul (EP)", "confidence": "inferred"}
    if year == 2015 and pub == "WCR":
        return {"title": "Some Bright Golden Morning", "confidence": "inferred"}
    if pub == "SGM":
        return {"title": "Sovereign Grace Music release", "confidence": "inferred"}
    return {"title": "Single", "confidence": "inferred"}


rows = list(csv.DictReader(open(SRC, encoding="utf-8")))
songs = {}
for r in rows:
    name = r["name"].strip()
    if name in SKIP:
        continue
    canonical = "Behold Our God" if name.lower().startswith("behold our god") else name
    version = "Almost Acoustic" if "almost acoustic" in name.lower() else None
    year = int(r["release_year"])
    pub = r["publisher"].strip()
    slug = slugify(canonical)
    rec = {
        "year": year,
        "publisher": "Sovereign Grace Music" if pub == "SGM" else "West Coast Revival",
        "album": album_for(canonical, pub, year),
        "version": version or ("Sovereign Grace recording" if pub == "SGM" and canonical in {"Time Keeps Slippin' Away"} else None),
        "tempo": r["tempo"].strip(),
    }
    s = songs.setdefault(slug, {
        "slug": slug,
        "title": "Behold Our God" if canonical == "Behold Our God" else canonical.replace("To Know you", "To Know You"),
        "key": r["key"].strip() or None,
        "writers": WRITERS.get(canonical),
        "themes": THEMES.get(canonical, []),
        "ccli": None,
        # Two core charts per song: recording key and congregational key.
        # Each: {"key": "G", "file": "/charts/<slug>-recording.pdf"}; extras: lead sheet, capo, ChordPro.
        "charts": {"recording": None, "congregational": None, "extras": []},
        "lyrics": None,
        "story": None,
        "youtubeId": None,
        "recordings": [],
    })
    if not s["key"] and r["key"].strip():
        s["key"] = r["key"].strip()
    s["recordings"].append(rec)

for s in songs.values():
    s["recordings"].sort(key=lambda x: x["year"])
    s["year"] = s["recordings"][-1]["year"]
    s["firstYear"] = s["recordings"][0]["year"]
    s["publisher"] = s["recordings"][0]["publisher"] if s["slug"] != "come-you-saints" else "West Coast Revival"
    q = quote(f"West Coast Revival {s['title']}")
    # Placeholders until DistroKid/HyperFollow links are added per song
    s["listen"] = {
        "spotify": SPOTIFY_ARTIST,
        "apple": f"https://music.apple.com/us/search?term={q}",
        "youtube": f"https://www.youtube.com/results?search_query={q}",
        "amazon": f"https://music.amazon.com/search/{q}",
        "exact": False,
    }

# Keep what was added after the CSV import (exact links, charts, lyrics, stories,
# songs found automatically by scripts/update-content.mjs).
import os
if os.path.exists(OUT):
    prev = {x["slug"]: x for x in json.load(open(OUT, encoding="utf-8"))}
    for slug, s in songs.items():
        p = prev.get(slug)
        if not p:
            continue
        for k in ("charts", "lyrics", "story", "ccli", "youtubeId", "writers", "key"):
            if p.get(k):
                s[k] = p[k]
        if p.get("listen", {}).get("exact"):
            s["listen"] = p["listen"]
    for slug, p in prev.items():
        if slug not in songs and p.get("source") == "auto":
            songs[slug] = p

out = sorted(songs.values(), key=lambda s: (-s["year"], s["title"]))
json.dump(out, open(OUT, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
print(len(out), "songs written")
