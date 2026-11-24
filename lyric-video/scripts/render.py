import sys, json, math, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

W, H, FPS = 1920, 1080, 30
FONT = '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf'
FONT_M = '/usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf'


T = json.load(open(sys.argv[2] if sys.argv[1] == 'still' else sys.argv[5]))
DUR = T['duration']
LINES = T['lines']          # [{words:[[text,start],...], show, hide}]
CHORUS = T['chorus']        # [[start,end],...]
PROFILE_IN = T['profile_in']   # [start,end] opening profile
TITLE = T['title_window']
PROFILE_OUT = T['profile_out'] # [start,end]

def smooth(x):
    x = min(1.0, max(0.0, x));  return x * x * (3 - 2 * x)

def window(t, a, b, fin, fout):
    if t < a or t > b: return 0.0
    return smooth((t - a) / fin) * smooth((b - t) / fout)

# ---------- speed / travel ----------
NF = int(math.ceil(DUR * FPS)) + 1
BASE_V = 0.95 / 34.0
def chorus_env(t):
    e = 0.0
    for a, b in CHORUS:
        e = max(e, window(t, a - 0.8, b + 1.5, 1.5, 3.0))
    return e
ENV = np.array([chorus_env(i / FPS) for i in range(NF)])
speeds = BASE_V * (1 + 1.4 * ENV)
travel = np.concatenate([[0], np.cumsum(speeds) / FPS])
SPIN = math.radians(7.0)   # deg per second at full chorus
angle = np.concatenate([[0], np.cumsum(SPIN * ENV) / FPS])

# ---------- background base ----------
def make_base(top=(10, 14, 26), bot=(20, 26, 42), glowc=(26, 32, 52), linec=(150, 170, 210), bokc=(120, 140, 190), streakc=(0.8, 0.85, 1.0)):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W / 2, H / 2
    r = np.sqrt(((xx - cx) / W) ** 2 + ((yy - cy) / H) ** 2)
    top = np.array(top, np.float32); bot = np.array(bot, np.float32)
    g = top + (bot - top) * (yy / H)[..., None]
    glow = np.exp(-(r / 0.38) ** 2)[..., None] * np.array(glowc, np.float32)
    vig = (1 - 0.65 * np.clip(r / 0.75, 0, 1) ** 2)[..., None]
    img = (g + glow) * vig
    base = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    # faint radial lines and geometric wireframe like the sample
    ov = Image.new('L', (W, H), 0); d = ImageDraw.Draw(ov)
    rng = np.random.default_rng(7)
    for k in range(70):
        a = rng.uniform(0, 2 * math.pi); r0 = rng.uniform(80, 300)
        d.line([(cx + r0 * math.cos(a), cy + r0 * math.sin(a)),
                (cx + 1600 * math.cos(a), cy + 1600 * math.sin(a))], fill=int(rng.uniform(8, 22)), width=1)
    tri = [(cx, cy - 330), (cx - 520, cy + 300), (cx + 520, cy + 300)]
    for s in (1.0, 0.72, 0.5):
        pts = [(cx + (x - cx) * s, cy + (y - cy) * s) for x, y in tri]
        d.line(pts + [pts[0]], fill=18, width=1)
        for p in pts: d.line([p, (cx, cy + 40)], fill=12, width=1)
    ov = ov.filter(ImageFilter.GaussianBlur(0.6))
    base = Image.composite(Image.new('RGB', (W, H), linec), base, ov)
    # soft bokeh
    bk = Image.new('L', (W, H), 0); d = ImageDraw.Draw(bk)
    for k in range(14):
        x, y, rr = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(60, 170)
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=int(rng.uniform(6, 14)))
    bk = bk.filter(ImageFilter.GaussianBlur(30))
    base = Image.composite(Image.new('RGB', (W, H), bokc), base, bk)
    # horizontal lens streak
    st = np.zeros((H, W), np.float32)
    st += np.exp(-((yy - cy) / 5) ** 2) * np.exp(-((xx - cx) / 520) ** 2) * 60
    st += np.exp(-((yy - cy) / 22) ** 2) * np.exp(-((xx - cx) / 260) ** 2) * 25
    arr = np.asarray(base).astype(np.float32) + st[..., None] * np.array(streakc)
    return np.clip(arr, 0, 255).astype(np.float32)

TEMPLATE = T.get('template', 'standard1')
if TEMPLATE == 'standard2': TEMPLATE = 'geo:lowpoly'
if TEMPLATE.startswith('geo:'):
    sys.path.insert(0, '/home/claude/lyricvid'); import geo
    GEO = geo.STYLES[TEMPLATE.split(':', 1)[1]]
else:
    GEO = None
PHOTO_BG = None
_yy, _xx = np.mgrid[0:H, 0:W].astype(np.float32)
GEO_VIG = (1 - 0.6 * np.clip(np.sqrt(((_xx - W / 2) / W) ** 2 + ((_yy - H / 2) / H) ** 2) / 0.75, 0, 1) ** 2)[..., None]
BASE = make_base()
GOLD = make_base(top=(22, 10, 4), bot=(48, 22, 8), glowc=(120, 62, 18), linec=(235, 180, 110),
                 bokc=(230, 150, 70), streakc=(1.0, 0.78, 0.45))

if TEMPLATE in ('canyon', 'ocean'):
    sys.path.insert(0, '/home/claude/lyricvid'); import photobg
    PHOTO_BG = (photobg.Canyon if TEMPLATE == 'canyon' else photobg.Ocean)(W, H, T)

rng = np.random.default_rng(3)
NS = 1600
SX = rng.uniform(-1, 1, NS) * 1.6
SY = rng.uniform(-1, 1, NS) * 0.95
Z0 = rng.uniform(0, 0.95, NS)
SB = rng.uniform(0.35, 1.0, NS)
F = 560.0

def stars(i):
    D = travel[i]; Dp = travel[max(0, i - 2)]
    z = 0.05 + np.mod(Z0 - D, 0.95)
    zp = z + (D - Dp)
    th = angle[i]; thp = angle[max(0, i - 2)]
    c, sn = math.cos(th), math.sin(th); cp, sp = math.cos(thp), math.sin(thp)
    RX, RY = SX * c - SY * sn, SX * sn + SY * c
    PX, PY = SX * cp - SY * sp, SX * sp + SY * cp
    x = W / 2 + RX / z * F; y = H / 2 + RY / z * F
    xp = W / 2 + PX / zp * F; yp = H / 2 + PY / zp * F
    ok = (x > -50) & (x < W + 50) & (y > -50) & (y < H + 50) & (zp < 1.0)
    fade = np.clip((1.0 - z) / 0.25, 0, 1)            # fade in from far
    br = SB * fade * np.clip(0.25 / z, 0.15, 1.0)
    sz = np.clip(0.9 / z, 0.6, 3.2)
    lay = Image.new('L', (W, H), 0); d = ImageDraw.Draw(lay)
    for k in np.nonzero(ok)[0]:
        b = int(255 * br[k]); s = sz[k]
        if b < 6: continue
        if math.hypot(x[k] - xp[k], y[k] - yp[k]) > 2.5:
            d.line([(xp[k], yp[k]), (x[k], y[k])], fill=int(b * 0.8), width=max(1, int(s * 0.8)))
        d.ellipse([x[k] - s / 2, y[k] - s / 2, x[k] + s / 2, y[k] + s / 2], fill=b)
    g = lay.filter(ImageFilter.GaussianBlur(2.2))
    a = np.asarray(lay, np.float32) + 1.4 * np.asarray(g, np.float32)
    return a

# ---------- text ----------
FS = 100
font = ImageFont.truetype(FONT, FS)
TRACK = 3
MAXW = 1500
LINE_H = int(FS * 1.18)
PADX, PADY, BORDER = 70, 44, 6

PAD = 34
def word_img(text, fnt=font, track=TRACK, pad=0):
    w = sum(fnt.getlength(c) for c in text) + track * (len(text) - 1)
    asc, desc = fnt.getmetrics()
    im = Image.new('L', (int(w) + 4 + 2 * pad, asc + desc + 4 + 2 * pad), 0); d = ImageDraw.Draw(im)
    x = 2 + pad
    for c in text:
        d.text((x, 2 + pad), c, font=fnt, fill=255); x += fnt.getlength(c) + track
    return im

SPACE = font.getlength(' ') + 10

def layout_line(L):
    words = [(w.upper(), t) for w, t in L['words']]
    imgs = [word_img(w, pad=PAD) for w, _ in words]
    IW = [im.width - 2 * PAD for im in imgs]
    n = len(imgs); tot = sum(IW) + SPACE * (n - 1)
    if tot <= MAXW or n == 1:
        rows = [list(range(n))]
    else:
        best = None
        for c in range(1, n):
            a = sum(IW[:c]) + SPACE * (c - 1); b = sum(IW[c:]) + SPACE * (n - c - 1)
            cost = max(a, b) - (160 if words[c][0].strip(',').lower() in ('and','but','for','from','at','into','will','are','to','yes') else 0)
            if best is None or cost < best[0]: best = (cost, c)
        rows = [list(range(best[1])), list(range(best[1], n))]
    rw = [sum(IW[k] for k in r) + SPACE * (len(r) - 1) for r in rows]
    bw = max(rw) + 2 * PADX; bh = LINE_H * len(rows) + 2 * PADY - int(FS * 0.18)
    bx = (W - bw) // 2; by = (H - bh) // 2
    pos = [None] * len(imgs)
    for ri, r in enumerate(rows):
        x = (W - rw[ri]) / 2; y = by + PADY + ri * LINE_H - int(FS * 0.12)
        for k in r:
            pos[k] = (int(x) - PAD, int(y) - PAD); x += IW[k] + SPACE
    glows = [im.filter(ImageFilter.GaussianBlur(13)) for im in imgs]
    return dict(imgs=imgs, glows=glows, pos=pos, starts=[t for _, t in words],
                box=(bx, by, bx + bw, by + bh), show=L['show'], hide=L['hide'])

LAY = [layout_line(L) for L in LINES]

def text_layer(t):
    lay = np.zeros((H, W), np.float32); glow = np.zeros((H, W), np.float32)
    for L in LAY:
        if t < L['show'] - 0.01 or t > L['hide'] + 0.01: continue
        la = window(t, L['show'], L['hide'], T['fade'], T['fade'])
        if la <= 0: continue
        bx0, by0, bx1, by1 = L['box']
        bimg = Image.new('L', (W, H), 0)
        ImageDraw.Draw(bimg).rectangle([bx0, by0, bx1, by1], outline=255, width=BORDER)
        lay = np.maximum(lay, np.asarray(bimg, np.float32) * la * 0.92)
        for im, gl, (x, y), st in zip(L['imgs'], L['glows'], L['pos'], L['starts']):
            wa = smooth((t - (st - 0.12)) / 0.45) * la
            if wa <= 0: continue
            a = np.asarray(im, np.float32) * wa
            sl = (slice(y, y + im.height), slice(x, x + im.width))
            lay[sl] = np.maximum(lay[sl], a)
            glow[sl] = np.maximum(glow[sl], np.asarray(gl, np.float32) * wa)
    return lay, glow

# title + profile cards
def title_card():
    sz = 132
    while True:
        f2 = ImageFont.truetype(FONT, sz); im = word_img(T['song_title'].upper(), f2, 6)
        if im.width <= 1500 or sz <= 60: break
        sz -= 6
    bw, bh = im.width + 2 * 95, im.height + 2 * 50
    L = Image.new('L', (W, H), 0)
    bx, by = (W - bw) // 2, (H - bh) // 2 - 30
    ImageDraw.Draw(L).rectangle([bx, by, bx + bw, by + bh], outline=255, width=7)
    L.paste(im, (bx + 95, by + 50 - 2), im)
    f3 = ImageFont.truetype(FONT_M, 34)
    s = word_img('WEST COAST REVIVAL', f3, 10)
    L.paste(Image.new('L', s.size, 200), ((W - s.width) // 2, by + bh + 44), s)
    return np.asarray(L, np.float32)

TITLE_L = title_card()
TITLE_G = np.asarray(Image.fromarray(TITLE_L.astype(np.uint8)).filter(ImageFilter.GaussianBlur(16)), np.float32)

def profile_card():
    ph = Image.open(T['photo']).convert('RGB')
    if T.get('photo_crop'): ph = ph.crop(tuple(T['photo_crop']))
    tw = 540; th = int(ph.height * tw / ph.width)
    ph = ph.resize((tw, th), Image.LANCZOS)
    px = 300; py = (H - th) // 2
    rgb = np.zeros((H, W, 3), np.float32); a = np.zeros((H, W), np.float32)
    sh = Image.new('L', (W, H), 0)
    ImageDraw.Draw(sh).rectangle([px + 10, py + 18, px + tw + 10, py + th + 18], fill=170)
    sh = np.asarray(sh.filter(ImageFilter.GaussianBlur(24)), np.float32) / 255
    rgb[py:py + th, px:px + tw] = np.asarray(ph, np.float32); a[py:py + th, px:px + tw] = 1
    fr = Image.new('L', (W, H), 0)
    ImageDraw.Draw(fr).rectangle([px - 12, py - 12, px + tw + 12, py + th + 12], outline=255, width=3)
    f3 = ImageFont.truetype(FONT, 76)
    s1 = word_img('WEST COAST', f3, 8); s2 = word_img('REVIVAL', f3, 8)
    cx = (px + tw + 40 + W - 120) // 2; cy = H // 2
    txt = Image.new('L', (W, H), 0)
    txt.paste(s1, (cx - s1.width // 2, cy - s1.height - 6), s1)
    txt.paste(s2, (cx - s2.width // 2, cy + 6), s2)
    rule = Image.new('L', (W, H), 0)
    ImageDraw.Draw(rule).line([(cx - 60, cy + s2.height + 40), (cx + 60, cy + s2.height + 40)], fill=200, width=3)
    txt = np.maximum(np.maximum(np.asarray(txt, np.float32), np.asarray(fr, np.float32) * 0.85), np.asarray(rule, np.float32))
    return rgb, a, sh, txt

P_RGB, P_A, P_SH, P_TXT = profile_card()
P_G = np.asarray(Image.fromarray(P_TXT.astype(np.uint8)).filter(ImageFilter.GaussianBlur(12)), np.float32)
WHITE = np.array([246, 248, 255], np.float32)

def frame(i):
    t = i / FPS
    e = ENV[min(i, NF - 1)]
    if PHOTO_BG is not None:
        img = PHOTO_BG.frame(t, e)
    elif GEO is not None:   # Standard 2: geometric layer is the whole background
        L = GEO(W, H, t, travel[i], angle[i], e)[..., None]
        verse = np.array([8, 12, 22], np.float32) + L * np.array([0.5, 0.72, 1.2], np.float32)
        gold = np.array([26, 13, 5], np.float32) + L * np.array([1.55, 0.95, 0.42], np.float32)
        img = (verse * (1 - e) + gold * e) * GEO_VIG
    else:
        img = BASE * (1 - e) + GOLD * e if e > 0 else BASE.copy()
        s = stars(i) if GEO is None else GEO(W, H, t, travel[i], angle[i], e) + 0.3 * stars(i)
        tint = np.array([0.85, 0.9, 1.0]) * (1 - e) + np.array([1.0, 0.88, 0.62]) * e
        img += s[..., None] * tint * 0.9
    tl, tg = text_layer(t)
    ta = window(t, TITLE[0], TITLE[1], 1.2, 1.2)
    if ta > 0:
        tl = np.maximum(tl, TITLE_L * ta); tg = np.maximum(tg, TITLE_G * ta)
    for a_, b_ in (PROFILE_IN, PROFILE_OUT):
        pa = window(t, a_, b_, 1.5, 1.5)
        if pa > 0:
            img *= (1 - 0.6 * P_SH * pa)[..., None]
            m = (P_A * pa)[..., None]
            img = img * (1 - m) + P_RGB * m
            tl = np.maximum(tl, P_TXT * pa); tg = np.maximum(tg, P_G * pa)
    img += (tg * 0.35)[..., None] * (np.array([0.75, 0.85, 1.0]) * (1 - e) + np.array([1.0, 0.8, 0.5]) * e)
    m = (tl / 255)[..., None]
    img = img * (1 - m) + WHITE * m
    # global fade from/to black
    g = smooth(t / 1.5) * smooth((DUR - t) / 2.5)
    img *= g
    return np.clip(img, 0, 255).astype(np.uint8)

if __name__ == '__main__':
    # still TIMELINE OUTDIR t1 t2 ...   |   video A B OUT TIMELINE [preview]
    mode = sys.argv[1]
    if mode == 'still':
        for ts in sys.argv[4:]:
            Image.fromarray(frame(int(float(ts) * FPS))).save(f"{sys.argv[3]}/still_{ts}.jpg", quality=90)
    else:
        a, b, out = int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
        prev = len(sys.argv) > 6 and sys.argv[6] == 'preview'
        step = 3 if prev else 1
        vf = ['-vf', 'scale=960:540'] if prev else []
        crf = '28' if prev else '18'
        p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
                              '-r', str(FPS // step), '-i', '-'] + vf + ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf,
                              '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
        for i in range(a, min(b, NF - 1), step):
            p.stdin.write(frame(i).tobytes())
        p.stdin.close(); sys.exit(p.wait())
