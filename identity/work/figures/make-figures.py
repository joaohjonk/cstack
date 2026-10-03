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
# ---------- hero: Swiss poster ----------
W,H=1200,640; s=head(W,H,'cstack','A Swiss poster in Klein blue on a twelve-column grid. Taste, made repeatable. Before use: step outside. A row of twelve square positions, one per column; a figure made of squares stands on three of them with a fourth limb in the air, mid-move, its square head turned to the viewer. A giant white lowercase cstack with a square full stop sits on the bottom edge.')
s.append(f'<rect width="{W}" height="{H}" fill="{BLUE}"/>')
col=W/12
for i in range(1,12): s.append(f'<line x1="{i*col:.1f}" y1="0" x2="{i*col:.1f}" y2="{H}" stroke="#fff" stroke-opacity="0.12"/>')
big,bw=text('cstack.',-14,H-22,318,'b','#fff',track=-15)
s.append(big)
s.append(T('Taste, made repeatable.',24,84,52,'b','#fff',track=-1.2))
s.append(T('Before use: step outside.',24,148,52,'r','#fff',track=-1.2))
q=36; floor=344; cx=lambda c: c*col+col/2; stand=[7,10,11]   # three positions taken; the back-near limb is in the air, between moves
for c in range(12): s.append(position(cx(c)-q/2,floor-q,q,'#fff',c in stand,2))
s+=figure((cx(7)+cx(10))/2-2.5*q,170,q,[(cx(7),floor-q),(cx(6)+6,floor-q-26),(cx(10),floor-q),(cx(11),floor-q)],'#fff',[(-14,4),(4,26),(-10,4),(-12,-4)])
s.append('</svg>')
open(OUT+'cstack-hero.svg','w').write('\n'.join(s)+'\n')
# ---------- drift: squares only ----------
W,H,m=1200,520,96; s=head(W,H,'Prompted versus kept in files','Ten squares made from prompts drift in size and angle. Below, on a Klein blue band, ten squares made from one brand kept in files are identical.')
s.append(f'<rect width="{W}" height="{H}" fill="{P}"/>')
band=250; s.append(f'<rect y="{band}" width="{W}" height="{H-band}" fill="{BLUE}"/>')
n=10; colw=(W-2*m)/n; size=64
s.append(T('Prompted ten times',m,84,44,'b',INK,track=-.8))
dr=[[0,0,0,1],[4,-3,5,1.04],[-5,4,-8,.92],[7,-5,11,1.1],[-8,6,-14,.88],[10,-7,18,1.14],[-11,9,-22,.84],[9,-10,27,1.16],[-6,12,-31,.82],[-4,-9,38,1.18]]
for i in range(n):
    dx,dy,rot,sc=dr[i]; sz=size*sc; cx=m+i*colw+colw/2+dx; cy=170+dy
    s.append(f'<rect x="{cx-sz/2:.1f}" y="{cy-sz/2:.1f}" width="{sz:.1f}" height="{sz:.1f}" fill="none" stroke="{INK}" stroke-width="2" transform="rotate({rot} {cx:.1f} {cy:.1f})"/>')
s.append(T('Made ten times from one brand, kept in files',m,band+80,44,'b','#fff',track=-.8))
for i in range(n):
    cx=m+i*colw+colw/2
    s.append(f'<rect x="{cx-size/2:.1f}" y="{band+136}" width="{size}" height="{size}" fill="#fff"/>')
s.append('</svg>')
open(OUT+'cstack-drift.svg','w').write('\n'.join(s)+'\n')
# ---------- nine layers ----------
L=[('01','Reality','What is true about the product'),('02','Culture','People, scenes, rituals, language'),('03','Canon','Models from people who did it well'),('04','References','Source, mechanism, transfer'),('05','System','Tokens, type, grid, motion, voice'),('06','Generation','People, agents, code, models'),('07','Judgment','Never by the maker'),('08','Memory','Every correction written down'),('09','Compounding taste','The next brief starts smarter')]
W=800; band=250; top=band+70; step=104; H=top+8*step+80; lx=96; loopx=44
s=head(W,H,'The nine layers of cstack','A Klein blue band reads: One line, nine stops. From the world inward, and back out. Below, one transit line with nine stops from Reality to Compounding taste. A branch runs from Memory back up to Canon: every decision feeds back.')
s.append(f'<rect width="{W}" height="{H}" fill="{P}"/>')
s.append(f'<rect width="{W}" height="{band}" fill="{BLUE}"/>')
s.append(T('One line, nine stops.',44,112,64,'b','#fff',track=-2))
s.append(T('From the world inward, and back out.',44,170,30,'r','#fff'))
s.append(T('Every decision feeds back.',44,208,30,'r','#fff'))
y=lambda i: top+i*step; d=lx-loopx
s.append(f'<path d="M{lx} {y(7)} L{loopx} {y(7)-d} L{loopx} {y(2)+d} L{lx} {y(2)}" fill="none" stroke="{BLUE}" stroke-width="12" stroke-linejoin="round" opacity="0.32"/>')
s.append(f'<line x1="{lx}" y1="{y(0)}" x2="{lx}" y2="{y(8)}" stroke="{BLUE}" stroke-width="12"/>')
for i,(num,name,desc) in enumerate(L):
    last=i==8
    s.append(f'<circle cx="{lx}" cy="{y(i)}" r="{18 if last else 14}" fill="{BLUE if last else P}" stroke="{BLUE if last else INK}" stroke-width="4"/>')
    s.append(T(name,lx+48,y(i)+6,40,'b',INK,track=-.8))
    s.append(T(desc,lx+48,y(i)+44,30,'r',GREY))
s.append('</svg>')
open(OUT+'nine-layers.svg','w').write('\n'.join(s)+'\n')
# ---------- the field: thirty skills by stage, one job's route (docs/architecture.md#skill-map) ----------
import re
rows=[]
for line in open('docs/architecture.md').read().split('## Skill map')[1].split('\n\n`workflow`')[0].splitlines():
    m=re.match(r'\| ([A-Z][^|]+?) \| (`.*`) \|$',line)
    if m: rows.append((m.group(1),re.findall(r'`([a-z0-9-]+)`',m.group(2))))
route={'Think':'brief','Know the brand':'identity-system','Direct':'creative-direction','Make':'vector-master','Judge':'brand-verify','Remember':'learn-loop'}   # the job that drew these figures
W=1000; band=260; rh=112; top=band+76; sx=420; px=80; q=48; H=top+len(rows)*rh+16
s=head(W,H,'The field: cstack skills by stage',f'A Klein blue band reads: Seven stages, one route. Each square is a skill, in rows by stage from Think to Remember. A transit line runs down through the rows and stops on one square in each stage it needs: brief, identity-system, creative-direction, vector-master, brand-verify, learn-loop. In Look outward it does not stop.')
s.append(f'<rect width="{W}" height="{H}" fill="{P}"/>')
s.append(f'<rect width="{W}" height="{band}" fill="{BLUE}"/>')
s.append(T('Seven stages, one route.',44,112,64,'b','#fff',track=-2))
s.append(T('Each square is a skill. A job stops',44,172,36,'r','#fff'))
s.append(T('only where it needs to.',44,216,36,'r','#fff'))
cy=lambda i: top+i*rh+q/2
xs=[]
for i,(stage,skills) in enumerate(rows):   # where the line crosses each row: through its stop, or between two squares when it has none
    xs.append(sx+skills.index(route[stage])*px+q/2 if stage in route else sx+3*px+q+(px-q)/2)
pts=[(xs[0],top-36)]
for i,x in enumerate(xs):   # vertical through each row, horizontal in the gap below it
    pts.append((x,cy(i)))
    if i+1<len(xs) and xs[i+1]!=x: g=cy(i)+rh/2; pts+= [(x,g),(xs[i+1],g)]
pts.append((xs[-1],cy(len(xs)-1)))
def chamfer(pts,c=18):
    out=[pts[0]]
    for (x0,y0),(x1,y1),(x2,y2) in zip(pts,pts[1:],pts[2:]):
        if (x0==x1)==(x1==x2): out.append((x1,y1)); continue
        d=lambda a,b: (b>a)-(b<a)
        out+= [(x1-d(x0,x1)*c,y1-d(y0,y1)*c),(x1+d(x1,x2)*c,y1+d(y1,y2)*c)]
    return out+[pts[-1]]
pts=chamfer(pts)
s.append(f'<polyline points="{" ".join(f"{a:.1f},{b:.1f}" for a,b in pts)}" fill="none" stroke="{BLUE}" stroke-width="12" stroke-linejoin="round"/>')
for i,(stage,skills) in enumerate(rows):
    s.append(T(stage,44,cy(i)-2,42,'b',INK,track=-.8))
    s.append(T(route.get(stage) or 'not this time',44,cy(i)+44,38,'r',GREY))
    for j,k in enumerate(skills):
        x=sx+j*px; y=cy(i)-q/2
        if k==route.get(stage): s.append(position(x,y,q,BLUE,True))
        else: s.append(position(x,y,q,GREY,False,2.5))
s.append('</svg>')
open(OUT+'the-field.svg','w').write('\n'.join(s)+'\n')
print('ok')
