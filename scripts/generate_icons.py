#!/usr/bin/env python3
"""
Generate the extension's icons.

We use only the Python standard library (struct + zlib) so contributors do
not need Pillow or any other image library to rebuild icons. The design is
an original chat-bubble silhouette with a downward export arrow inside,
rendered on a transparent background.

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
BUBBLE    = (47, 111, 235, 255)   # Open Chat Archiver blue
BUBBLE_HI = (104, 148, 243, 255)  # lighter accent
ARROW     = (255, 255, 255, 255)  # white arrow


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

    # Bubble body: rounded square, slightly taller than the tail.
    pad = max(1, size // 10)
    radius = max(2, size // 5)
    body_x0 = pad
    body_y0 = pad
    body_x1 = size - pad
    body_y1 = size - pad - max(1, size // 7)   # leave room for the tail
    draw_rounded_rect(px, body_x0, body_y0, body_x1, body_y1, radius, BUBBLE)

    # Tail: small triangle on the bottom-left corner.
    tail_cx = body_x0 + max(2, size // 5)
    tail_top = body_y1 - 1
    tail_h = max(2, size // 7)
    tail_half = max(2, size // 9)
    draw_triangle_down(px, tail_cx, tail_top, tail_half, tail_h, BUBBLE)

    # Subtle top-edge highlight for a small amount of depth.
    fill_rect(px,
              body_x0 + radius // 2,
              body_y0 + max(1, size // 32),
              body_x1 - radius // 2,
              body_y0 + max(2, size // 20),
              BUBBLE_HI)

    # Download arrow inside the bubble (stem + head).
    cx = (body_x0 + body_x1) // 2
    stem_halfw = max(1, size // 20)
    stem_top = body_y0 + max(2, size // 5)
    stem_bot = body_y1 - max(3, size // 4)
    fill_rect(px, cx - stem_halfw, stem_top, cx + stem_halfw + 1, stem_bot, ARROW)
    head_half = max(2, size // 6)
    head_height = max(2, size // 6)
    draw_triangle_down(px, cx, stem_bot, head_half, head_height, ARROW)

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
