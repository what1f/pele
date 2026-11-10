# Draws the README poster: the drawings from scripts/ascii-poster.mjs as terminal windows in two columns.
#   npm run build && python3 scripts/ascii-poster.py [out.png]
import itertools, json, re, subprocess, sys, unicodedata
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else 'media/poster.png'

S = 2  # pixel scale
FS, CW, CH = 13 * S, 8 * S, 17 * S
PAD, BAR, GAP, MARGIN = 14 * S, 26 * S, 16 * S, 24 * S
BG, WIN, BARC, FG, TITLE = '#0d1117', '#161b22', '#1f252e', '#d6dde6', '#8b949e'
DOTS = ['#ff5f57', '#febc2e', '#28c840']

def font(paths, size):
    for p in paths:
        p = Path(p).expanduser()
        if p.exists(): return ImageFont.truetype(str(p), size)
    raise SystemExit(f'no font in {paths}')

mono = font(['~/Library/Fonts/JetBrainsMono-Regular.ttf', '/System/Library/Fonts/Menlo.ttc'], FS)
cjk = font(['/System/Library/Fonts/Hiragino Sans GB.ttc'], FS)
sym = font(['/System/Library/Fonts/Apple Symbols.ttf'], FS)
emoji = font(['/System/Library/Fonts/Apple Color Emoji.ttc'], 40)  # bitmap font: only this size
head = font(['~/Library/Fonts/JetBrainsMono-Medium.ttf', '/System/Library/Fonts/Menlo.ttc'], 11 * S)

data = json.loads(subprocess.run(['node', 'scripts/ascii-poster.mjs'], capture_output=True, check=True).stdout)

def width(c):
    if unicodedata.combining(c): return 0
    return 2 if unicodedata.east_asian_width(c) in 'WF' else 1

def cols(lines): return max(sum(width(c) for c in l) for l in lines)

# Line art is drawn rather than taken from the font, as terminals do, so lines join across cells.
def box_arms(c):
    name = unicodedata.name(c, '')
    if not name.startswith('BOX DRAWINGS ') or re.search('ARC|DIAGONAL|DASH', name): return None
    dirs = {'UP': 'u', 'DOWN': 'd', 'LEFT': 'l', 'RIGHT': 'r', 'VERTICAL': 'ud', 'HORIZONTAL': 'lr'}
    weights = {'LIGHT': 'LIGHT', 'SINGLE': 'LIGHT', 'HEAVY': 'HEAVY', 'DOUBLE': 'DOUBLE'}
    words = name[len('BOX DRAWINGS '):].split()
    default = weights.get(words[0], 'LIGHT')
    arms = {}
    # "LIGHT DOWN AND RIGHT", "DOWN LIGHT AND RIGHT HEAVY", "HEAVY UP AND LIGHT DOWN"
    for group in ' '.join(words).split(' AND '):
        g = group.split()
        if any(w not in dirs and w not in weights for w in g): return None
        w = next((weights[x] for x in g if x in weights), default)
        for x in g:
            if x in dirs:
                for a in dirs[x]: arms[a] = w
    return arms or None

def draw_box(d, x, y, arms, color):
    cx, cy = x + CW // 2, y + CH // 2
    t = {'LIGHT': S, 'HEAVY': 2 * S + 1, 'DOUBLE': S}
    for a, w in arms.items():
        lw = t[w]
        offs = [-S - 1, S + 1] if w == 'DOUBLE' else [0]
        for o in offs:
            if a in 'lr':
                x0, x1 = (x, cx + lw // 2) if a == 'l' else (cx - lw // 2, x + CW)
                d.rectangle([x0, cy + o - lw // 2, x1 - 1, cy + o - lw // 2 + lw - 1], fill=color)
            else:
                y0, y1 = (y, cy + lw // 2) if a == 'u' else (cy - lw // 2, y + CH)
                d.rectangle([cx + o - lw // 2, y0, cx + o - lw // 2 + lw - 1, y1 - 1], fill=color)

# Rounded corners as quarter ellipses through the two edge midpoints; (centre offset in cells, start angle).
ARCS = {'╭': (1, 1, 180), '╮': (0, 1, 270), '╯': (0, 0, 0), '╰': (1, 0, 90)}
DASHES = {'┄': ('h', 3, S), '┅': ('h', 3, 2 * S + 1), '┈': ('h', 4, S), '┆': ('v', 3, S), '┇': ('v', 3, 2 * S + 1), '┊': ('v', 4, S)}

def draw_line_art(d, c, px, py):
    if c in ARCS:
        ox, oy, a = ARCS[c]
        cx, cy = px + ox * CW, py + oy * CH
        d.arc([cx - CW / 2, cy - CH / 2, cx + CW / 2, cy + CH / 2], a, a + 90, fill=FG, width=S)
    elif c in '╱╲':
        y0, y1 = (py + CH, py) if c == '╱' else (py, py + CH)
        d.line([px, y0, px + CW, y1], fill=FG, width=S)
    elif c in DASHES:
        axis, n, lw = DASHES[c]
        span = CW if axis == 'h' else CH
        for i in range(n):
            a, b = px if axis == 'h' else py, 0
            a0 = (px if axis == 'h' else py) + i * span / n + span / n / 4
            a1 = a0 + span / n / 2
            if axis == 'h': d.rectangle([a0, py + CH // 2 - lw // 2, a1, py + CH // 2 - lw // 2 + lw - 1], fill=FG)
            else: d.rectangle([px + CW // 2 - lw // 2, a0, px + CW // 2 - lw // 2 + lw - 1, a1], fill=FG)
    else:
        return False
    return True

# Block elements as rectangles, as terminals draw them, so bars have no seams.
BLOCKS = {'█': (0, 0, 8, 8), '▀': (0, 0, 8, 4), '▄': (0, 4, 8, 8), '▐': (4, 0, 8, 8),
          **{c: (0, 0, 7 - i, 8) for i, c in enumerate('▉▊▋▌▍▎▏')}}

def window(name, lines, w_cols):
    W = w_cols * CW + 2 * PAD
    H = len(lines) * CH + 2 * PAD + BAR
    left = PAD + (w_cols - cols(lines)) * CW // 2
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, W - 1, H - 1], radius=10 * S, fill=WIN, outline='#30363d', width=S)
    d.rounded_rectangle([0, 0, W - 1, BAR], radius=10 * S, fill=BARC)
    d.rectangle([0, BAR - 10 * S, W - 1, BAR], fill=BARC)
    d.line([0, BAR, W, BAR], fill='#30363d', width=S)
    for i, c in enumerate(DOTS):
        r = 5 * S
        cx = 14 * S + i * 18 * S
        d.ellipse([cx - r, BAR // 2 - r, cx + r, BAR // 2 + r], fill=c)
    tw = d.textlength(name, font=head)
    d.text(((W - tw) / 2, BAR / 2), name, font=head, fill=TITLE, anchor='lm')
    top = BAR + PAD
    for row, l in enumerate(lines):
        x = 0
        for c in l:
            w = width(c)
            px, py = left + x * CW, top + row * CH
            arms = box_arms(c)
            if arms: draw_box(d, px, py, arms, FG)
            elif c in BLOCKS:
                x0, y0, x1, y1 = BLOCKS[c]
                d.rectangle([px + x0 * CW // 8, py + y0 * CH // 8, px + x1 * CW // 8 - 1, py + y1 * CH // 8 - 1], fill=FG)
            elif draw_line_art(d, c, px, py): pass
            elif c != ' ':
                f = cjk if w == 2 else (mono if mono.getmask(c).getbbox() and c not in '◉●◆◇△▽◁▷╱╲┆┄┇┅○■×' else sym)
                if ord(c) > 0x1F000:
                    e = Image.new('RGBA', (160, 160))
                    ImageDraw.Draw(e).text((0, 0), c, font=emoji, embedded_color=True)
                    e = e.crop(e.getbbox()).resize((2 * CW - 2 * S, CH - 2 * S))
                    img.paste(e, (px + S, py + S), e)
                else:
                    d.text((px + w * CW / 2, py + CH / 2), c, font=f, fill=FG, anchor='mm')
            x += w
    return img

wins = [window(d['name'], d['lines'], data['width']) for d in data['drawings']]
# Split into two columns, keeping the order, so the columns end as level as possible.
def heights(pick): return [sum(w.height + GAP for w, p in zip(wins, pick) if p == c) for c in (0, 1)]
pick = min(itertools.product((0, 1), repeat=len(wins)), key=lambda p: (max(heights(p)), p))
colw = wins[0].width
W = 2 * colw + GAP + 2 * MARGIN
H = max(heights(pick)) - GAP + 2 * MARGIN
out = Image.new('RGB', (W, H), BG)
ys = [MARGIN, MARGIN]
for w, c in zip(wins, pick):
    out.paste(w, (MARGIN + c * (colw + GAP), ys[c]))
    ys[c] += w.height + GAP
Path(OUT).parent.mkdir(parents=True, exist_ok=True)
out.save(OUT, optimize=True)
print(OUT, out.size)
