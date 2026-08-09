"""
Builds the static OG card. Run by hand, not at build time — the image never
changes, so committing the PNG beats rendering it on every request.

Mirrors Ramps' card: mono eyebrow, big Geist title, ash subtitle on the left;
the tool's actual subject bleeding off the right edge. There it's colour
swatches, here it's easing curves — drawn with the real maths, so the card
shows curves the tool would actually produce.
"""
import math
from PIL import Image, ImageDraw, ImageFont

F = "/Users/ry/Projects/Studio Tools/Ramps Studio/public/fonts"
OUT = "/Users/ry/Projects/Studio Tools/Motion Studio/public/og.png"
W, H, S = 1200, 630, 2          # S = supersample factor, downsampled at the end
PAPER, INK, ASH, LINE = (253, 253, 252), (22, 21, 15), (107, 106, 99), (230, 229, 223)

def f(name, size):
    return ImageFont.truetype(f"{F}/{name}", size * S)

def bezier(x1, y1, x2, y2):
    """y at a given x for a cubic-bezier, by bisection on t. Good enough here."""
    def bez(a, b, t):
        u = 1 - t
        return 3 * u * u * t * a + 3 * u * t * t * b + t ** 3
    def at(x):
        lo, hi = 0.0, 1.0
        for _ in range(24):
            mid = (lo + hi) / 2
            if bez(x1, x2, mid) < x: lo = mid
            else: hi = mid
        return bez(y1, y2, (lo + hi) / 2)
    return at

def spring_fn(z, w0):
    """
    Plotted over its own settling time, not a flat second.

    The envelope decays as exp(-z*w0*t), so ~5 time constants is where it is
    visually done. Evaluating a 320 N/m spring across a full second spends 70%
    of the tile on a straight line — technically the curve, but it reads as a
    step, not a spring.
    """
    wd = w0 * math.sqrt(1 - z * z)
    span = 5.0 / (z * w0)
    def at(t):
        u = t * span
        return 1 - math.exp(-z * w0 * u) * (
            math.cos(wd * u) + (z * w0 / wd) * math.sin(wd * u))
    return at

# The tool's real presets, not invented shapes. Seven of them, and seven is
# coprime with the four-per-row grid, so no two tiles in the same column or on
# the same diagonal ever repeat — the earlier version reused one curve for the
# three shipped motions, which share a bezier and differ only in duration, and
# a card of identical curves says nothing about what the tool makes.
#
# Springs are (damping ratio, natural frequency), derived from the presets:
# zeta = c / (2*sqrt(k*m)), w0 = sqrt(k/m).
CURVES = [
    ("default",  bezier(0.2, 0, 0, 1)),
    ("ease out", bezier(0, 0, 0.58, 1)),
    ("ease in",  bezier(0.42, 0, 1, 1)),
    ("in-out",   bezier(0.42, 0, 0.58, 1)),
    ("lively",   spring_fn(0.73, 320 ** 0.5)),
    ("bouncy",   spring_fn(0.40, 400 ** 0.5)),
    ("wobbly",   spring_fn(0.27, 500 ** 0.5)),
]

img = Image.new("RGB", (W * S, H * S), PAPER)
d = ImageDraw.Draw(img)

# ---- Left: the same words as the page header ----
d.text((72 * S, 168 * S), "S P R I N G S . S T U D I O", font=f("GeistMono-Regular.ttf", 19), fill=ASH)
d.text((72 * S, 214 * S), "Motion Token", font=f("Geist-SemiBold.ttf", 78), fill=INK)
d.text((72 * S, 296 * S), "Generator",    font=f("Geist-SemiBold.ttf", 78), fill=INK)
sub = f("Geist-Regular.ttf", 26)
d.text((72 * S, 404 * S), "Generate agent-optimized easings and", font=sub, fill=ASH)
d.text((72 * S, 440 * S), "semantic tokens in a few clicks.",     font=sub, fill=ASH)

# ---- Right: curve tiles, staggered and bleeding off the edge like Ramps ----
TILE, GAP, OFFSETS = 126, 14, [96, 0, 60, 24]
top = (H - (4 * TILE + 3 * GAP)) // 2
mono = f("GeistMono-Regular.ttf", 15)
for row in range(4):
    y = top + row * (TILE + GAP)
    x0 = 600 + OFFSETS[row]
    for col in range(4):
        x = x0 + col * (TILE + GAP)
        if x > W: break
        box = [x * S, y * S, (x + TILE) * S, (y + TILE) * S]
        d.rounded_rectangle(box, radius=12 * S, fill=(247, 246, 243), outline=LINE, width=S)
        name, fn = CURVES[(row * 4 + col) % len(CURVES)]
        # Sample first, then fit — a spring overshoots past 1 and the peak has
        # to sit inside the tile, so the plot is scaled to the range the curve
        # actually reaches rather than to [0, 1].
        vals = [fn(i / 60) for i in range(61)]
        lo, hi = min(0.0, min(vals)), max(1.0, max(vals))
        span = hi - lo
        padx, padt, padb = 20, 20, 34   # room for the label along the bottom
        plot = TILE - padt - padb
        pts = [
            ((x + padx + (i / 60) * (TILE - padx * 2)) * S,
             (y + padt + (hi - v) / span * plot) * S)
            for i, v in enumerate(vals)
        ]
        d.line(pts, fill=INK, width=3 * S, joint="curve")
        d.text(((x + padx) * S, (y + TILE - 25) * S), name, font=mono, fill=ASH)

img.resize((W, H), Image.LANCZOS).save(OUT)
print("wrote", OUT)
