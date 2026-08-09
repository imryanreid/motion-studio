"""
Rasterises public/favicon.svg into the two PNG icons.

Split deliberately: WebKit (via qlmanage) strokes the curve smoothly, but it
composites SVG onto white, so the rounded corners come back opaque. Pillow has
exact alpha but its polyline stroking serrates visibly even at 8x supersample.
So WebKit draws, Pillow masks.

Run by hand. The mark only changes when the brand does.
"""
import subprocess, tempfile, os
from PIL import Image, ImageDraw

ROOT = "/Users/ry/Projects/Studio Tools/Motion Studio"
SVG = f"{ROOT}/public/favicon.svg"
INK = (19, 18, 16)
RADIUS = 7 / 32          # matches rx="7" in the 32-unit viewBox

# Always rasterise here, then downscale. qlmanage does not honour small -s
# values: asking for 192 returned a 192 canvas with the artwork drawn at 123px
# in the corner, while 512 and 1024 fill exactly. Rendering big and resizing is
# both correct and sharper.
RASTER = 1024

def raster(size: int) -> Image.Image:
    src = open(SVG).read().replace('width="32" height="32"',
                                   f'width="{RASTER}" height="{RASTER}"')
    with tempfile.TemporaryDirectory() as tmp:
        p = os.path.join(tmp, "icon.svg")
        open(p, "w").write(src)
        subprocess.run(["qlmanage", "-t", "-s", str(RASTER), "-o", tmp, p],
                       capture_output=True, check=True)
        out = os.path.join(tmp, "icon.svg.png")
        if not os.path.exists(out):
            raise SystemExit("qlmanage produced nothing — is the SVG valid?")
        big = Image.open(out).convert("RGB")
        if big.size != (RASTER, RASTER):
            raise SystemExit(f"expected {RASTER}px raster, got {big.size}")
        return big.resize((size, size), Image.LANCZOS)

def rounded_alpha(size: int) -> Image.Image:
    S = 8
    m = Image.new("L", (size * S, size * S), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [0, 0, size * S - 1, size * S - 1], radius=RADIUS * size * S, fill=255)
    return m.resize((size, size), Image.LANCZOS)

for size, name, flatten in [(192, "icon-192.png", False), (180, "apple-touch-icon.png", True)]:
    img = raster(size)
    if flatten:
        # iOS applies its own mask and renders a transparent corner as white,
        # so this one ships square with the corners filled in ink.
        base = Image.new("RGB", (size, size), INK)
        base.paste(img, (0, 0), rounded_alpha(size))
        out = base.convert("RGBA")
    else:
        out = img.convert("RGBA")
        out.putalpha(rounded_alpha(size))
    out.save(f"{ROOT}/public/{name}")
    print(name, out.size, "corner:", out.getpixel((0, 0)))
