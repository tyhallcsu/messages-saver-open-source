#!/usr/bin/env python3
"""
Generate the extension's icons.

We use only the Python standard library (struct + zlib) so contributors do
not need Pillow or any other image library to rebuild icons. The design is
an original blue app tile containing a white chat bubble and a downward
export arrow, rendered on a transparent background.

Run from the project root:
    python3 scripts/generate_icons.py
"""

from __future__ import annotations

import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(__file__), os.pardir, "icons")
SIZES = (16, 48, 128)

BG        = (0, 0, 0, 0)          # transparent
TILE      = (31, 92, 225, 255)    # primary tile blue
TILE_HI   = (111, 164, 255, 255)  # top highlight
TILE_LO   = (24, 73, 176, 255)    # lower shade
SHADOW    = (15, 52, 132, 255)    # bubble shadow
BUBBLE    = (255, 255, 255, 255)  # white chat bubble
ARROW     = (35, 96, 224, 255)    # blue arrow inside the bubble


def write_png(path: str, pixels, w: int, h: int) -> None:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + kind + data
                + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))

    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter: none
        for x in range(w):
            r, g, b, a = pixels[y][x]
            raw.extend((r, g, b, a))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as fh:
        fh.write(sig)
        fh.write(chunk(b"IHDR", ihdr))
        fh.write(chunk(b"IDAT", idat))
        fh.write(chunk(b"IEND", b""))


def blank(w: int, h: int):
    return [[BG for _ in range(w)] for _ in range(h)]


def fill_rect(pixels, x0, y0, x1, y1, color):
    h = len(pixels)
    w = len(pixels[0])
    x0 = max(0, int(x0)); y0 = max(0, int(y0))
    x1 = min(w, int(x1)); y1 = min(h, int(y1))
    for y in range(y0, y1):
        row = pixels[y]
        for x in range(x0, x1):
            row[x] = color


def fill_circle(pixels, cx, cy, r, color):
    r2 = r * r
    h = len(pixels)
    w = len(pixels[0])
    for y in range(max(0, int(cy - r)), min(h, int(cy + r + 1))):
        for x in range(max(0, int(cx - r)), min(w, int(cx + r + 1))):
            dx = x - cx
            dy = y - cy
            if dx * dx + dy * dy <= r2:
                pixels[y][x] = color


def draw_rounded_rect(pixels, x0, y0, x1, y1, radius, color):
    fill_rect(pixels, x0 + radius, y0, x1 - radius, y1, color)
    fill_rect(pixels, x0, y0 + radius, x1, y1 - radius, color)
    fill_circle(pixels, x0 + radius, y0 + radius, radius, color)
    fill_circle(pixels, x1 - radius - 1, y0 + radius, radius, color)
    fill_circle(pixels, x0 + radius, y1 - radius - 1, radius, color)
    fill_circle(pixels, x1 - radius - 1, y1 - radius - 1, radius, color)


def draw_triangle_down(pixels, cx, top_y, half_base, height, color):
    # Isosceles triangle pointing down, origin at (cx, top_y).
    h = len(pixels)
    w = len(pixels[0])
    for row in range(height):
        # widen from 0 at bottom to half_base at top? No: widest at top, narrow at the bottom point.
        ratio = (height - row) / height
        span = max(0, int(half_base * ratio))
        y = top_y + row
        if y < 0 or y >= h:
            continue
        x0 = max(0, int(cx - span))
        x1 = min(w, int(cx + span + 1))
        for x in range(x0, x1):
            pixels[y][x] = color


def render(size: int):
    px = blank(size, size)

    # App tile.
    pad = max(1, size // 14)
    tile_radius = max(3, size // 5)
    tile_x0 = pad
    tile_y0 = pad
    tile_x1 = size - pad
    tile_y1 = size - pad
    draw_rounded_rect(px, tile_x0, tile_y0, tile_x1, tile_y1, tile_radius, TILE)

    # Tile highlight and base shade.
    fill_rect(px,
              tile_x0 + tile_radius // 2,
              tile_y0 + max(1, size // 24),
              tile_x1 - tile_radius // 2,
              tile_y0 + max(2, size // 10),
              TILE_HI)
    fill_rect(px,
              tile_x0 + max(1, size // 10),
              tile_y1 - max(2, size // 8),
              tile_x1 - max(1, size // 10),
              tile_y1 - max(1, size // 18),
              TILE_LO)

    # Chat bubble shadow.
    bubble_x0 = tile_x0 + max(2, size // 5)
    bubble_y0 = tile_y0 + max(2, size // 5)
    bubble_x1 = tile_x1 - max(2, size // 6)
    bubble_y1 = tile_y0 + max(6, size // 2)
    bubble_radius = max(2, size // 8)
    shadow_dx = max(1, size // 48)
    shadow_dy = max(1, size // 48)
    draw_rounded_rect(
        px,
        bubble_x0 + shadow_dx,
        bubble_y0 + shadow_dy,
        bubble_x1 + shadow_dx,
        bubble_y1 + shadow_dy,
        bubble_radius,
        SHADOW,
    )
    tail_cx = bubble_x0 + max(2, size // 10)
    tail_half = max(1, size // 14)
    tail_height = max(2, size // 10)
    draw_triangle_down(
        px,
        tail_cx + shadow_dx,
        bubble_y1 - 1 + shadow_dy,
        tail_half,
        tail_height,
        SHADOW,
    )

    # Foreground chat bubble.
    draw_rounded_rect(px, bubble_x0, bubble_y0, bubble_x1, bubble_y1, bubble_radius, BUBBLE)
    draw_triangle_down(
        px,
        tail_cx,
        bubble_y1 - 1,
        tail_half,
        tail_height,
        BUBBLE,
    )

    # Download arrow inside the bubble.
    cx = (bubble_x0 + bubble_x1) // 2
    stem_halfw = max(1, size // 24)
    stem_top = bubble_y0 + max(2, size // 8)
    stem_bot = bubble_y1 - max(3, size // 7)
    fill_rect(px, cx - stem_halfw, stem_top, cx + stem_halfw + 1, stem_bot, ARROW)
    head_half = max(2, size // 8)
    head_height = max(2, size // 8)
    draw_triangle_down(px, cx, stem_bot - 1, head_half, head_height, ARROW)

    return px


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        pixels = render(size)
        path = os.path.join(OUT_DIR, f"icon-{size}.png")
        write_png(path, pixels, size, size)
        print(f"wrote {path} ({size}x{size})")


if __name__ == "__main__":
    main()
