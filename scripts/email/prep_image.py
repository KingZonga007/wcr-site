#!/usr/bin/env python3
"""Make an email-safe JPG from any site photo.

Outlook and some other mail apps can't show .webp, so photos used in emails
live as JPGs in public/img/email/ and are referenced as /img/email/<name>.jpg.

  python3 scripts/email/prep_image.py public/img/band-best-1600.webp band
  -> public/img/email/band.jpg (1200px wide, for a 600px email at 2x)

Needs Pillow (pip install pillow).
"""
import argparse
import os
import sys

from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(REPO, 'public', 'img', 'email')
CREAM = (244, 239, 230)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('src', help='source image (webp, png, jpg)')
    p.add_argument('name', nargs='?', help='output name without extension (default: source name)')
    p.add_argument('--width', type=int, default=1200, help='max width in pixels (default 1200)')
    args = p.parse_args()

    name = args.name or os.path.splitext(os.path.basename(args.src))[0]
    img = Image.open(args.src)
    if img.mode in ('RGBA', 'LA', 'P'):
        img = img.convert('RGBA')
        flat = Image.new('RGB', img.size, CREAM)
        flat.paste(img, mask=img.split()[-1])
        img = flat
    else:
        img = img.convert('RGB')
    if img.width > args.width:
        img = img.resize((args.width, round(img.height * args.width / img.width)), Image.LANCZOS)

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f'{name}.jpg')
    img.save(out, 'JPEG', quality=82, optimize=True, progressive=True)
    kb = os.path.getsize(out) // 1024
    print(f'Wrote {os.path.relpath(out, REPO)} ({img.width}x{img.height}, {kb} KB). Use it as /img/email/{name}.jpg')


if __name__ == '__main__':
    sys.exit(main())
