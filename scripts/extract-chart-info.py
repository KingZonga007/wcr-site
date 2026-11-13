#!/usr/bin/env python3
"""Read each song's chart PDF and store page text in songs.json:
chartInfo (tempo, time, sections, chords used) for every charted song, and
lyrics (HTML) only for songs West Coast Revival publishes. Run after adding a chart."""
import json, re, sys, html, warnings
warnings.simplefilter('ignore')
import pymupdf

CH = r'[A-G][#b]?(?:maj|min|m|sus|add|dim|aug|M)?\d*(?:sus\d*|add\d+)?(?:\([^)]*\))?(?:/[A-G][#b]?)?'
CHORD = re.compile(rf'^\(?\|*{CH}\|*\)?$')
NOISE = re.compile(r'^(\||\|\||x\d+|\d+x|\(x\d+\)|-|/|%|N\.?C\.?|\.+)$', re.I)
SECTION = re.compile(r'^(intro|verse|chorus|pre[- ]?chorus|bridge|tag|outro|ending|interlude|instrumental|turnaround|refrain|vamp|coda|solo|channel)\b[\s\d a-z/]*:?$', re.I)
ZW = re.compile('[​‌‍﻿ ]')

def lines(pdf):
    out = []
    for page in pymupdf.open(pdf):
        ws = [(w[0], (w[1]+w[3])/2, w[2], ZW.sub('', w[4])) for w in page.get_text('words')]
        ws = [w for w in ws if w[3].strip()]
        cy = [w[1] for w in ws if '©' in w[3]]
        ws = [w for w in ws if not any(abs(w[1] - y) < 4 for y in cy)]
        if not ws: continue
        W = page.rect.width
        # find a column gutter: an x near the middle that no word crosses
        gut = None; top = page.rect.height * 0.12
        body = [w for w in ws if top <= w[1] <= page.rect.height * 0.93]
        best = 0
        x = W * 0.35
        while x < W * 0.65:
            if not any(w[0] < x < w[2] for w in body):
                # width of the empty band starting here
                x2 = x
                while x2 < W * 0.7 and not any(w[0] < x2 < w[2] or abs(w[0] - x2) < 0.5 for w in body): x2 += 1
                l = sum(1 for w in body if w[2] <= x); r = sum(1 for w in body if w[0] >= x2 - 1)
                if x2 - x > best and l > 20 and r > 20: best = x2 - x; gut = (x + x2) / 2
                x = x2 + 1
            else: x += 1
        if best < 8: gut = None
        if gut is None:
            # second try: the right column's left margin (many line starts at one x, nothing crossing it)
            from collections import Counter
            rowsy = {}
            for w in sorted(body, key=lambda w: (round(w[1] / 3), w[0])): rowsy.setdefault(round(w[1] / 3), []).append(w)
            starts = Counter()
            for r in rowsy.values():
                for i, w in enumerate(r):
                    if W * 0.4 < w[0] < W * 0.75 and (i == 0 or w[0] - r[i-1][2] > 12) and not CHORD.match(w[3].strip('|()')): starts[round(w[0])] += 1
            for x, n in starts.most_common(3):
                if n >= 5 and not any(w[0] < x - 2 < w[2] for w in body): gut = x - 2; break
        foot = page.rect.height * 0.93
        groups = [[w for w in ws if (w[0] < gut or w[1] < top) and w[1] <= foot], [w for w in ws if w[0] >= gut and top <= w[1] <= foot], [w for w in ws if w[1] > foot]] if gut else [ws]
        for g in groups:
            rows = []
            for w in sorted(g, key=lambda w: w[1]):
                if rows and abs(rows[-1][0] - w[1]) < 3.2: rows[-1][1].append(w)
                else: rows.append([w[1], [w]])
            for y, p in rows:
                p.sort(key=lambda w: w[0]); s = ''
                for i, w in enumerate(p):
                    if i and w[0] - p[i-1][2] > 0.8: s += ' '
                    s += w[3]
                out.append(s.strip())
    return out

def parse(pdf, title):
    L = lines(pdf)
    info = {'sections': [], 'chords': []}
    lyr = []; cur = None; header = True
    for ln in L:
        m = re.search(r'Tempo\s*-\s*(\d+)', ln)
        if m: info['tempo'] = int(m.group(1))
        m = re.search(r'Time\s*-\s*(\d+/\d+)', ln)
        if m: info['time'] = m.group(1)
        if re.search(r'^Key\s*-', ln): continue
        ln = re.sub(r'(\w) - (\w)', r'\1\2', ln) if not re.search(r'Key|Tempo', ln) else ln
        toks = ln.split()
        lab = re.match(r'^([A-Za-z /-]+\d*):\s*(.*)$', ln)
        if lab and SECTION.match(lab.group(1).strip()):
            sec = lab.group(1).strip(); rest = lab.group(2).split()
            if rest and rest[0].isdigit(): sec += ' ' + rest.pop(0)
            info['sections'].append(sec.title()); cur = [sec.title(), []]; lyr.append(cur); header = False
            for t in rest:
                t2 = t.strip('|()')
                if CHORD.match(t2) and t2 not in info['chords']: info['chords'].append(t2)
            continue
        if SECTION.match(ln) and len(toks) <= 3:
            info['sections'].append(ln.rstrip(':').title()); cur = [ln.rstrip(':').title(), []]; lyr.append(cur); header = False; continue
        real = [t for t in toks if not NOISE.match(t)]
        if real and all(CHORD.match(t.strip('|()')) or re.fullmatch(r'(?:[A-G][#b]?m?7?){2,3}', t) for t in real):
            for t in real:
                t2 = t.strip('|()')
                if CHORD.match(t2) and t2 not in info['chords']: info['chords'].append(t2)
            continue
        if not real or header: continue
        if re.search(r'©|\bCCLI\b|All rights reserved|Used by permission|^Page \d|^\d+$|westcoastrevival', ln, re.I): continue
        # drop inline chord tokens left in a lyric line
        words = [t for t in toks if not (CHORD.match(t.strip('|()')) and t.strip('|()') not in ('A', 'Am', 'Be', 'Me', 'Go', 'Add', 'Dim', 'Gm') ) and not NOISE.match(t)]
        txt = ' '.join(words).strip(' •')
        txt = re.sub(r'(\w) - (\w)', r'\1\2', txt)
        if not txt or cur is None or re.fullmatch(re.escape(title) + r'\s*\d+', txt, re.I): continue
        if cur[1] and txt[0].islower() and len(cur[1][-1]) < 46: cur[1][-1] += ' ' + txt
        else: cur[1].append(txt)
    return info, lyr

def to_html(lyr):
    seen = {}; out = []
    for name, ls in lyr:
        if not ls: continue
        key = '\n'.join(ls).lower()
        if key in seen: continue          # repeated section printed once
        seen[key] = 1
        out.append(f'<h3>{html.escape(name)}</h3><p>' + '<br>'.join(html.escape(l) for l in ls) + '</p>')
    return ''.join(out)

# Charts whose layout can't be read reliably into clean lyric text. Lyrics for these are typed in by hand.
SKIP_LYRICS = {'have-you-been-to-jesus'}
def tidy(slug, lyr):
    out = []
    for name, ls in lyr:
        ls = [l.replace('pro ceeding', 'proceeding').replace('righteous ness', 'righteousness') for l in ls if l.strip().lower() != 'oh']
        fixed = []
        for l in ls:
            m = re.match(r'^(.{30,}?[a-z]) ((?:Poured|Lining) .+)$', l)
            fixed += [m.group(1), m.group(2)] if m else [l]
        joined = []
        for l in fixed:
            if joined and ' ' not in l.strip(): joined[-1] += ' ' + l.strip()   # a wrapped last word
            else: joined.append(l)
        out.append([name, joined])
    if slug == 'and-can-it-be':
        # the chart's third verse starts at the top of the second column
        d = {n: ls for n, ls in out}
        if d.get('Intro') and 'Interlude 2' in d:
            for sec in out:
                if sec[0] == 'Interlude 2': sec[0] = 'Verse 3'; sec[1][:0] = d['Intro']
            out = [x for x in out if x[0] != 'Intro']
    if slug == 'o-for-a-thousand-tongues-to-sing' and out and not out[0][1][0].lower().startswith('o for'):
        out[0][1].insert(0, 'O for a thousand tongues to sing')
    return out

if __name__ == '__main__':
    songs = json.load(open('src/data/songs.json'))
    for s in songs:
        c = s['charts']; ch = c.get('congregational') or c.get('recording')
        if not ch: continue
        info, lyr = parse('public' + ch['file'], s['title'])
        s['chartInfo'] = info
        if s['publisher'] == 'West Coast Revival' and s['slug'] not in SKIP_LYRICS and not s.get('lyricsManual'): s['lyrics'] = to_html(tidy(s['slug'], lyr)) or None
        elif not s.get('lyricsManual'): s['lyrics'] = None
        if '-v' in sys.argv:
            print('#####', s['slug'], info)
            for n, ls in lyr: print('  [' + n + ']'); [print('    ' + l) for l in ls]
    json.dump(songs, open('src/data/songs.json', 'w'), indent=1, ensure_ascii=False)
