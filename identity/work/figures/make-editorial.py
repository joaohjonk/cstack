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
s = head(W, H, 'cstack', 'A Klein blue field with fine grain fills the poster. A warm white square, slightly soft at its edges, sits inset on the left half. Bottom left, the wordmark cstack in white. Bottom right, in white: Taste, made repeatable. Your brand as files an agent can read, check and keep.', BLUE)
s.append(grain(W, H, INK))
a = 300; s.append(sq(col(W, 2), (H - a) / 2 - 24, a, P, ' filter="url(#edge)"'))
wm, _ = wordmark(M, H - M - 6, HEAD, WHITE, WHITE); s += wm
s.append(T('Taste, made repeatable.', col(W, 6), H - M - 110, TEXT, 'b', WHITE))
s.append(T('Your brand as files an agent', col(W, 6), H - M - 58, TEXT, 'r', WHITE))
s.append(T('can read, check and keep.', col(W, 6), H - M - 6, TEXT, 'r', WHITE))
save('01-flag', s)

# ---------- 02 first, step outside: plain type, the README's own words ----------
s = head(W, H, 'First, step outside', 'Klein blue poster with grain. Headline in white: First, step outside. Below it: cstack can keep your taste. It cannot give you any. Go see the world. Then come back and make. Bottom left, the wordmark.', BLUE)
s.append(grain(W, H, INK))
s.append(T('First,', M - 4, 190, 150, 'b', WHITE, track=-5))
s.append(T('step outside.', M - 4, 330, 150, 'b', WHITE, track=-5))
s.append(T('cstack can keep your taste. It cannot give you any.', M, 440, TEXT, 'r', WHITE))
s.append(T('Go see the world. Then come back and make.', M, 496, TEXT, 'r', WHITE))
wm, _ = wordmark(M, H - M - 6, TEXT, WHITE, WHITE); s += wm
save('02-step-outside', s)

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
bw = (W - 2 * M - 40) / 2; top = 164; bh = 290
rnd = random.Random(3); n = 110; step = bw / n
for i in range(n):
    w = 1.2 + 4.5 * (0.5 + 0.5 * math.sin(i / 7.0)) * (0.6 + 0.8 * rnd.random())
    s.append(f'<rect x="{M + i*step:.1f}" y="{top}" width="{w:.1f}" height="{bh}" fill="{BLUE}"/>')
s.append(f'<rect x="{M + bw + 40:.1f}" y="{top}" width="{bw:.1f}" height="{bh}" fill="{BLUE}"/>')
s.append(T('Ask a model for your brand a hundred times:', M, 72, TEXT, 'b', INK))
s.append(T('a hundred cousins. Keep it in files: one brand.', M, 124, TEXT, 'r', GREY))
s.append(T('Prompted ten times.', M, top + bh + 64, TEXT, 'b', INK))
s.append(T('Kept in files.', M + bw + 40, top + bh + 64, TEXT, 'b', INK))
s.append(T('Made from one brand.', M + bw + 40, top + bh + 116, TEXT, 'r', GREY))
wm, _ = wordmark(M, top + bh + 116, TEXT, INK, BLUE); s += wm
save('06-drift-texture', s)

# ---------- 07 tossed: the owner's pick, the glitch only taste can do ----------
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


# ---------- 10 the glitch: the word repeated, one instance out of line ----------
s = head(W, H, 'Taste, made repeatable', 'Warm white poster. Top left in black: Taste, made. Below it the word repeatable is set four times in Klein blue, one under the other, identical; in the third line one letter has slipped and turned. Bottom left, the wordmark.')
s.append(T('Taste, made', M - 4, 150, 128, 'b', INK, track=-4))
rnd = random.Random(5)
for r in range(4):
    x = M; base = 262 + r * 100
    for i, ch in enumerate('repeatable'):
        p_, adv = text(ch, x, base, 96, 'b', BLUE)
        if r == 2 and i == 5:   # the glitch: one letter, once
            cx = x + adv / 2; cy = base - 30
            p_ = p_.replace('<path ', f'<path transform="rotate(16 {cx:.1f} {cy:.1f}) translate(2 12)" ')
        s.append(p_); x += adv * 0.98
s.append(sq(x + 10, 262 + 3 * 100 - 20, 20))
wm, _ = wordmark(col(W, 9), H - M - 6, TEXT, INK, BLUE); s += wm
save('10-glitch', s)

# ---------- 07 worth repeating: the README's last line ----------
s = head(W, H, 'Make sure it is worth repeating', 'Klein blue poster with grain. In white, two large lines: The machine will repeat your judgment ten thousand times. Make sure it is worth repeating. A row of twelve small white squares runs under the text, identical. Bottom left, the wordmark.', BLUE)
s.append(grain(W, H, INK))
for i, line in enumerate(['The machine will repeat', 'your judgment', 'ten thousand times.']):
    s.append(T(line, M - 3, 128 + i * 96, 96, 'b', WHITE, track=-3))
s.append(T('Make sure it is worth repeating.', M, 452, HEAD, 'r', WHITE, track=-1.5))
a = 22
for i in range(12): s.append(sq(col(W, i), 500, a, WHITE))
wm, _ = wordmark(M, H - M - 6, TEXT, WHITE, WHITE); s += wm
save('07-worth-repeating', s)

# ---------- 09 what cstack is: the specification sheet as the hero ----------
s = head(W, H, 'cstack, in five lines', 'Klein blue poster with grain. The wordmark cstack, very large, in white on the upper left. Below it a specification sheet in white: What, a brand operating system, open, in git. Your brand, files an agent can read, check and keep. The making, thirty skills and one small CLI. The judge, never the maker. The memory, every pick and kill, written down.', BLUE)
s.append(grain(W, H, INK))
wm, _ = wordmark(M - 10, 250, 240, WHITE, WHITE); s += wm
s += specsheet(M, col(W, 4), 340, [('What:', 'a brand operating system, open, in git'), ('Your brand:', 'files an agent can read and keep'), ('The making:', 'thirty skills and one small CLI'), ('The judge:', 'never the maker'), ('The memory:', 'every pick and kill, written down')], WHITE, lead=54)
save('09-spec-sheet', s)

# ---------- 11 the field, one square out of line: the glitch holds the picture ----------
W, H = 1200, 640
s = head(W, H, 'Taste, made repeatable', 'Klein blue poster. A grid of soft, blurred warm white squares fills the upper part. One square is sharp and has stepped out of line, up and to the right of its position; it holds a photograph of the outside. Below, in white: Taste, made repeatable. cstack can keep your taste. It cannot give you any.', BLUE)
a = 92; gx = (W - 2 * M - 12 * a) / 11; gy = 28; top = 56
for r in range(3):
    for c in range(12):
        if (r, c) == (1, 8): continue
        s.append(sq(M + c * (a + gx), top + r * (a + gy), a, P, ' filter="url(#soft)" opacity="0.8"'))
GX, GY = M + 8 * (a + gx) + (a + gx) / 2, top + 1 * (a + gy) - (a + gy) / 2   # out of line by half a step, up and right
s.append(sq(GX, GY, a, P, ' id="glitch"'))
s.append(grain(W, H, INK))
s.append(T('Taste, made repeatable.', M, 492, HEAD, 'b', WHITE, track=-1.5))
s.append(T('cstack can keep your taste. It cannot give you any.', M, 548, TEXT, 'r', WHITE))
wm, _ = wordmark(W - M - 186, H - M - 6, TEXT, WHITE, WHITE); s += wm
print('glitch square at', round(GX), round(GY), a)
save('11-field-glitch', s)

# ---------- 08 social card: the flag, square ----------
W, H = 1200, 1200
s = head(W, H, 'cstack', 'A square Klein blue field with fine grain. A warm white square, soft at its edges, sits in the upper centre. Bottom left, the wordmark cstack in white with a white square full stop.', BLUE)
s.append(grain(W, H, INK))
a = 480; s.append(sq((W - a) / 2, 200, a, P, ' filter="url(#edge)"'))
wm, _ = wordmark(M, H - M - 10, 96, WHITE, WHITE); s += wm
s.append(T('Taste, made repeatable.', W - M, H - M - 10, TEXT, 'r', WHITE, anchor='end'))
save('08-social-flag', s)
