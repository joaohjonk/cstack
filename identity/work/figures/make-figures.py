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
# ---------- hero: Swiss poster ----------
W,H=1200,640; s=head(W,H,'cstack','A Swiss poster in Klein blue on a twelve-column grid. A giant white lowercase cstack with a square full stop sits on the bottom edge. Above it: Taste, made repeatable. An open operating system for brand work, run by agents. Before use: step outside, taste is built from distance.')
s.append(f'<rect width="{W}" height="{H}" fill="{BLUE}"/>')
col=W/12
for i in range(1,12): s.append(f'<line x1="{i*col:.1f}" y1="0" x2="{i*col:.1f}" y2="{H}" stroke="#fff" stroke-opacity="0.12"/>')
s.append(f'<line x1="0" y1="232" x2="{W}" y2="232" stroke="#fff" stroke-opacity="0.12"/>')
big,bw=text('cstack.',-14,H-22,318,'b','#fff',track=-15)
s.append(big)
s.append(T('Taste,',24,72,32,'b','#fff',track=-.6)); s.append(T('made repeatable.',24,110,32,'b','#fff',track=-.6))
s.append(T('An open operating system',col*4+8,68,20,'r','#fff')); s.append(T('for brand work, run by agents.',col*4+8,94,20,'r','#fff'))
s.append(T('Before use',col*8+8,68,20,'b','#fff')); s.append(T('Step outside. Taste is',col*8+8,94,20,'r','#fff')); s.append(T('built from distance.',col*8+8,120,20,'r','#fff'))
for i in range(10):
    x=col*4+8+i*38; y=164
    if i==6: s.append(f'<rect x="{x}" y="{y}" width="24" height="24" fill="none" stroke="#fff" stroke-width="2" transform="rotate(17 {x+12} {y+12})"/>')
    else: s.append(f'<rect x="{x}" y="{y}" width="24" height="24" fill="#fff"/>')
s.append('</svg>')
open(OUT+'cstack-hero.svg','w').write('\n'.join(s)+'\n')
# ---------- drift: squares only ----------
W,H,m=1200,520,96; s=head(W,H,'Prompted versus kept in files','Ten squares made from prompts drift in size and angle. Below, on a Klein blue band, ten squares made from one brand kept in files are identical.')
s.append(f'<rect width="{W}" height="{H}" fill="{P}"/>')
band=250; s.append(f'<rect y="{band}" width="{W}" height="{H-band}" fill="{BLUE}"/>')
n=10; colw=(W-2*m)/n; size=64
s.append(T('Prompted ten times',m,74,26,'b',INK,track=-.4))
dr=[[0,0,0,1],[4,-3,5,1.04],[-5,4,-8,.92],[7,-5,11,1.1],[-8,6,-14,.88],[10,-7,18,1.14],[-11,9,-22,.84],[9,-10,27,1.16],[-6,12,-31,.82],[-4,-9,38,1.18]]
for i in range(n):
    dx,dy,rot,sc=dr[i]; sz=size*sc; cx=m+i*colw+colw/2+dx; cy=160+dy
    s.append(f'<rect x="{cx-sz/2:.1f}" y="{cy-sz/2:.1f}" width="{sz:.1f}" height="{sz:.1f}" fill="none" stroke="{INK}" stroke-width="2" transform="rotate({rot} {cx:.1f} {cy:.1f})"/>')
s.append(T('Made ten times from one brand, kept in files',m,band+70,26,'b','#fff',track=-.4))
for i in range(n):
    cx=m+i*colw+colw/2
    s.append(f'<rect x="{cx-size/2:.1f}" y="{band+130}" width="{size}" height="{size}" fill="#fff"/>')
s.append('</svg>')
open(OUT+'cstack-drift.svg','w').write('\n'.join(s)+'\n')
# ---------- nine layers ----------
L=[('01','Reality','What is true about the product'),('02','Culture','People, scenes, rituals, language'),('03','Canon','Models from people who did it well'),('04','References','Source, mechanism, transfer'),('05','System','Tokens, type, grid, motion, voice'),('06','Generation','People, agents, code, models'),('07','Judgment','Never by the maker'),('08','Memory','Every correction written down'),('09','Compounding taste','The next brief starts smarter')]
W=1200; top=96; step=78; H=top+8*step+96; pw=380; lx=470; loopx=410; s=head(W,H,'The nine layers of cstack','A Klein blue panel reads: One line, nine stops. Beside it, one transit line with nine stops from Reality to Compounding taste. A branch runs from Memory back up to Canon: every decision feeds back.')
s.append(f'<rect width="{W}" height="{H}" fill="{P}"/>')
s.append(f'<rect width="{pw}" height="{H}" fill="{BLUE}"/>')
s.append(T('One line,',48,top+44,60,'b','#fff',track=-1.8)); s.append(T('nine stops.',48,top+112,60,'b','#fff',track=-1.8))
for k,l in enumerate(['From the world inward,','and back out. Every','decision feeds back.']):
    s.append(T(l,48,top+176+k*32,24,'r','#fff'))
y=lambda i: top+i*step; d=lx-loopx
s.append(f'<path d="M{lx} {y(7)} L{loopx} {y(7)-d} L{loopx} {y(2)+d} L{lx} {y(2)}" fill="none" stroke="{BLUE}" stroke-width="12" stroke-linejoin="round" opacity="0.32"/>')
s.append(f'<line x1="{lx}" y1="{y(0)}" x2="{lx}" y2="{y(8)}" stroke="{BLUE}" stroke-width="12"/>')
for i,(num,name,desc) in enumerate(L):
    last=i==8
    s.append(f'<circle cx="{lx}" cy="{y(i)}" r="{17 if last else 13}" fill="{BLUE if last else P}" stroke="{BLUE if last else INK}" stroke-width="4"/>')
    s.append(T(name,lx+44,y(i)+4,30,'b',INK,track=-.5))
    s.append(T(desc,lx+44,y(i)+32,20,'r',GREY))
s.append('</svg>')
open(OUT+'nine-layers.svg','w').write('\n'.join(s)+'\n')
print('ok')
