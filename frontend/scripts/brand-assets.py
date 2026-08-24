#!/usr/bin/env python3
"""Generate Trace's native icon, adaptive icon, splash mark and favicon.

    python scripts/brand-assets.py

>>> THESE ARE PLACEHOLDERS. <<<
The mark is a circuit trace — a routed track stepping across the brand
gradient, with a via at each end. It is deliberately plain: enough to build and
install against, not a finished identity. Replace it before submitting to
either store.

Committed as a script rather than as four opaque binaries: the art is
reproducible, a colour change is a diff rather than a re-export, and nobody has
to guess how the files were made.

These are native assets. `eas update` cannot deliver them, so changing them
needs a new build.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/images"

# Brand palette — keep in step with src/theme.ts.
VIOLET_DEEP = (76, 29, 149)     # #4C1D95  gradient start
VIOLET = (139, 92, 246)         # #8B5CF6  gradient end / primary
LAVENDER = (196, 181, 253)      # #C4B5FD  accent
INK = (26, 20, 40)              # #1A1428  near-black background
OFF_WHITE = (250, 249, 251)     # #FAF9FB

# Android maps the 1024px adaptive foreground onto 108dp, of which only the
# centred 66dp circle survives every OEM mask shape. Anything outside this
# radius can be clipped.
ADAPTIVE_SAFE_RADIUS = 1024 * (66 / 108) / 2

SUPERSAMPLE = 4


def gradient(size: int, start: tuple, end: tuple) -> Image.Image:
    """Diagonal top-left to bottom-right gradient."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(start, end))
    return img


def trace_path(draw: ImageDraw.ImageDraw, size: int, color: tuple, width: int):
    """A routed track: in from the left, two 45-degree jogs, out to the right.

    Drawn from proportions rather than pixel constants so every output size
    produces the same mark.
    """
    def p(fx, fy):
        return (round(fx * size), round(fy * size))

    points = [
        p(0.18, 0.68), p(0.34, 0.68), p(0.46, 0.50),
        p(0.62, 0.50), p(0.74, 0.32), p(0.86, 0.32),
    ]
    draw.line(points, fill=color, width=width, joint="curve")

    # Vias at each terminus — a filled pad with the background punched out.
    for cx, cy in (points[0], points[-1]):
        r = width * 1.5
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


def render_mark(size: int, background, color: tuple, scale: float = 1.0) -> Image.Image:
    """`background` is an RGB tuple, an Image, or None for transparency."""
    ss = size * SUPERSAMPLE
    if isinstance(background, Image.Image):
        base = background.resize((ss, ss), Image.LANCZOS).convert("RGBA")
    elif background is None:
        base = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    else:
        base = Image.new("RGBA", (ss, ss), background + (255,))

    layer = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    trace_path(draw, ss, color + (255,), width=round(ss * 0.055))

    if scale != 1.0:
        inner = round(ss * scale)
        layer = layer.resize((inner, inner), Image.LANCZOS)
        pad = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
        pad.paste(layer, ((ss - inner) // 2, (ss - inner) // 2), layer)
        layer = pad

    return Image.alpha_composite(base, layer).resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    grad = gradient(256, VIOLET_DEEP, VIOLET)

    # Store icon — full bleed, no transparency (both stores reject an alpha
    # channel on the uploaded icon).
    render_mark(1024, grad, OFF_WHITE).convert("RGB").save(OUT / "icon.png")

    # Android adaptive foreground — mark shrunk inside the mask-safe circle,
    # transparent background (app.json supplies the colour behind it).
    safe = (ADAPTIVE_SAFE_RADIUS * 2) / 1024
    render_mark(1024, None, LAVENDER, scale=safe * 0.9).save(OUT / "adaptive-icon.png")

    # Splash — transparent, sits on the ink background set in app.json.
    render_mark(512, None, LAVENDER).save(OUT / "splash-image.png")

    render_mark(48, grad, OFF_WHITE).save(OUT / "favicon.png")

    for f in sorted(OUT.iterdir()):
        print(f"  wrote {f.relative_to(ROOT)}  ({f.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
