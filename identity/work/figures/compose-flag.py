#!/usr/bin/env python3
"""Put a photograph inside the flag poster's square (identity/work/posters/2026-10-03-r4/01-flag.svg).

Run from the repo root: python3 identity/work/figures/compose-flag.py <flag.png> <photo.jpg> <out.jpg>
The square is at columns 2 to 5 of the twelve-column grid (x 232, y 146, 300 px on the 1200x640 artboard); the
photograph is cover-cropped to it. The type and the ground stay vector; only the picture is raster."""
import sys
from PIL import Image
flag, photo, out = sys.argv[1:4]
F = Image.open(flag).convert('RGB'); P = Image.open(photo).convert('RGB')
x, y, a = 232, 146, 300
w, h = P.size; s = min(w, h); P = P.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((a, a), Image.LANCZOS)
F.paste(P, (x, y)); F.save(out, quality=92); print(out)
