#!/usr/bin/env python3
"""Put cstack's type on a generated photograph: wordmark and two lines as FreeSans outlines.

Run from the repo root:
  python3 identity/work/figures/compose-imagery.py <photo.jpg> <out-stem> [--side left|right] [--ink dark|light]
Writes <out-stem>.svg (the type layer as outlined paths on the warm white ground, checkable with
`cstack svg legibility`) and <out-stem>.jpg (2400x1200; the same glyph outlines filled even-odd at 4x and downsampled).
Uses text() from make-figures.py, so the outlines are the same as every other cstack figure.
Needs fontTools, Pillow and GNU FreeSans (FREESANS_DIR)."""
import sys, pathlib
from PIL import Image, ImageDraw, ImageChops
from fontTools.pens.basePen import BasePen

HERE = pathlib.Path(__file__).resolve().parent
src = (HERE / 'make-figures.py').read_text().split('# ---------- the field and the figure')[0]
mf = {}; exec(compile(src, 'make-figures.py', 'exec'), mf)   # text(), colour tokens; no figures written
text, P, INK, BLUE, F = mf['text'], mf['P'], mf['INK'], mf['BLUE'], mf['F']
SS = 4  # supersampling for the raster

class Poly(BasePen):
    # glyph outline -> polylines (curves sampled), scaled into raster pixels
    def __init__(self, gs, sc, x, y):
        super().__init__(gs); self.sc, self.x, self.y, self.cs, self.c = sc, x, y, [], []
    def pt(self, p): return ((self.x + p[0] * self.sc) * SS, (self.y - p[1] * self.sc) * SS)
    def _moveTo(self, p): self.c = [self.pt(p)]; self.cs.append(self.c); self.last = p
    def _lineTo(self, p): self.c.append(self.pt(p)); self.last = p
    def _curveToOne(self, a, b, p):
        p0 = self.last
        for i in range(1, 13):
            t = i / 12; u = 1 - t
            self.c.append(self.pt(tuple(u**3*p0[k] + 3*u*u*t*a[k] + 3*u*t*t*b[k] + t**3*p[k] for k in (0, 1))))
        self.last = p
    def _qCurveToOne(self, a, p):
        p0 = self.last
        for i in range(1, 9):
            t = i / 8; u = 1 - t
            self.c.append(self.pt(tuple(u*u*p0[k] + 2*u*t*a[k] + t*t*p[k] for k in (0, 1))))
        self.last = p

def raster(mask, t, x, y, size, w='r', track=0):
    # same layout as make-figures text(): advance widths plus tracking, anchor start
    f = F[w]; gs = f.getGlyphSet(); cmap = f.getBestCmap(); sc = size / f['head'].unitsPerEm
    for c in t:
        n = cmap.get(ord(c), 'space'); pen = Poly(gs, sc, x, y); gs[n].draw(pen)
        for poly in pen.cs:
            if len(poly) > 2:
                m = Image.new('1', mask.size, 0); ImageDraw.Draw(m).polygon(poly, fill=1)
                mask.paste(ImageChops.logical_xor(mask, m))   # even-odd: counters stay open
        x += gs[n].width * sc + track

W, H = 2400, 1200          # 2:1 artboard; on a 1200 px display every run below stays >= 41 px
M = 120                    # outer margin, 1/20 of the width
COL = (W - 2 * M) / 12     # twelve-column grid; type sits on columns 1-5 (left) or 8-12 (right)

def compose(photo, stem, side='left', ink='dark'):
    fill = INK if ink == 'dark' else P
    im = Image.open(photo).convert('RGB')
    # cover-crop the photo to 2:1, then size to the artboard
    r = W / H; w, h = im.size
    if w / h > r: nw = round(h * r); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else: nh = round(w / r); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    im = im.resize((W, H), Image.LANCZOS)
    x = M if side == 'left' else M + 7 * COL
    mark, _ = text('cstack.', x, M + 190, 230, 'b', fill, track=-6)
    l1, _ = text('Taste, made repeatable.', x, H - M - 96, 84, 'r', fill)
    l2, _ = text('Before use: step outside.', x, H - M, 84, 'r', fill if ink == 'dark' else P)
    body = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="t">'
            f'<title id="t">cstack. Taste, made repeatable. Before use: step outside.</title>'
            f'<rect width="{W}" height="{H}" fill="{P}"/>' + mark + l1 + l2 + '</svg>')
    stem = pathlib.Path(stem)
    # the .svg is the type layer on the warm white ground, for `cstack svg legibility`; the .jpg is the composite
    stem.with_suffix('.svg').write_text(body)
    mask = Image.new('1', (W * SS, H * SS), 0)
    raster(mask, 'cstack.', x, M + 190, 230, 'b', -6)
    raster(mask, 'Taste, made repeatable.', x, H - M - 96, 84)
    raster(mask, 'Before use: step outside.', x, H - M, 84)
    a = mask.convert('L').resize((W, H), Image.LANCZOS)
    rgb = tuple(int(fill[i:i + 2], 16) for i in (1, 3, 5))
    im.paste(Image.new('RGB', (W, H), rgb), (0, 0), a)
    im.save(stem.with_suffix('.jpg'), quality=84, optimize=True, progressive=True)
    print('wrote', stem.with_suffix('.jpg'), stem.with_suffix('.svg'))

if __name__ == '__main__':
    a = sys.argv[1:]
    opt = lambda k, d: a[a.index(k) + 1] if k in a else d
    compose(a[0], a[1], opt('--side', 'left'), opt('--ink', 'dark'))
