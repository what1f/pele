# 把 ascii-gallery 的输出拼成 PNG 总览图，按终端格子精确绘制（宽字符占两格）。
#   python3 scripts/ascii-sheet.py gallery.txt out-prefix [--width 2400]
# 输出 out-prefix-1.png、out-prefix-2.png …
import re, sys, unicodedata
from PIL import Image, ImageDraw, ImageFont

args = sys.argv[1:]
src, prefix = args[0], args[1]
page_w = int(args[args.index('--width') + 1]) if '--width' in args else 2400
text = open(src).read()
parts = re.split(r'^=== (.*)\n', text, flags=re.M)
sections = [(parts[i], parts[i + 1].rstrip('\n').split('\n')) for i in range(1, len(parts), 2)]

CW, CH, FS = 9, 18, 15
mono = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', FS)
cjk = ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc', FS)
sym = ImageFont.truetype('/System/Library/Fonts/Apple Symbols.ttf', FS)
head = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 13)
MENLO_MISSING = set('◉●◆◇△▽◁▷╱╲┆┄┇┅')

def width(c):
    if unicodedata.combining(c): return 0
    return 2 if unicodedata.east_asian_width(c) in 'WF' else 1

def block(name, lines):
    cols = max([sum(width(c) for c in l) for l in lines] + [len(name) + 2, 8])
    img = Image.new('RGB', (cols * CW + 16, len(lines) * CH + 34), '#1e1e1e')
    d = ImageDraw.Draw(img)
    d.text((8, 6), name, font=head, fill='#7aa2f7')
    for y, l in enumerate(lines):
        x = 0
        color = '#f7768e' if l.startswith('!!') else '#e6e6e6'
        for c in l:
            w = width(c)
            font = cjk if w == 2 else (sym if c in MENLO_MISSING else mono)
            d.text((8 + x * CW, 28 + y * CH), c, font=font, fill=color)
            x += w
    return img

# 简单的按列装箱：一列一列往下排，列满了换下一列，页满了换下一页。
blocks = [block(n, ls) for n, ls in sections]
page_h = 2400
pages, page, x, y, colw = [], [], 10, 10, 0
for b in blocks:
    if y + b.height > page_h and y > 10:
        x += colw + 12; y = 10; colw = 0
    if x + b.width > page_w and x > 10:
        pages.append(page); page = []; x, y, colw = 10, 10, 0
    page.append((x, y, b)); y += b.height + 12; colw = max(colw, b.width)
if page: pages.append(page)
for i, page in enumerate(pages, 1):
    W = max(px + b.width for px, _, b in page) + 10
    H = max(py + b.height for _, py, b in page) + 10
    out = Image.new('RGB', (W, H), '#111')
    for px, py, b in page: out.paste(b, (px, py))
    out.save(f'{prefix}-{i}.png')
    print(f'{prefix}-{i}.png', out.size)
