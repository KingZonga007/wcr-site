"""Photo and video backgrounds for the Canyon and Ocean templates.

Canyon: stills, slow Ken Burns. canyon_V*.jpg for verses/bridges/interludes, canyon_CH*.jpg for choruses.
Ocean: slow-motion clips, chosen at random (seeded by song title) and crossfaded.
Both are graded to the same dark look so the white box and words pop.
"""
import os, glob, math, random, subprocess
import numpy as np
from PIL import Image

MEDIA = '/home/claude/lyricvid/media'
XF = 1.6            # crossfade seconds
TARGET = 62.0       # target mean luma (0-255) after grading, verses
LIFT = 0.14         # chorus: +14% brightness
WARM = np.array([1.06, 1.0, 0.9], np.float32)

def _vignette(W, H):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / W) ** 2 + ((yy - H / 2) / H) ** 2)
    return (1 - 0.55 * np.clip(r / 0.72, 0, 1) ** 2)[..., None]

def _scrim(W, H):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    g = np.exp(-((xx - W / 2) / (0.42 * W)) ** 2 - ((yy - H / 2) / (0.24 * H)) ** 2)
    return (1 - 0.38 * g)[..., None]

def _rolloff(a, knee=115.0, slope=0.42):
    return np.where(a > knee, knee + (a - knee) * slope, a)

def _grade_gain(arr):
    l = (arr[..., 0] * 0.299 + arr[..., 1] * 0.587 + arr[..., 2] * 0.114).mean()
    return TARGET / max(l, 1.0)

def _desat(a, amt=0.82):
    l = (a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114)[..., None]
    return l + (a - l) * amt

def _regions(T):
    """one region per lyric section (changes land just before each section's first line);
    long sections split once at a line boundary. Returns [(a, b, is_chorus)]."""
    D = T['duration']; secs = T.get('sections') or []
    if not secs:
        return [(0.0, D, False)]
    LEAD = 1.2
    starts = [max(0.0, s['start'] - LEAD) for s in secs]
    regs = []
    if starts[0] > 6.0: regs.append((0.0, starts[0], False))
    else: starts[0] = 0.0
    for k, s in enumerate(secs):
        a = starts[k]; b = starts[k + 1] if k + 1 < len(secs) else D
        regs.append((a, b, bool(s['chorus'])))
    out = []
    shows = [l['show'] for l in T['lines']]
    for a, b, ch in regs:
        if b - a > 44:
            mid = (a + b) / 2
            cand = [x - LEAD for x in shows if a + 16 < x - LEAD < b - 16]
            if cand:
                m = min(cand, key=lambda x: abs(x - mid))
                out += [(a, m, ch), (m, b, ch)]; continue
        out.append((a, b, ch))
    return out

class _Cycle:
    """hands out every item once (shuffled) before any repeats; never the same item twice in a row"""
    def __init__(self, items, rnd):
        self.items, self.rnd, self.q, self.last = list(items), rnd, [], None
    def _refill(self):
        q = self.items[:]; self.rnd.shuffle(q)
        if len(q) > 1 and q[0] == self.last: q.append(q.pop(0))
        self.q = q
    def take(self, ok=lambda x: True):
        if not self.q: self._refill()
        for i, x in enumerate(self.q):
            if ok(x): self.last = self.q.pop(i); return self.last, True
        x = self.q.pop(0); self.last = x; return x, False

class Canyon:
    def __init__(self, W, H, T):
        self.W, self.H = W, H
        V = sorted(glob.glob(f'{MEDIA}/canyon/canyon_V*.jpg'))
        C = sorted(glob.glob(f'{MEDIA}/canyon/canyon_CH*.jpg'))
        self.imgs = {}
        for p in V + C:
            im = Image.open(p).convert('RGB')
            a = np.asarray(im, np.float32)
            g = _grade_gain(a)
            a = np.clip(_desat(a) * g, 0, 255).astype(np.uint8)
            self.imgs[p] = Image.fromarray(a)
        rnd = random.Random(T.get('seed', 1))
        cv, cc = _Cycle(V, rnd), _Cycle(C or V, rnd)
        self.shots = []
        for a, b, ch in _regions(T):
            p, _ = (cc if ch else cv).take()
            self.shots.append(dict(a=a, b=b, p=p, zin=rnd.random() < 0.5,
                                   pan=(rnd.uniform(-0.04, 0.04), rnd.uniform(-0.03, 0.03)), ch=ch))
        self.vig = _vignette(W, H) * _scrim(W, H)

    def _render(self, s, t):
        im = self.imgs[s['p']]; SW, SH = im.size
        u = (t - s['a']) / max(0.1, s['b'] - s['a'] + XF)
        u = min(1, max(0, u))
        rate = 0.10 if s['ch'] else 0.07
        z = 1.0 + rate * (u if s['zin'] else 1 - u)
        cw = SW / z * 0.96; chh = cw * 9 / 16
        cx = SW / 2 + s['pan'][0] * SW * (u - 0.5); cy = SH / 2 + s['pan'][1] * SH * (u - 0.5)
        box = (cx - cw / 2, cy - chh / 2, cx + cw / 2, cy + chh / 2)
        return np.asarray(im.resize((self.W, self.H), Image.BILINEAR, box=box), np.float32)

    def frame(self, t, e):
        img = None
        for s in self.shots:
            if s['a'] - 0.01 <= t < s['b'] + XF:
                a = self._render(s, t)
                if img is None: img = a
                else:
                    w = min(1, max(0, (t - s['a']) / XF)); w = w * w * (3 - 2 * w)
                    img = img * (1 - w) + a * w
        if img is None: img = self._render(self.shots[-1], t)
        img = _rolloff(img) * self.vig * (1 + LIFT * e)
        return img * (1 + (WARM - 1) * e)

class _Reader:
    def __init__(self, path, ss, W, H, slow=1.0, loop=False):
        self.W, self.H = W, H
        vf = ['-vf', f'setpts={slow:.4f}*PTS'] if slow > 1.001 else []
        lp = ['-stream_loop', '-1'] if loop else []
        self.p = subprocess.Popen(['ffmpeg', '-v', 'error'] + lp + ['-ss', f'{ss:.3f}', '-i', path] + vf + ['-f', 'rawvideo',
                                   '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '30', '-'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        self.last = None
    def read(self):
        b = self.p.stdout.read(self.W * self.H * 3)
        if len(b) == self.W * self.H * 3:
            self.last = np.frombuffer(b, np.uint8).reshape(self.H, self.W, 3)
        return self.last
    def close(self):
        try: self.p.kill()
        except Exception: pass

def _dur(p):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p],
                                capture_output=True, text=True).stdout.strip())

class Ocean:
    def __init__(self, W, H, T):
        self.W, self.H = W, H
        clips = sorted(glob.glob(f'{MEDIA}/ocean/*.mp4'))
        self.dur = {c: _dur(c) for c in clips}
        # one grade gain per clip from a middle frame
        self.gain = {}
        for c in clips:
            r = _Reader(c, self.dur[c] / 2, 320, 180); f = r.read(); r.close()
            self.gain[c] = _grade_gain(f.astype(np.float32))
        rnd = random.Random(T.get('seed', 1))
        cyc = _Cycle(clips, rnd)
        self.shots = []
        for a, b, ch in _regions(T):
            need = b - a + XF + 0.2
            c, fits = cyc.take(lambda c: (self.dur[c] - 0.3) * 1.5 >= need)
            span = self.dur[c] - 0.3
            if fits:
                slow = max(1.0, need / span)
                ss = 0.0 if slow > 1.0 else rnd.uniform(0, span - need)
                self.shots.append(dict(a=a, b=b, c=c, ss=ss, ch=ch, slow=slow, loop=False))
            else:
                # clip too short for this section: play it through, then dissolve back to its start
                n = math.ceil((b - a) / (span * 1.5 - XF - 0.2))
                L = (b - a) / n
                for j in range(n):
                    self.shots.append(dict(a=a + j * L, b=a + (j + 1) * L, c=c, ss=0.0, ch=ch,
                                           slow=max(1.0, (L + XF + 0.2) / span), loop=False))
        self.vig = _vignette(W, H) * _scrim(W, H)
        self.readers = {}

    def _get(self, k, t):
        s = self.shots[k]
        if k not in self.readers:
            self.readers[k] = [_Reader(s['c'], s['ss'] + max(0, t - s['a']) / s['slow'], self.W, self.H, s['slow'], s['loop']), t]
        r = self.readers[k]
        # advance to time t (frames at 30 fps)
        f = r[0].last
        while r[1] <= t + 1e-6:
            f = r[0].read(); r[1] += 1 / 30
        if f is None: f = r[0].read()
        a = _desat(f.astype(np.float32)) * self.gain[s['c']]
        return a

    def frame(self, t, e):
        img = None
        act = [k for k, s in enumerate(self.shots) if s['a'] - 0.01 <= t < s['b'] + XF]
        for k in list(self.readers):
            if k not in act: self.readers[k][0].close(); del self.readers[k]
        for k in act:
            s = self.shots[k]; a = self._get(k, t)
            if img is None: img = a
            else:
                w = min(1, max(0, (t - s['a']) / XF)); w = w * w * (3 - 2 * w)
                img = img * (1 - w) + a * w
        img = _rolloff(img) * self.vig * (1 + LIFT * e)
        return img * (1 + (WARM - 1) * e)
