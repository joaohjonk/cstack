# Labelled contact sheet of the r5 window probes (FreeSans labels).
import glob, os
from PIL import Image, ImageDraw, ImageFont
FF = os.environ['FREESANS_DIR'].rstrip('/') + '/'
f = ImageFont.truetype(FF + 'FreeSans.ttf', 26); fb = ImageFont.truetype(FF + 'FreeSansBold.ttf', 38)
P, INK, T, G = (246, 244, 239), (21, 21, 21), 720, 24
fs = sorted(glob.glob('*_gptimage2_1.jpg'))
s = Image.new('RGB', (G + 2 * (T + G), 90 + 2 * (T + 44 + G)), P); d = ImageDraw.Draw(s)
d.text((G, 26), 'Outside, seen from inside: r5 probes, gpt-image-2 on fal, medium, 1024x1024', font=fb, fill=INK)
for i, p in enumerate(fs):
    x, y = G + (i % 2) * (T + G), 90 + (i // 2) * (T + 44 + G)
    s.paste(Image.open(p).convert('RGB').resize((T, T), Image.LANCZOS), (x, y))
    d.text((x, y + T + 8), p.replace('_1.jpg', '').replace('_', '  ·  '), font=f, fill=INK)
s.save('contact-sheet-r5.jpg', quality=84, optimize=True); print(s.size, os.path.getsize('contact-sheet-r5.jpg') // 1024, 'KB')
