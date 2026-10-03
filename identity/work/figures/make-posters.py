#!/usr/bin/env python3
"""cstack's poster set: the blue square as the symbol, in the Swiss poster register.

Run from the repo root: python3 identity/work/figures/make-posters.py [out-dir]
Writes one SVG per poster (default identity/work/posters/2026-10-03/). Type is FreeSans outlines via
text() from make-figures.py, so every poster passes `cstack svg legibility` and ships no font.

The system (identity/brand/brand-system.json#layout, #graphic_devices.square):
- one artboard family: 1200x640 for the README and docs, 1200x1200 for a social card
- a twelve-column grid, margin 48, everything flush left
- three type sizes only: display 300, head 64, text 44 (44 is the smallest run that reads at a 324 px phone column)
- two inks on warm white: ink #151515 and Klein blue #002FA7; the blue is spent on the square and nothing else
- one move per poster"""
import pathlib, sys
HERE = pathlib.Path(__file__).resolve().parent
src = (HERE / 'make-figures.py').read_text().split('# ---------- the field and the figure')[0]
mf = {}; exec(compile(src, 'make-figures.py', 'exec'), mf)
text, P, INK, GREY, BLUE = mf['text'], mf['P'], mf['INK'], mf['GREY'], mf['BLUE']
def T(*a, **k): return text(*a, **k)[0]
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'identity/work/posters/2026-10-03'); OUT.mkdir(parents=True, exist_ok=True)
M = 48; DISPLAY, HEAD, TEXT = 300, 64, 44
def head(W, H, title, desc):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="t d">',
            f'<title id="t">{title}</title><desc id="d">{desc}</desc>', f'<rect width="{W}" height="{H}" fill="{P}"/>']
def col(W, i): return M + i * (W - 2 * M) / 12   # left edge of column i (0..12)
def sq(x, y, a, fill=BLUE): return f'<rect x="{x:.1f}" y="{y:.1f}" width="{a:.1f}" height="{a:.1f}" fill="{fill}"/>'
def outline(x, y, a, sw=3, stroke=INK): return f'<rect x="{x+sw/2:.1f}" y="{y+sw/2:.1f}" width="{a-sw:.1f}" height="{a-sw:.1f}" fill="none" stroke="{stroke}" stroke-width="{sw}"/>'
def wordmark(x, baseline, size, ink=INK, stop=BLUE, track=-15):
    """lowercase bold cstack with the square full stop drawn as a square, in the symbol's colour (R-MARK-01: never cropped)."""
    word, w = text('cstack', x, baseline, size, 'b', ink, track=track)
    a = size * 0.19; gap = size * 0.06                 # FreeSans Bold's full stop is about 0.19 em square
    return [word, sq(x + w + gap, baseline - a, a, stop)]
def save(name, s):
    s.append('</svg>'); (OUT / f'{name}.svg').write_text('\n'.join(s) + '\n'); print(name)

# ---------- 01 the full stop: the symbol is born inside the wordmark ----------
W, H = 1200, 640
s = head(W, H, 'cstack', 'Warm white poster. Top left: Taste, made repeatable. Before use: step outside. Along the bottom edge, a giant black lowercase cstack whose square full stop is Klein blue.')
s.append(T('Taste, made repeatable.', M, 112, HEAD, 'b', INK, track=-1.5))
s.append(T('Before use: step outside.', M, 184, HEAD, 'r', INK, track=-1.5))
s += wordmark(M - 14, H - 56, DISPLAY)
save('01-full-stop', s)

# ---------- 02 scale: a square larger than the poster ----------
s = head(W, H, 'One square', 'A Klein blue square larger than the poster fills the left two thirds, bleeding off the top, left and bottom; only its right edge shows. On the warm white to its right, four lines: One colour. One grid. One square. Everything else is judgment.')
edge = col(W, 7)
s.append(f'<rect x="0" y="0" width="{edge:.1f}" height="{H}" fill="{BLUE}"/>')
x = edge + (col(W, 8) - edge)
s += wordmark(x, M + 52, HEAD, INK, BLUE, track=-3)
for i, (t, w) in enumerate([('One colour.', 'b'), ('One grid.', 'b'), ('One square.', 'b'), ('Everything else', 'r'), ('is judgment.', 'r')]):
    s.append(T(t, x, H - M - 4 * 72 - 12 + i * 72, HEAD, w, INK, track=-1.5))
save('02-scale', s)

# ---------- 03 step outside: the symbol leaves the frame ----------
s = head(W, H, 'Before use: step outside', 'Warm white poster. Top left, two lines in black: Before use: / step outside. Along the bottom runs a floor of twelve outlined square positions; the solid Klein blue square has left the row and is halfway out of the right edge of the poster.')
s.append(T('Before use:', M, 150, 128, 'b', INK, track=-4))
s.append(T('step outside.', M, 286, 128, 'r', INK, track=-4))
a = 56; floor = H - M - a
for i in range(12): s.append(outline(col(W, i) + ((W - 2 * M) / 12 - a) / 2, floor, a))
b = a * 2; s.append(sq(W - b * 0.66, floor - b + a * 0.2, b))      # it stepped out of the row, grew, and is leaving the frame; the step is the move
s += wordmark(M, floor - 40, HEAD, INK, BLUE, track=-3)
save('03-step-outside', s)

# ---------- 04 the field: twelve positions, a job stops where it needs to ----------
s = head(W, H, 'A job stops only where it needs to', 'Warm white poster. A black band across the top reads: cstack. and, at the right, Thirty skills. One route. Below, a row of twelve outlined square positions; three of them are solid Klein blue. Under the row: Think. Make. Judge.')
band = 104
s.append(f'<rect width="{W}" height="{band}" fill="{INK}"/>')
s += wordmark(M, 72, HEAD, '#fff', '#fff', track=-3)
s.append(T('Thirty skills. One route.', W - M, 72, TEXT, 'r', '#fff', anchor='end'))
a = 72; y = 300; taken = {0: 'Think', 6: 'Make', 9: 'Judge'}
for i in range(12):
    x = col(W, i) + ((W - 2 * M) / 12 - a) / 2
    s.append(sq(x, y, a) if i in taken else outline(x, y, a))
    if i in taken: s.append(T(taken[i], x, y + a + 60, TEXT, 'b', INK))
s.append(T('A job stops only where it needs to.', M, H - 64, HEAD, 'r', INK, track=-1.5))
save('04-the-field', s)

# ---------- 05 the stack: nine squares, one column ----------
s = head(W, H, 'Nine layers, one stack', 'Warm white poster. Nine Klein blue squares stand in one column at the right, stacked with an even gap; the top one sits one square to the left, out of line. At the left: Nine layers. From the world inward, and back out. Memory makes the next brief smarter.')
a = 52; gap = 10; n = 9; top = (H - (n * a + (n - 1) * gap)) / 2; x = col(W, 11)
for i in range(n): s.append(sq(x - (a + gap if i == 0 else 0), top + i * (a + gap), a))
s.append(T('Nine layers.', M, 150, 128, 'b', INK, track=-4))
s.append(T('From the world inward,', M, 262, HEAD, 'r', INK, track=-1.5))
s.append(T('and back out.', M, 334, HEAD, 'r', INK, track=-1.5))
s.append(T('The next brief starts smarter.', M, H - 64, TEXT, 'r', GREY))
save('05-the-stack', s)

# ---------- 06 photograph and band: the Swiss poster that takes a picture ----------
# The upper two thirds are a photograph slot (generated later: one Klein blue cube, warm white studio, nothing else);
# here it is the flat ground, so the composition can be judged without the picture.
s = head(W, H, 'The picture and the band', 'A warm white photograph area fills the upper two thirds, holding one Klein blue square at the right. A black band across the bottom reads cstack. and Taste, made repeatable.')
band = 160; s.append(f'<rect x="0" y="{H-band}" width="{W}" height="{band}" fill="{INK}"/>')
a = 120; s.append(sq(col(W, 9), H - band - M - a, a))
s += wordmark(M, H - band + 100, HEAD, '#fff', '#fff', track=-3)
s.append(T('Taste, made repeatable.', W - M, H - band + 100, TEXT, 'r', '#fff', anchor='end'))
save('06-picture-and-band', s)

# ---------- social card: the full stop, square ----------
W, H = 1200, 1200
s = head(W, H, 'cstack', 'Square warm white card. Top left: Taste, made repeatable. Before use: step outside. Along the bottom edge, a giant black lowercase cstack whose square full stop is Klein blue.')
s.append(T('Taste, made repeatable.', M, 130, HEAD, 'b', INK, track=-1.5))
s.append(T('Before use: step outside.', M, 202, HEAD, 'r', INK, track=-1.5))
s += wordmark(M - 14, H - 72, DISPLAY)
save('07-social-card', s)
