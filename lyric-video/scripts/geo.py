"""Geometric background layers for Standard 2. Each returns an (H, W) float32 brightness layer (0..~255)."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

def _finish(lay, blur=1.6, glow=1.2):
    g = lay.filter(ImageFilter.GaussianBlur(blur * 2.5))
    return np.asarray(lay, np.float32) + glow * np.asarray(g, np.float32)

# ---------- A: floating wireframe shapes ----------
_PH = (1 + 5 ** 0.5) / 2
_SHAPES = {
    'tetra': ([(1, 1, 1), (1, -1, -1), (-1, 1, -1), (-1, -1, 1)], [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)]),
    'cube': ([(x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)],
             [(a, b) for a in range(8) for b in range(a + 1, 8) if bin(a ^ b).count('1') == 1]),
    'octa': ([(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)],
             [(a, b) for a in range(6) for b in range(a + 1, 6) if a // 2 != b // 2]),
}
_rng = np.random.default_rng(11)
_NA = 46
_A_kind = _rng.choice(list(_SHAPES), _NA)
_A_x = _rng.uniform(-1.7, 1.7, _NA); _A_y = _rng.uniform(-1.0, 1.0, _NA)
_A_z0 = _rng.uniform(0, 0.95, _NA); _A_s = _rng.uniform(0.05, 0.11, _NA)
_A_r = _rng.uniform(0, 6.28, (_NA, 3)); _A_w = _rng.uniform(-1, 1, (_NA, 3))

def _rot(p, a, b, c):
    x, y, z = p
    y, z = y * math.cos(a) - z * math.sin(a), y * math.sin(a) + z * math.cos(a)
    x, z = x * math.cos(b) + z * math.sin(b), -x * math.sin(b) + z * math.cos(b)
    x, y = x * math.cos(c) - y * math.sin(c), x * math.sin(c) + y * math.cos(c)
    return x, y, z

def wireframe(W, H, t, travel, angle, e):
    lay = Image.new('L', (W, H), 0); d = ImageDraw.Draw(lay)
    F = 560.0 * W / 1920
    z = 0.06 + np.mod(_A_z0 - travel * 0.8, 0.95)
    for k in np.argsort(-z):
        verts, edges = _SHAPES[_A_kind[k]]
        spin = t * 0.25 * (1 + 2.5 * e)
        rx, ry, rz = _A_r[k] + _A_w[k] * spin
        ca, sa = math.cos(angle), math.sin(angle)
        cx0 = _A_x[k] * ca - _A_y[k] * sa; cy0 = _A_x[k] * sa + _A_y[k] * ca
        pts = []
        for v in verts:
            x, y, zz = _rot(v, rx, ry, rz)
            pz = z[k] + zz * _A_s[k] * 0.6
            pz = max(pz, 0.03)
            pts.append((W / 2 + (cx0 + x * _A_s[k]) / pz * F, H / 2 + (cy0 + y * _A_s[k]) / pz * F))
        fade = min(1, (1 - z[k]) / 0.3) * min(1, max(0, z[k] - 0.1) / 0.15)
        b = int(150 * fade * min(1, 0.35 / z[k]))
        if b < 5: continue
        for a_, b_ in edges:
            d.line([pts[a_], pts[b_]], fill=b, width=1 if z[k] > 0.3 else 2)
    return _finish(lay)

# ---------- B: geometric tunnel ----------
def tunnel(W, H, t, travel, angle, e, sides=6, rings=22):
    lay = Image.new('L', (W, H), 0); d = ImageDraw.Draw(lay)
    F = 300.0 * W / 1920
    spacing = 1.0 / rings
    off = (travel * 2.2) % spacing
    prev = None
    for k in range(rings, 0, -1):
        z = k * spacing - off + 0.02
        twist = angle * 2.2 + k * (0.05 + 0.10 * e)
        R = 1.0 / z * F
        pts = [(W / 2 + R * math.cos(twist + j * 2 * math.pi / sides) * 1.25,
                H / 2 + R * math.sin(twist + j * 2 * math.pi / sides)) for j in range(sides)]
        b = int(130 * min(1, (1.0 - z) / 0.35) * min(1, 0.25 / z + 0.2))
        d.line(pts + [pts[0]], fill=b, width=1 if z > 0.25 else 2)
        if prev:
            for j in range(sides): d.line([prev[j], pts[j]], fill=int(b * 0.55), width=1)
        prev = pts
    return _finish(lay)

# ---------- C: sacred geometry rings ----------
def sacred(W, H, t, travel, angle, e):
    lay = Image.new('L', (W, H), 0); d = ImageDraw.Draw(lay)
    cx, cy = W / 2, H / 2; S = W / 1920
    breathe = 1 + 0.04 * math.sin(t * 0.4) + 0.10 * e
    base = 150 * S * breathe
    # flower of life
    a0 = angle * 1.5 + t * 0.02
    for ring, n in ((0, 1), (1, 6), (2, 12)):
        for j in range(n):
            if ring == 0: px, py = cx, cy
            else:
                ang = a0 + j * 2 * math.pi / n + (math.pi / n if ring == 2 else 0)
                rr = base * (ring if ring == 1 else math.sqrt(3))
                px, py = cx + rr * math.cos(ang), cy + rr * math.sin(ang)
            d.ellipse([px - base, py - base, px + base, py + base], outline=70, width=1)
    # rotating polygons at several radii
    for i, (n, r, sp) in enumerate(((3, 3.2, 1.0), (6, 3.6, -0.6), (12, 4.4, 0.4), (4, 5.4, -0.3), (8, 6.4, 0.2))):
        a = a0 * sp * 2 + t * 0.03 * sp
        pts = [(cx + base * r * math.cos(a + j * 2 * math.pi / n), cy + base * r * math.sin(a + j * 2 * math.pi / n)) for j in range(n)]
        d.line(pts + [pts[0]], fill=90 - i * 8, width=1)
        if n >= 6:
            star = [pts[(j * (n // 2 - 1)) % n] for j in range(n + 1)]
            d.line(star, fill=45, width=1)
    for r in (2.0, 3.2, 4.4, 5.4, 6.4):
        R = base * r; d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=50, width=1)
    return _finish(lay, blur=1.2, glow=1.4)

# ---------- D: low-poly triangle field ----------
_GX, _GY = 26, 16
_rng2 = np.random.default_rng(5)
_JX = _rng2.uniform(-0.35, 0.35, (_GY + 1, _GX + 1)); _JY = _rng2.uniform(-0.35, 0.35, (_GY + 1, _GX + 1))
_PHS = _rng2.uniform(0, 6.28, (_GY + 1, _GX + 1))

def lowpoly(W, H, t, travel, angle, e):
    lay = Image.new('L', (W, H), 0); d = ImageDraw.Draw(lay)
    cw, ch = W / (_GX - 2), H / (_GY - 2)
    tt = travel * 30
    P = np.zeros((_GY + 1, _GX + 1, 2))
    for r in range(_GY + 1):
        for c in range(_GX + 1):
            wob = 0.18 * math.sin(tt * 0.9 + _PHS[r, c])
            P[r, c] = ((c - 1 + _JX[r, c] + wob) * cw, (r - 1 + _JY[r, c] + 0.18 * math.cos(tt * 0.7 + _PHS[r, c])) * ch)
    lx = W / 2 + W * 0.45 * math.cos(tt * 0.12 + angle * 3); ly = H / 2 + H * 0.35 * math.sin(tt * 0.09)
    for r in range(_GY):
        for c in range(_GX):
            for tri in ((P[r, c], P[r, c + 1], P[r + 1, c]), (P[r, c + 1], P[r + 1, c + 1], P[r + 1, c])):
                mx = sum(p[0] for p in tri) / 3; my = sum(p[1] for p in tri) / 3
                dist = math.hypot((mx - lx) / W, (my - ly) / H)
                shade = 10 + 34 * math.exp(-(dist / 0.32) ** 2) + 6 * math.sin(_PHS[r, c] + tt * 0.5)
                d.polygon([tuple(p) for p in tri], fill=int(max(0, shade)), outline=int(max(0, shade + 22)))
    return _finish(lay, blur=0.8, glow=0.5)

STYLES = {'wireframe': wireframe, 'tunnel': tunnel, 'sacred': sacred, 'lowpoly': lowpoly}
