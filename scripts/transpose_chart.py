#!/usr/bin/env python3
"""Transpose a SongSelect-style chord chart PDF in place, keeping its layout.

Usage: python3 scripts/transpose_chart.py IN.pdf OUT.pdf FROM_KEY TO_KEY [--clean]

Use the same key for FROM and TO to only clean a chart.
--clean removes the SongSelect logo and the CCLI / SongSelect footer lines,
keeping the copyright line(s).

Finds chord-only lines, removes the original chord text (true redaction, so
copy/paste and search show the new chords), and writes the transposed chords
at the same positions. Also updates the "Key - X" header.
"""
import re
import sys
from pathlib import Path

import pymupdf as fitz

HERE = Path(__file__).resolve().parent
CHORD_FONT = HERE / 'fonts' / 'OpenSans-700.ttf'
HEADER_FONT = HERE / 'fonts' / 'DejaVuSans-Bold.ttf'

SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
FLAT_KEYS = {'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm'}
NOTE = {n: i for i, n in enumerate(SHARPS)} | {n: i for i, n in enumerate(FLATS)}
CHORD = re.compile(r'^([A-G][#b]?)((?:m(?!aj)|maj|sus|dim|aug|add|M)?[0-9]*(?:sus[0-9]*)?)(?:/([A-G][#b]?))?$')


def shift(note, steps, scale):
    return scale[(NOTE[note] + steps) % 12]


def transpose(chord, steps, scale):
    m = CHORD.match(chord)
    if not m:
        return chord
    root, qual, bass = m.groups()
    out = shift(root, steps, scale) + qual
    if bass:
        out += '/' + shift(bass, steps, scale)
    return out


FOOTER_DROP = re.compile(r'CCLI|SongSelect|ccli\.com|For use solely', re.I)


def clean(page):
    """Remove the SongSelect logo (top-right image) and CCLI footer lines."""
    for img in page.get_images():
        for r in page.get_image_rects(img[0]):
            if r.y0 < 80 and r.x0 > page.rect.width / 2:
                page.add_redact_annot(r, fill=(1, 1, 1))
    for b in page.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            text = ''.join(sp['text'] for sp in l['spans'])
            if FOOTER_DROP.search(text):
                page.add_redact_annot(fitz.Rect(l['bbox']), fill=(1, 1, 1))


def main(src, dst, frm, to, *flags):
    steps = (NOTE[to.rstrip('m')] - NOTE[frm.rstrip('m')]) % 12
    scale = FLATS if to in FLAT_KEYS else SHARPS
    doc = fitz.open(src)
    for page in doc:
        words = page.get_text('words')  # x0,y0,x1,y1,text,block,line,word
        lines = {}
        for w in words:
            lines.setdefault((w[5], w[6]), []).append(w)
        edits = []
        for ws in lines.values():
            if all(CHORD.match(w[4]) for w in ws):
                for w in ws:
                    edits.append((w, transpose(w[4], steps, scale)))
        # Header "Key - C"
        hdr = None
        for ws in lines.values():
            t = [w[4] for w in ws]
            if len(t) >= 3 and t[0] == 'Key' and t[1] == '-':
                hdr = ws[2]
        spans = {}
        for b in page.get_text('dict')['blocks']:
            for l in b.get('lines', []):
                for s in l['spans']:
                    spans.setdefault(round(s['bbox'][1]), s)

        def baseline_and_size(w):
            best = min(spans.values(), key=lambda s: abs(s['bbox'][1] - w[1]) + abs(s['bbox'][0] - w[0]) * 0.01)
            return best['origin'][1], best['size']

        if steps == 0:
            edits, hdr = [], None
        info = [(w, new, *baseline_and_size(w)) for w, new in edits]
        if '--clean' in flags:
            clean(page)
        if hdr:
            info.append((hdr, to, *baseline_and_size(hdr)))
        for w, new, y, size in info:
            # Tight box around the glyphs only, so lyrics above/below are untouched.
            page.add_redact_annot(fitz.Rect(w[0] + 0.5, y - size * 0.7, w[2] - 0.5, y - size * 0.05), fill=(1, 1, 1))
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE if '--clean' in flags else fitz.PDF_REDACT_IMAGE_NONE)
        page.insert_font(fontname='chord', fontfile=str(CHORD_FONT))
        page.insert_font(fontname='hdr', fontfile=str(HEADER_FONT))
        for w, new, y, size in info:
            font = 'hdr' if w is hdr else 'chord'
            page.insert_text((w[0], y), new, fontname=font, fontsize=size, color=(0, 0, 0))
    doc.save(dst, garbage=3, deflate=True)
    print(f'{len(edits)} chords moved {frm} -> {to}' + (' (cleaned)' if '--clean' in flags else ''))


if __name__ == '__main__':
    main(*sys.argv[1:])
