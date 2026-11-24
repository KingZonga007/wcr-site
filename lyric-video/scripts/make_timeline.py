"""Build timeline.json from a lyric sheet + isolated vocal.

usage: python3 make_timeline.py SHEET VOX16.WAV PHOTO OUT.json [--tap TAP.txt] [--fix FIXES.json] [--dur SECONDS]

Sheet format:
  TITLE: Day After Day
  PHOTO_CROP: 0,0,976,1030          (optional)
  [Verse 1 | 0:18]                  section label, start time optional
  Our God is working for the good    one line = one screen
  Your power to save (and) strength  (word) = sung but not shown
  [Chorus | 3:13]                    any section with "chorus" in its name turns gold
Fixes JSON: {"LINE:WORD": seconds}  (1-based line and word numbers, as printed by this script)
"""
import sys, re, json, wave, argparse
import numpy as np
from pocketsphinx import Decoder

ap = argparse.ArgumentParser()
ap.add_argument('sheet'); ap.add_argument('vox'); ap.add_argument('photo'); ap.add_argument('out')
ap.add_argument('--tap'); ap.add_argument('--fix'); ap.add_argument('--dur', type=float)
ap.add_argument('--template', default='standard1')
A = ap.parse_args()

DICT = '/home/claude/lyricvid/lv.dict'

def tsec(s):
    s = s.strip(); m = re.match(r'^(\d+):(\d+(?:\.\d+)?)$', s)
    return int(m.group(1)) * 60 + float(m.group(2)) if m else float(s)

# ---------- parse sheet ----------
title, crop, secs = 'Untitled', None, []
for raw in open(A.sheet):
    ln = raw.strip()
    if not ln: continue
    if ln.upper().startswith('TITLE:'): title = ln.split(':', 1)[1].strip(); continue
    if ln.upper().startswith('PHOTO_CROP:'): crop = [int(v) for v in ln.split(':', 1)[1].split(',')]; continue
    m = re.match(r'^\[(.*)\]$', ln)
    if m:
        parts = [p.strip() for p in m.group(1).split('|')]
        secs.append(dict(name=parts[0], start=tsec(parts[1]) if len(parts) > 1 and parts[1] else None, lines=[])); continue
    if not secs: secs.append(dict(name='Verse', start=None, lines=[]))
    secs[-1]['lines'].append(ln)
secs = [s for s in secs if s['lines']]

words_dict = set(l.split(' ')[0] for l in open(DICT))
def norm(w): return re.sub(r"[^a-z']", '', w.lower()).replace("'", '')

# lines -> tokens: (display_text or None if hidden, norm)
LINES = []
for si, s in enumerate(secs):
    for ln in s['lines']:
        # "lead line // second voice" = a round: both shown at once, second voice on the row below.
        # Mark the lead word after which the second voice enters with ^ (default: middle of the lead line).
        p1, p2 = (ln.split('//', 1) + [''])[:2]
        toks, anchor = [], None
        for w in p1.split():
            if w.endswith('^'): w = w[:-1]; anchor = len(toks)
            hid = w.startswith('(') and w.endswith(')')
            d = w.strip('()').replace(',', '')
            toks.append([None if hid else d, norm(d)])
        P2 = [[w.strip('()').replace(',', ''), norm(w)] for w in p2.split()]
        if P2 and anchor is None: anchor = max(0, len(toks) // 2 - 1)
        LINES.append(dict(sec=si, tokens=toks, p2=P2, anchor=anchor))

# ---------- audio ----------
w = wave.open(A.vox); RAW = np.frombuffer(w.readframes(w.getnframes()), np.int16)
DUR = A.dur or len(RAW) / 16000
x = RAW.astype(float) / 32768; hop = 1600
rms = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) for i in range(0, len(x) - hop, hop)])
on = rms > max(0.02, np.percentile(rms, 60) * 0.5)
segs, s0 = [], None
for i, v in enumerate(on):
    if v and s0 is None: s0 = i
    if not v and s0 is not None:
        if i - s0 >= 2: segs.append([s0 / 10, i / 10])
        s0 = None
PH = []
for a, b in segs:
    if PH and a - PH[-1][1] < 0.35: PH[-1][1] = b
    else: PH.append([a, b])
ONSETS = [a for a, b in PH]

def align(tokens, a, b):
    """strict forced alignment of in-dictionary tokens within [a,b]; returns list of start times or None"""
    use = [t for t in tokens if t in words_dict]
    if not use: return None
    d = Decoder(samprate=16000, loglevel='FATAL', dict=DICT, beam=1e-200, wbeam=1e-150, pbeam=1e-200,
                maxhmmpf=-1, bestpath=False)
    try:
        d.set_align_text(' '.join(use))
        d.start_utt(); d.process_raw(RAW[int(max(0, a) * 16000):int(b * 16000)].tobytes(), full_utt=True); d.end_utt()
        seg = [s for s in (d.seg() or []) if s.word[0] not in '<[']
    except Exception:
        return None
    if len(seg) != len(use): return None
    times = iter([max(0, a) + s.start_frame / 100 for s in seg])
    out = [next(times) if t in words_dict else None for t in tokens]
    return fill(out, a, b)

def fill(ts, a, b):
    """interpolate None entries"""
    n = len(ts); ts = list(ts)
    for i in range(n):
        if ts[i] is None:
            lo = next((ts[j] for j in range(i - 1, -1, -1) if ts[j] is not None), a)
            hi_j = next((j for j in range(i + 1, n) if ts[j] is not None), None)
            hi = ts[hi_j] if hi_j is not None else min(b, lo + 0.5)
            gap = (hi_j - i + 1) if hi_j is not None else 2
            ts[i] = lo + (hi - lo) / gap
    return ts

def spread(n, a, b):
    """even fallback across vocal phrases in [a,b]"""
    ph = [p for p in PH if p[1] > a and p[0] < b] or [[a, b]]
    total = sum(min(p[1], b) - max(p[0], a) for p in ph)
    out = []
    for k in range(n):
        target = total * k / max(1, n); acc = 0
        for p in ph:
            L = min(p[1], b) - max(p[0], a)
            if acc + L >= target: out.append(max(p[0], a) + target - acc); break
            acc += L
        else: out.append(b)
    return out

# ---------- taps (optional): line starts; also give every section a start time ----------
TAPS = None
if A.tap:
    TAPS = []
    for ln in open(A.tap):
        m = re.match(r'^\s*([\d:.]+)\s*\|', ln)
        if m: TAPS.append(tsec(m.group(1)))
    if len(TAPS) != len(LINES): print(f'WARNING: {len(TAPS)} taps for {len(LINES)} lines; using what lines up')
    li = 0
    for s_ in secs:
        if li < len(TAPS) and s_['start'] is None: s_['start'] = max(0, TAPS[li] - 0.4)
        li += len(s_['lines'])

# ---------- word times ----------
flat = [(li, k) for li, L in enumerate(LINES) for k in range(len(L['tokens']))]
toks = [LINES[li]['tokens'][k][1] for li, k in flat]
times = [None] * len(flat)
all_timed = all(s['start'] is not None for s in secs)
done = False
if not all_timed:
    r = align(toks, 0, DUR)
    if r: times = r; done = True; print('aligned whole song in one pass')
if not done:
    # windows between known section starts
    starts = [s['start'] for s in secs]
    groups, cur = [], []
    for si, s in enumerate(secs):
        if s['start'] is not None and cur: groups.append(cur); cur = []
        cur.append(si)
    groups.append(cur)
    for gi, g in enumerate(groups):
        a = secs[g[0]]['start'] if secs[g[0]]['start'] is not None else 0
        nxt = groups[gi + 1][0] if gi + 1 < len(groups) else None
        b = secs[nxt]['start'] + 0.5 if nxt is not None else DUR
        idx = [i for i, (li, k) in enumerate(flat) if LINES[li]['sec'] in g]
        sub = [toks[i] for i in idx]
        r = align(sub, a - 1.0, b)
        if r is None:   # retry: end the window at the last sung phrase, then shrink
            ends = [p[1] for p in PH if a <= p[1] <= b]
            for bb in ([ends[-1] + 1.0] if ends else []) + [b - 5, b - 10, b - 15]:
                if bb > a + 3:
                    r = align(sub, a - 1.0, bb)
                    if r: break
        if r is None:
            print(f'WARNING: alignment failed for {[secs[s]["name"] for s in g]}; spreading evenly')
            r = spread(len(idx), a, b)
        for i, t in zip(idx, r): times[i] = t

# monotonic
for i in range(1, len(times)): times[i] = max(times[i], times[i - 1] + 0.08)
for (li, k), t in zip(flat, times): LINES[li]['tokens'][k].append(t)

# ---------- tap timings: line starts ----------
if TAPS:
    taps = TAPS
    for li, t in enumerate(taps[:len(LINES)]):
        tk = LINES[li]['tokens']; end = taps[li + 1] if li + 1 < len(taps) else t + 6
        old = [x[2] for x in tk]
        ok = all(t - 0.6 <= o <= end for o in old)
        if ok:
            shift = t - old[0]
            for x in tk: x[2] = min(end - 0.15, x[2] + shift)
        else:
            dur = min(end - t - 0.3, 0.5 * len(tk))
            for k, x in enumerate(tk): x[2] = t + dur * k / max(1, len(tk))
else:
    for L in LINES:
        t0 = L['tokens'][0][2]; c = [o for o in ONSETS if t0 - 1.2 <= o <= t0 + 0.6]
        if c: L['tokens'][0][2] = min(c, key=lambda o: abs(o - t0))

# ---------- fixes ----------
FIX = json.load(open(A.fix)) if A.fix else {}
def _fixes(part):   # word numbers count the lead line first, then the second voice
    for key, tm in FIX.items():
        li, wi = map(int, key.split(':')); L = LINES[li - 1]
        if (wi <= len(L['tokens'])) == (part == 1):
            (L['tokens'] + L['p2'])[wi - 1][2] = tsec(str(tm))

_fixes(1)
prev = 0
for L in LINES:
    for x in L['tokens']: x[2] = max(x[2], prev + 0.08); prev = x[2]

# second voice of a round: enters just after the anchor word, words spaced evenly
for li, L in enumerate(LINES):
    if not L['p2']: continue
    nxt = LINES[li + 1]['tokens'][0][2] if li + 1 < len(LINES) else L['tokens'][-1][2] + 6
    t0 = L['tokens'][L['anchor']][2] + 0.35
    span = min(nxt - 0.7 - t0, 0.55 * len(L['p2']))
    for k, x in enumerate(L['p2']): x.append(t0 + max(0.3, span) * k / max(1, len(L['p2'])))

_fixes(2)

# ---------- screens ----------
LEAD = 0.3
out = []
for L in LINES:
    vis = [[d, round(t, 2)] for d, n, t in L['tokens'] if d] + [[d, round(t, 2), 1] for d, n, t in L['p2']]
    out.append(dict(words=vis, show=round(vis[0][1] - LEAD, 2), sec=L['sec']))
for i, l in enumerate(out):
    nxt = out[i + 1]['show'] if i + 1 < len(out) else None
    last = l['words'][-1][1]
    l['hide'] = round(min(nxt, last + 4.0) if nxt else last + 3.5, 2)
    lim = l['hide'] - 0.35
    for row in (0, 1):
        idx = [j for j, w in enumerate(l['words']) if (w[2] if len(w) > 2 else 0) == row]
        n = len(idx)
        for q, j in enumerate(idx): l['words'][j][1] = round(min(l['words'][j][1], lim - 0.2 * (n - 1 - q)), 2)

chorus = []
for si, s in enumerate(secs):
    if 'chorus' in s['name'].lower():
        ls = [l for l in out if l['sec'] == si]
        a, b = ls[0]['words'][0][1], ls[-1]['words'][-1][1] + 1.0
        if chorus and a - chorus[-1][1] < 4: chorus[-1][1] = b
        else: chorus.append([round(a, 2), round(b, 2)])

# songs that start singing right away get a lead-in so the profile and title screens play first
PAD = round(max(0.0, 10.0 - out[0]["show"]), 2) if out[0]['show'] < 6.0 else 0.0
if PAD:
    for l in out:
        l['show'] = round(l['show'] + PAD, 2); l['hide'] = round(l['hide'] + PAD, 2)
        for w in l['words']: w[1] = round(w[1] + PAD, 2)
    chorus = [[round(a + PAD, 2), round(b + PAD, 2)] for a, b in chorus]
    DUR += PAD

sections = []
for si, s_ in enumerate(secs):
    ls = [l for l in out if l['sec'] == si]
    if ls: sections.append(dict(name=s_['name'], start=ls[0]['show'], end=ls[-1]['hide'],
                                chorus='chorus' in s_['name'].lower()))
import random as _r
first = out[0]['show']
pin = min(8.4, max(3.0, first * 0.45))
T = dict(duration=round(DUR, 2), audio_offset=PAD, song_title=title, template=A.template, seed=_r.randint(1, 10**9), sections=sections, photo=A.photo, photo_crop=crop, fade=0.3, chorus=chorus,
         profile_in=[0, pin], title_window=[pin + 0.2, max(pin + 3.0, first - 0.6)],
         profile_out=[out[-1]['hide'] + 0.3, round(DUR, 2)],
         lines=[{k: v for k, v in l.items() if k != 'sec'} for l in out])
json.dump(T, open(A.out, 'w'))

def fmt(t): return f'{int(t // 60)}:{t % 60:04.1f}'
if PAD: print(f'LEAD-IN: audio starts at {PAD}s in the video. Times below are VIDEO times; for --fix use song time = video time - {PAD}.')
for i, l in enumerate(out):
    print(f'{i + 1:3d} {fmt(l["words"][0][1])}  ' + ' '.join(w[0] if len(w) < 3 else '/' + w[0] for w in l['words']))
print('gold:', [[fmt(a), fmt(b)] for a, b in chorus])
