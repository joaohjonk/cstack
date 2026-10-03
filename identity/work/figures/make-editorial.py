#!/usr/bin/env python3
"""cstack's poster set, round 4: the editorial register.

Run from the repo root: python3 identity/work/figures/make-editorial.py [out-dir]
Writes one SVG per poster (default identity/work/posters/2026-10-03-r4/). Type is FreeSans outlines via
text() from make-figures.py; no <text>, no font file. Grain and blur are SVG filters, so the files stay small.

What round 4 adds to the system in make-posters.py, each carried as an idea from the owner's reference board
(identity/references/inspiration/ref-editorial-board.reference.yaml), never as a copy:
- display words whose letters jump in size and weight, while the wordmark itself never changes
- the specification sheet: label and value columns in caps, data as the picture
- a signal flag: a field of blue with one inset square of ground
- grain and blur as the texture of "not yet decided"; sharp and flat as the texture of a decision
- a block of fine vertical lines that reads as a gradient from a distance
- letters tossed along the bottom edge: play, once per set
- digits stacked and overlapping as a specimen"""
import pathlib, sys, math, random
HERE = pathlib.Path(__file__).resolve().parent
src = (HERE / 'make-figures.py').read_text().split('# ---------- the field and the figure')[0]
mf = {}; exec(compile(src, 'make-figures.py', 'exec'), mf)
text, P, INK, GREY, BLUE, F = mf['text'], mf['P'], mf['INK'], mf['GREY'], mf['BLUE'], mf['F']
WHITE = '#fff'
def T(*a, **k): return text(*a, **k)[0]
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'identity/work/posters/2026-10-03-r4'); OUT.mkdir(parents=True, exist_ok=True)
M = 48; TEXT = 44; HEAD = 64
DEFS = f'''<defs>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.22 0" result="g"/><feComposite in="g" in2="SourceGraphic" operator="in"/></filter>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
<filter id="softer" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="34"/></filter>
<filter id="edge" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2.2"/></filter>
</defs>'''
def head(W, H, title, desc, ground=P):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="t d">',
            f'<title id="t">{title}</title><desc id="d">{desc}</desc>', DEFS, f'<rect width="{W}" height="{H}" fill="{ground}"/>']
def grain(W, H, fill=INK): return f'<rect width="{W}" height="{H}" fill="{fill}" filter="url(#grain)" opacity="0.35"/>'
def col(W, i): return M + i * (W - 2 * M) / 12
def sq(x, y, a, fill=BLUE, extra=''): return f'<rect x="{x:.1f}" y="{y:.1f}" width="{a:.1f}" height="{a:.1f}" fill="{fill}"{extra}/>'
def wordmark(x, baseline, size, ink=INK, stop=BLUE, track=None):
    word, w = text('cstack', x, baseline, size, 'b', ink, track=-size * 0.05 if track is None else track)
    a = size * 0.19; return [word, sq(x + w + size * 0.06, baseline - a, a, stop)], w + size * 0.06 + a
def jumping(word, x, baseline, sizes, weights, fill, gap=0.02):
    """A display word whose letters jump in size and weight, all on one baseline (the move, not the wordmark)."""
    out = []
    for ch, s, w in zip(word, sizes, weights):
        p, adv = text(ch, x, baseline, s, w, fill); out.append(p); x += adv + s * gap
    return out, x
def specsheet(x0, x1, y, rows, fill, size=TEXT, lead=None):
    """Label and value columns in caps: the data is the picture."""
    lead = lead or size * 1.18; out = []
    for i, (k, v) in enumerate(rows):
        out.append(T(k.upper(), x0, y + i * lead, size, 'r', fill)); out.append(T(v, x1, y + i * lead, size, 'r', fill))
    return out
def save(name, s):
    s.append('</svg>'); (OUT / f'{name}.svg').write_text('\n'.join(s) + '\n'); print(name)

# ---------- 01 the flag: a field of blue, one inset square of ground ----------
W, H = 1200, 640
s = head(W, H, 'cstack', 'A Klein blue field with fine grain fills the poster. A warm white square, slightly soft at its edges, sits inset on the left half. Bottom left, the wordmark cstack in white with a white square full stop. Bottom right, in white: Before use: step outside.', BLUE)
s.append(grain(W, H, INK))
a = 300; s.append(sq(col(W, 2), (H - a) / 2 - 24, a, P, ' filter="url(#edge)"'))
wm, _ = wordmark(M, H - M - 6, HEAD, WHITE, WHITE); s += wm
s.append(T('Before use: step outside.', W - M, H - M - 6, TEXT, 'r', WHITE, anchor='end'))
save('01-flag', s)

# ---------- 02 outside: a display word whose letters jump ----------
s = head(W, H, 'Step outside', 'Klein blue poster with grain. The word outside fills the width, its letters jumping between sizes and weights on one baseline. Above it, small: Before use. Below, a spec sheet in white caps: Field, where the brand is not; Return with, one thing nobody in the category has seen; Then, write it down.', BLUE)
s.append(grain(W, H, INK))
s.append(T('BEFORE USE', M, 120, TEXT, 'r', WHITE, track=4))
letters, _ = jumping('outside.', M - 10, 392, [300, 220, 300, 240, 300, 180, 300, 300], ['b', 'r', 'b', 'b', 'r', 'b', 'r', 'b'], WHITE)
s += letters
s += specsheet(M, col(W, 4), 480, [('Field:', 'where the brand is not'), ('Return with:', 'one thing the category has not seen'), ('Then:', 'write it down')], WHITE)
save('02-outside', s)

# ---------- 03 nine layers as a specification sheet ----------
L = [('01 Reality', 'What is true about the product'), ('02 Culture', 'People, scenes, rituals, language'), ('03 Canon', 'Models from people who did it well'), ('04 References', 'Source, mechanism, transfer'), ('05 System', 'Tokens, type, grid, motion, voice'), ('06 Generation', 'People, agents, code, models'), ('07 Judgment', 'Never by the maker'), ('08 Memory', 'Every correction written down'), ('09 Compounding taste', 'The next brief starts smarter')]
W, H = 1200, 1000
s = head(W, H, 'Nine layers', 'Warm white sheet. The headline Nine layers in black, its letters jumping in size. A hairline, then a specification table: nine rows, the layer in black at the left and what it holds in grey at the right. A Klein blue square marks row nine.')
letters, _ = jumping('Nine', M - 6, 190, [210, 150, 210, 170], ['b', 'r', 'b', 'b'], INK)
s += letters; l2, _ = jumping('layers.', col(W, 5) + 10, 190, [150, 210, 170, 210, 150, 210, 210], ['r', 'b', 'b', 'r', 'b', 'b', 'b'], INK); s += l2
y0 = 250; lead = 68
s.append(f'<line x1="{M}" y1="{y0}" x2="{W-M}" y2="{y0}" stroke="{INK}" stroke-width="2"/>')
for i, (k, v) in enumerate(L):
    y = y0 + 48 + i * lead
    s.append(T(k, M, y, TEXT, 'b', INK)); s.append(T(v, col(W, 6), y, TEXT, 'r', GREY))
    s.append(f'<line x1="{M}" y1="{y+18}" x2="{W-M}" y2="{y+18}" stroke="{INK}" stroke-width="1" opacity="0.35"/>')
    if i == 8: s.append(sq(W - M - 28, y - 30, 28))
wm, _ = wordmark(M, H - M, TEXT, INK, BLUE); s += wm
s.append(T('From the world inward, and back out.', W - M, H - M, TEXT, 'r', GREY, anchor='end'))
save('03-nine-layers-sheet', s)

# ---------- 04 digits: nine layers as a specimen ----------
W, H = 1200, 640
s = head(W, H, 'Nine layers, stacked', 'Warm white poster. The digits 1 to 9 stand in a row, each larger than the last, overlapping, Klein blue with warm white edges. Top left, small: Nine layers. One line. Bottom left, the wordmark.')
sizes = [120 + i * 26 for i in range(1, 10)]; k = 0.74
adv = [text(str(i), 0, 0, sz, 'b', BLUE)[1] for i, sz in zip(range(1, 10), sizes)]
total = sum(a * k for a in adv[:-1]) + adv[-1]; x = M + (W - 2 * M - total) / 2; base = 470
for i, sz, a in zip(range(1, 10), sizes, adv):
    p, _ = text(str(i), x, base, sz, 'b', BLUE)
    s.append(p.replace('<path ', f'<path stroke="{P}" stroke-width="6" paint-order="stroke" '))
    x += a * k
s.append(T('NINE LAYERS. ONE LINE.', M, 96, TEXT, 'r', INK, track=4))
wm, _ = wordmark(M, H - M - 6, TEXT, INK, BLUE); s += wm
save('04-digits', s)

# ---------- 05 the field, soft and sharp: possibilities blur, decisions are flat ----------
s = head(W, H, 'A job stops only where it needs to', 'Klein blue poster. A grid of warm white squares, blurred soft like light through paper, fills the frame. Three of them are sharp and solid: the positions this job took. Bottom left in white: A job stops only where it needs to.', BLUE)
a = 92; gx = (W - 2 * M - 12 * a) / 11; rows = 4; gy = 28; top = 84
taken = {(0, 1), (2, 6), (3, 9)}
for r in range(rows):
    for c in range(12):
        x = M + c * (a + gx); y = top + r * (a + gy)
        if (r, c) in taken: continue
        s.append(sq(x, y, a, P, ' filter="url(#soft)" opacity="0.8"'))
for r, c in taken: s.append(sq(M + c * (a + gx), top + r * (a + gy), a, P))
s.append(grain(W, H, INK))
s.append(T('A job stops only where it needs to.', M, H - M - 6, TEXT, 'r', WHITE))
wm, _ = wordmark(W - M - 190, H - M - 6, TEXT, WHITE, WHITE); s += wm
save('05-field-soft', s)

# ---------- 06 drift as texture: prompted is noise, kept is flat ----------
s = head(W, H, 'Prompted versus kept in files', 'Two blocks side by side on warm white. Left: a block of fine vertical Klein blue lines of uneven weight that reads as a shimmering gradient, labelled Prompted ten times. Right: one flat Klein blue block, labelled Made from one brand, kept in files.')
bw = (W - 2 * M - 40) / 2; top = 56; bh = 380
rnd = random.Random(3); n = 110; step = bw / n
for i in range(n):
    w = 1.2 + 4.5 * (0.5 + 0.5 * math.sin(i / 7.0)) * (0.6 + 0.8 * rnd.random())
    s.append(f'<rect x="{M + i*step:.1f}" y="{top}" width="{w:.1f}" height="{bh}" fill="{BLUE}"/>')
s.append(f'<rect x="{M + bw + 40:.1f}" y="{top}" width="{bw:.1f}" height="{bh}" fill="{BLUE}"/>')
s.append(T('Prompted ten times.', M, top + bh + 64, TEXT, 'b', INK))
s.append(T('Kept in files.', M + bw + 40, top + bh + 64, TEXT, 'b', INK))
s.append(T('Made from one brand.', M + bw + 40, top + bh + 116, TEXT, 'r', GREY))
wm, _ = wordmark(M, top + bh + 116, TEXT, INK, BLUE); s += wm
save('06-drift-texture', s)

# ---------- 07 tossed: play, once per set ----------
s = head(W, H, 'Taste, made repeatable', 'Klein blue poster with grain. Top: TASTE, MADE in heavy white caps. Along the bottom the word repeatable is tossed letter by letter, each turned a little, as if dropped on the floor. The square full stop lands upright at the end.', BLUE)
s.append(grain(W, H, INK))
s.append(T('TASTE, MADE', M - 6, 212, 150, 'b', WHITE, track=-5))
x = M; base = H - 70; rnd = random.Random(11)
for i, ch in enumerate('repeatable'):
    size = 170; rot = rnd.uniform(-22, 22); dy = rnd.uniform(-40, 10)
    p, adv = text(ch, x, base + dy, size, 'b', WHITE)
    cx = x + adv / 2; cy = base + dy - size * 0.3
    s.append(p.replace('<path ', f'<path transform="rotate({rot:.1f} {cx:.1f} {cy:.1f})" '))
    x += adv * 0.92
s.append(sq(x + 12, base - 34, 34, WHITE))
save('07-tossed', s)

# ---------- 08 social card: the flag, square ----------
W, H = 1200, 1200
s = head(W, H, 'cstack', 'A square Klein blue field with fine grain. A warm white square, soft at its edges, sits in the upper centre. Bottom left, the wordmark cstack in white with a white square full stop.', BLUE)
s.append(grain(W, H, INK))
a = 480; s.append(sq((W - a) / 2, 200, a, P, ' filter="url(#edge)"'))
wm, _ = wordmark(M, H - M - 10, 96, WHITE, WHITE); s += wm
s.append(T('Before use: step outside.', W - M, H - M - 10, TEXT, 'r', WHITE, anchor='end'))
save('08-social-flag', s)
