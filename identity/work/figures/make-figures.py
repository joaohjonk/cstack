#!/usr/bin/env python3
"""Regenerate cstack's README figures (docs/images) from the identity tokens.

Run from the repo root: python3 identity/work/figures/make-figures.py
Needs fontTools (pip install fonttools) and GNU FreeSans; set FREESANS_DIR if the fonts are not in /usr/share/fonts/truetype/freefont/.
Text is converted to outlines; no font file is written."""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
FF=os.environ.get('FREESANS_DIR','/usr/share/fonts/truetype/freefont/').rstrip('/')+'/'; F={'r':TTFont(FF+'FreeSans.ttf'),'b':TTFont(FF+'FreeSansBold.ttf')}
P='#F6F4EF'; INK='#151515'; GREY='#5E5C57'; BLUE='#002FA7'   # identity/brand/tokens/color.tokens.json
def text(t,x,y,size,w='r',fill=INK,track=0,anchor='start'):
    f=F[w]; gs=f.getGlyphSet(); cmap=f.getBestCmap(); upm=f['head'].unitsPerEm; sc=size/upm
    names=[cmap.get(ord(c),'space') for c in t]
    assert all(ord(c) in cmap for c in t), t
    adv=[gs[n].width*sc+track for n in names]; total=sum(adv)-track
    if anchor=='end': x-=total
    if anchor=='middle': x-=total/2
    out=[]; cx=x
    for n,a in zip(names,adv):
        pen=SVGPathPen(gs); gs[n].draw(TransformPen(pen,(sc,0,0,-sc,cx,y)))
        d=pen.getCommands()
        if d: out.append(d)
        cx+=a
    return f'<path fill="{fill}" d="{" ".join(out)}"/>', total
def T(*a,**k): return text(*a,**k)[0]
OUT='docs/images/'
def head(W,H,title,desc):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-labelledby="t d">',f'<title id="t">{title}</title><desc id="d">{desc}</desc>']
# ---------- the field and the figure (identity/brand/brand-system.json#graphic_devices) ----------
def figure(x0,top,q,feet,color,knees,turn=17):
    """The figure: the square at play. Body a bar five units long, head one unit turned 17 degrees, limbs a quarter unit wide.
    feet: where the back-far, back-near, front-far and front-near limbs end (one may end in the air, mid-move); knees: each knee's offset from its limb's midpoint."""
    L=5*q; D=q*0.8; sw=q/4; o=[]
    hips=[(x0+sw*2.5,top+D),(x0+sw/2,top+D),(x0+L-sw*2.5,top+D),(x0+L-sw/2,top+D)]
    for (hx,hy),(fx,fy),(kdx,kdy) in zip(hips,feet,knees):
        o.append(f'<polyline points="{hx:.1f},{hy-2:.1f} {(hx+fx)/2+kdx:.1f},{(hy+fy)/2+kdy:.1f} {fx:.1f},{fy:.1f}" fill="none" stroke="{color}" stroke-width="{sw:.1f}" stroke-linejoin="miter" stroke-miterlimit="10"/>')
    o.append(f'<rect x="{x0:.1f}" y="{top:.1f}" width="{L:.1f}" height="{D:.1f}" fill="{color}"/>')
    hx=x0+L+q*0.3; hy=top-q*0.85
    o.append(f'<line x1="{x0+L-sw:.1f}" y1="{top+D/2:.1f}" x2="{hx:.1f}" y2="{hy:.1f}" stroke="{color}" stroke-width="{q*0.4:.1f}"/>')
    o.append(f'<rect x="{hx-q/2:.1f}" y="{hy-q/2:.1f}" width="{q}" height="{q}" fill="{color}" transform="rotate({turn} {hx:.1f} {hy:.1f})"/>')
    return o
def position(x,y,q,color,taken,sw=2.5):
    """One square of the field: solid where something stands, an outline where it could."""
    if taken: return f'<rect x="{x:.1f}" y="{y:.1f}" width="{q}" height="{q}" fill="{color}"/>'
    return f'<rect x="{x+sw/2:.1f}" y="{y+sw/2:.1f}" width="{q-sw:.1f}" height="{q-sw:.1f}" fill="none" stroke="{color}" stroke-width="{sw}"/>'
# ---------- the poster register (round 5, 2026-10-03): Klein blue ground, white type, one move per figure ----------
WHITE='#fff'; M=48; TEXT=44; HEAD=64
DEFS=('<defs><filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>'
      '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.22 0" result="g"/><feComposite in="g" in2="SourceGraphic" operator="in"/></filter>'
      '<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter></defs>')
def poster(W,H,title,desc):
    s=head(W,H,title,desc); s.append(DEFS); s.append(f'<rect width="{W}" height="{H}" fill="{BLUE}"/>')
    s.append(f'<rect width="{W}" height="{H}" fill="{INK}" filter="url(#grain)" opacity="0.35"/>'); return s
def col(W,i): return M+i*(W-2*M)/12
def sq(x,y,a,fill=WHITE,extra=''): return f'<rect x="{x:.1f}" y="{y:.1f}" width="{a:.1f}" height="{a:.1f}" fill="{fill}"{extra}/>'
def wordmark(x,baseline,size,ink=WHITE,stop=WHITE):
    """lowercase bold cstack; the full stop is drawn as the square (R-MARK-01: never cropped)."""
    word,w=text('cstack',x,baseline,size,'b',ink,track=-size*0.05); a=size*0.19
    return [word,sq(x+w+size*0.06,baseline-a,a,stop)]
# ---------- hero: Taste, made repeatable; the word four times, one letter slipped once ----------
W,H=1200,640
s=poster(W,H,'cstack','A Klein blue poster with fine grain. Top left in white: Taste, made. Below it the word repeatable is set four times, one under the other, identical, except that in the third line one letter has slipped and turned. The last line ends in a square full stop. Bottom right, the wordmark cstack.')
s.append(T('Taste, made',M-4,150,128,'b',WHITE,track=-4))
for r in range(4):
    x=M; base=262+r*100
    for i,ch in enumerate('repeatable'):
        p_,adv=text(ch,x,base,96,'b',WHITE)
        if r==2 and i==5:   # the glitch: one letter, once; a strict system plus one move only taste makes
            cx=x+adv/2; cy=base-30; p_=p_.replace('<path ',f'<path transform="rotate(16 {cx:.1f} {cy:.1f}) translate(2 12)" ')
        s.append(p_); x+=adv*0.98
s.append(sq(x+10,262+3*100-20,20))
s+=wordmark(col(W,9),H-M-6,TEXT)
s.append('</svg>'); open(OUT+'cstack-hero.svg','w').write('\n'.join(s)+'\n')
# ---------- step outside: the sign, in the README's own words ----------
s=poster(W,H,'First, step outside','Klein blue poster with grain. Headline in white: First, step outside. Below it: cstack can keep your taste. It cannot give you any. Go see the world. Then come back and make. Bottom left, the wordmark.')
s.append(T('First,',M-4,190,150,'b',WHITE,track=-5))
s.append(T('step outside.',M-4,330,150,'b',WHITE,track=-5))
s.append(T('cstack can keep your taste. It cannot give you any.',M,440,TEXT,'r',WHITE))
s.append(T('Go see the world. Then come back and make.',M,496,TEXT,'r',WHITE))
s+=wordmark(M,H-M-6,TEXT)
s.append('</svg>'); open(OUT+'step-outside.svg','w').write('\n'.join(s)+'\n')
# ---------- drift as texture: prompted is noise, kept is flat ----------
import math,random
s=poster(W,H,'Prompted versus kept in files','Klein blue poster. Two lines in white: Ask a model for your brand a hundred times: a hundred cousins. Keep it in files: one brand. Below, two blocks side by side: on the left a block of fine vertical white lines of uneven weight that shimmers like a gradient, labelled Prompted ten times; on the right one flat white block, labelled Kept in files. Made from one brand.')
s.append(T('Ask a model for your brand a hundred times:',M,72,TEXT,'b',WHITE))
s.append(T('a hundred cousins. Keep it in files: one brand.',M,124,TEXT,'r',WHITE))
bw=(W-2*M-40)/2; top=164; bh=290; rnd=random.Random(3); n=110; step=bw/n
for i in range(n):
    w=1.2+4.5*(0.5+0.5*math.sin(i/7.0))*(0.6+0.8*rnd.random())
    s.append(f'<rect x="{M+i*step:.1f}" y="{top}" width="{w:.1f}" height="{bh}" fill="{WHITE}"/>')
s.append(f'<rect x="{M+bw+40:.1f}" y="{top}" width="{bw:.1f}" height="{bh}" fill="{WHITE}"/>')
s.append(T('Prompted ten times.',M,top+bh+64,TEXT,'b',WHITE))
s.append(T('Kept in files.',M+bw+40,top+bh+64,TEXT,'b',WHITE))
s.append(T('Made from one brand.',M+bw+40,top+bh+116,TEXT,'r',WHITE))
s+=wordmark(M,top+bh+116,TEXT)
s.append('</svg>'); open(OUT+'cstack-drift.svg','w').write('\n'.join(s)+'\n')
# ---------- nine layers: one transit line, nine stops, and the loop back ----------
L=[('01','Reality','What is true about the product'),('02','Culture','People, scenes, rituals, language'),('03','Canon','Models from people who did it well'),('04','References','Source, mechanism, transfer'),('05','System','Tokens, type, grid, motion, voice'),('06','Generation','People, agents, code, models'),('07','Judgment','Never by the maker'),('08','Memory','Every correction written down'),('09','Compounding taste','The next brief starts smarter')]
W=1000; top=330; step=104; H=top+8*step+170; lx=110; loopx=52
s=poster(W,H,'The nine layers of cstack','A Klein blue poster. Headline in white: Nine layers. From the world inward, and back out. Below, one white transit line runs down the left with nine stops from Reality to Compounding taste, each named in white with a short line under it. A branch leaves Memory and runs back up to Canon: every correction feeds back.')
s.append(T('Nine layers.',M-3,150,128,'b',WHITE,track=-4))
s.append(T('From the world inward, and back out.',M,222,TEXT,'r',WHITE))
y=lambda i: top+i*step; d=lx-loopx
s.append(f'<path d="M{lx} {y(7)} L{loopx} {y(7)-d} L{loopx} {y(2)+d} L{lx} {y(2)}" fill="none" stroke="{WHITE}" stroke-width="10" stroke-linejoin="round" opacity="0.55"/>')
s.append(f'<line x1="{lx}" y1="{y(0)}" x2="{lx}" y2="{y(8)}" stroke="{WHITE}" stroke-width="12"/>')
for i,(num,name,desc) in enumerate(L):
    last=i==8
    s.append(f'<circle cx="{lx}" cy="{y(i)}" r="{19 if last else 15}" fill="{WHITE if last else BLUE}" stroke="{WHITE}" stroke-width="5"/>')
    s.append(T(name,lx+48,y(i)+6,TEXT,'b',WHITE,track=-.8))
    s.append(T(desc,lx+48,y(i)+50,TEXT,'r',WHITE))
s+=wordmark(M,H-M-6,TEXT)
s.append('</svg>'); open(OUT+'nine-layers.svg','w').write('\n'.join(s)+'\n')
# ---------- the field: skills by stage, soft where a job did not stop, sharp where it did (docs/architecture.md#skill-map) ----------
import re
rows=[]
for line in open('docs/architecture.md').read().split('## Skill map')[1].split('\n\n`workflow`')[0].splitlines():
    m=re.match(r'\| ([A-Z][^|]+?) \| (`.*`) \|$',line)
    if m: rows.append((m.group(1),re.findall(r'`([a-z0-9-]+)`',m.group(2))))
route={'Think':'brief','Know the brand':'identity-system','Direct':'creative-direction','Make':'vector-master','Judge':'brand-verify','Remember':'learn-loop'}   # the job that drew these figures
W=1000; rh=112; top=300; sx=420; px=80; q=48; H=top+len(rows)*rh+40
s=poster(W,H,'The field: cstack skills by stage','A Klein blue poster. Headline in white: A job stops only where it needs to. Each row is a stage from Think to Remember; each square a skill. The squares a job did not use are soft and blurred; the one it used in each stage is sharp and white, and a white line runs down through them: brief, identity-system, creative-direction, vector-master, brand-verify, learn-loop. In Look outward it does not stop: not this time.')
s.append(T('A job stops only',M-3,130,96,'b',WHITE,track=-3))
s.append(T('where it needs to.',M-3,226,96,'b',WHITE,track=-3))
cy=lambda i: top+i*rh+q/2
xs=[]
for i,(stage,skills) in enumerate(rows):
    xs.append(sx+skills.index(route[stage])*px+q/2 if stage in route else sx+3*px+q+(px-q)/2)
pts=[(xs[0],top-30)]
for i,x in enumerate(xs):
    pts.append((x,cy(i)))
    if i+1<len(xs) and xs[i+1]!=x: g=cy(i)+rh/2; pts+=[(x,g),(xs[i+1],g)]
pts.append((xs[-1],cy(len(xs)-1)))
def chamfer(pts,c=18):
    out=[pts[0]]
    for (x0,y0),(x1,y1),(x2,y2) in zip(pts,pts[1:],pts[2:]):
        if (x0==x1)==(x1==x2): out.append((x1,y1)); continue
        d=lambda a,b: (b>a)-(b<a)
        out+=[(x1-d(x0,x1)*c,y1-d(y0,y1)*c),(x1+d(x1,x2)*c,y1+d(y1,y2)*c)]
    return out+[pts[-1]]
pts=chamfer(pts)
for i,(stage,skills) in enumerate(rows):
    for j,k in enumerate(skills):
        if k!=route.get(stage): s.append(sq(sx+j*px,cy(i)-q/2,q,WHITE,' filter="url(#soft)" opacity="0.75"'))
s.append(f'<polyline points="{" ".join(f"{a:.1f},{b:.1f}" for a,b in pts)}" fill="none" stroke="{WHITE}" stroke-width="10" stroke-linejoin="round"/>')
for i,(stage,skills) in enumerate(rows):
    s.append(T(stage,M,cy(i)-2,TEXT,'b',WHITE,track=-.8))
    s.append(T(route.get(stage) or 'not this time',M,cy(i)+44,TEXT,'r',WHITE))
    for j,k in enumerate(skills):
        if k==route.get(stage): s.append(sq(sx+j*px,cy(i)-q/2,q,WHITE))
s.append('</svg>'); open(OUT+'the-field.svg','w').write('\n'.join(s)+'\n')
print('ok')
