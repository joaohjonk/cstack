# Contact sheets of every probe, labelled territory · model · seed. Labels in FreeSans.
import glob, os
from PIL import Image, ImageDraw, ImageFont
FF = os.environ['FREESANS_DIR'].rstrip('/') + '/'
f = ImageFont.truetype(FF + 'FreeSans.ttf', 26); fb = ImageFont.truetype(FF + 'FreeSansBold.ttf', 40)
P = (246, 244, 239); INK = (21, 21, 21)
TW, TH, G, LH = 960, 480, 24, 44
def sheet(files, title, out, cols=2):
  rows = (len(files) + cols - 1) // cols
  W = G + cols * (TW + G); H = 90 + rows * (TH + LH + G)
  s = Image.new('RGB', (W, H), P); d = ImageDraw.Draw(s)
  d.text((G, 24), title, font=fb, fill=INK)
  for i, p in enumerate(files):
    x = G + (i % cols) * (TW + G); y = 90 + (i // cols) * (TH + LH + G)
    im = Image.open(p).convert('RGB'); w, h = im.size; nh = round(w / 2)
    if h > nh: im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    s.paste(im.resize((TW, TH), Image.LANCZOS), (x, y))
    terr, model, seed = os.path.basename(p).rsplit('_', 1)[0].split('_')
    d.text((x, y + TH + 8), f'{terr}  ·  {model}  ·  {seed}', font=f, fill=INK)
  s.save(out, quality=82, optimize=True); print(out, s.size, os.path.getsize(out) // 1024, 'KB')
probes = sorted(glob.glob('probes/*_1.jpg'))
for key, name in [('A-', 'A-studio'), ('B-', 'B-pigment'), ('C-', 'C-poster')]:
  sheet([p for p in probes if os.path.basename(p).startswith(key)], f'Territory {name}', f'sheet-{name}.jpg')
sheet(probes, 'cstack self-imagery probes, 2026-10-03 (12, draft tier)', 'contact-sheet.jpg', cols=4)
