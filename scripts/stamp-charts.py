#!/usr/bin/env python3
"""Make sure every chart PDF for a WCR-published song carries the full copyright line.

Standard step when adding or replacing charts:
    python3 scripts/stamp-charts.py            # stamp any chart that needs it
    python3 scripts/stamp-charts.py --check    # report only, change nothing

A song is WCR-published when songs.json has "wcrCopyrightYear" (Publisher = WCR on
the WCR Master Song List; year = first release). For each of its charts:
  - full line already there: left alone
  - short line ("© YEAR West Coast Revival Music"): replaced in place by the full line
  - no line: full line added at the bottom of the last page
"""
import json, sys, pathlib
import pymupdf

ROOT = pathlib.Path(__file__).resolve().parent.parent
LINE = "© {y} West Coast Revival Music (ASCAP). Administered worldwide by Songtrust. All rights reserved."
FULL_MARK = "Administered worldwide by Songtrust"


def charts(song):
    c = song.get("charts", {})
    files = [x["file"] for x in [c.get("recording"), c.get("congregational"), *c.get("extras", [])] if x]
    return list(dict.fromkeys(files))


def fit_size(text, width, start):
    size = start
    while size > 5 and pymupdf.get_text_length(text, fontname="helv", fontsize=size) > width:
        size -= 0.25
    return size


def stamp(path, year, check):
    doc = pymupdf.open(path)
    text = "".join(p.get_text() for p in doc)
    if FULL_MARK in text:
        return "ok"
    if check:
        return "needs stamp"
    line = LINE.format(y=year)
    done = False
    for page in doc:
        hits = page.search_for("West Coast Revival Music")
        for r in hits:
            # Widen to the whole short line, starting at the © sign.
            row = [b for b in page.get_text("words") if abs(b[1] - r.y0) < 3]
            x0 = min([b[0] for b in row if b[2] <= r.x1 + 1] + [r.x0])
            box = pymupdf.Rect(x0, r.y0 - 1, max(r.x1, *[b[2] for b in row]) + 1, r.y1 + 1)
            size = round(r.height * 0.78, 2)
            page.add_redact_annot(box, fill=(1, 1, 1))
            page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE)
            width = page.rect.width - box.x0 - 24
            size = fit_size(line, width, size)
            page.insert_text((box.x0, box.y1 - 2), line, fontname="helv", fontsize=size, color=(0, 0, 0))
            done = True
            break
        if done:
            break
    if not done:
        page = doc[-1]
        size = fit_size(line, page.rect.width - 72, 8)
        w = pymupdf.get_text_length(line, fontname="helv", fontsize=size)
        page.insert_text(((page.rect.width - w) / 2, page.rect.height - 24), line, fontname="helv", fontsize=size, color=(0.25, 0.25, 0.25))
    tmp = path.with_suffix(".tmp.pdf")
    doc.save(tmp, garbage=3, deflate=True)
    doc.close()
    tmp.replace(path)
    return "replaced short line" if done else "added line"


def main():
    check = "--check" in sys.argv
    songs = json.loads((ROOT / "src/data/songs.json").read_text())
    bad = 0
    for s in songs:
        y = s.get("wcrCopyrightYear")
        if not y:
            continue
        for f in charts(s):
            p = ROOT / "public" / f.lstrip("/")
            if not p.exists():
                print(f"MISSING  {f}")
                bad += 1
                continue
            r = stamp(p, y, check)
            if r != "ok":
                print(f"{r:20} {f}")
                bad += r == "needs stamp"
    if check and bad:
        sys.exit(1)


if __name__ == "__main__":
    main()
