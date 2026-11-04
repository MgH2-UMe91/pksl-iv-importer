"""icons/ のアプリアイコンを作る。

    python tools/build_icons.py

図形は下の SHAPES だけで定義し、SVG と PNG を同じ定義から書き出す。
PNG は標準ライブラリだけで描く。iOS のホーム画面でそのまま使うので、
角丸なし・透過なし(RGB)にする。角は iOS が丸める。
"""
import math
import os
import struct
import zlib

VIEW = 180
BG = '#6238c9'
YELLOW = '#ffd23f'
SIZES = {'icon-32.png': 32, 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512}
SUB = 4  # 1ピクセルを SUB×SUB 点で調べてふちを滑らかにする


def cell(x, y):
    return ('rect', x, y, 40, 10, '#ffffff', 0.42)


SHAPES = [cell(22 + c * 48, 22 + r * 48) for r in range(3) for c in range(3) if (r, c) != (1, 1)]
SHAPES.append(('rect', 64, 64, 52, 13, YELLOW, 1))
SHAPES.append(('line', [[(90, 74), (90, 102)], [(76, 90), (90, 104), (104, 90)]], 11, BG))


def rgb(color):
    return tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))


def in_rect(px, py, x, y, size, radius):
    half = size / 2
    dx = abs(px - x - half) - half + radius
    dy = abs(py - y - half) - half + radius
    return math.hypot(max(dx, 0), max(dy, 0)) + min(max(dx, dy), 0) <= radius


def near_segment(px, py, a, b, limit):
    ax, ay = a
    vx, vy = b[0] - ax, b[1] - ay
    t = max(0, min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)))
    return math.hypot(px - ax - t * vx, py - ay - t * vy) <= limit


def bounds(shape):
    if shape[0] == 'rect':
        _, x, y, size = shape[:4]
        return x, y, x + size, y + size
    _, lines, width, _ = shape
    points = [p for line in lines for p in line]
    half = width / 2
    return (min(p[0] for p in points) - half, min(p[1] for p in points) - half,
            max(p[0] for p in points) + half, max(p[1] for p in points) + half)


def hit(shape, px, py):
    if shape[0] == 'rect':
        return in_rect(px, py, *shape[1:5])
    _, lines, width, _ = shape
    return any(near_segment(px, py, a, b, width / 2) for line in lines for a, b in zip(line, line[1:]))


def paint(size):
    pixels = [[rgb(BG)] * size for _ in range(size)]
    scale = VIEW / size
    for shape in SHAPES:
        color = rgb(shape[5] if shape[0] == 'rect' else shape[3])
        opacity = shape[6] if shape[0] == 'rect' else 1
        x0, y0, x1, y1 = bounds(shape)
        for j in range(max(0, int(y0 / scale) - 1), min(size, int(y1 / scale) + 2)):
            for i in range(max(0, int(x0 / scale) - 1), min(size, int(x1 / scale) + 2)):
                inside = sum(
                    hit(shape, (i + (a + .5) / SUB) * scale, (j + (b + .5) / SUB) * scale)
                    for a in range(SUB) for b in range(SUB))
                if inside:
                    k = inside / SUB ** 2 * opacity
                    pixels[j][i] = tuple(p * (1 - k) + c * k for p, c in zip(pixels[j][i], color))
    return pixels


def png(pixels):
    def chunk(kind, data):
        body = kind + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    size = len(pixels)
    raw = b''.join(b'\0' + bytes(round(v) for p in row for v in p) for row in pixels)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


def svg():
    parts = [f'<rect width="{VIEW}" height="{VIEW}" fill="{BG}"/>']
    for shape in SHAPES:
        if shape[0] == 'rect':
            _, x, y, size, radius, color, opacity = shape
            alpha = '' if opacity == 1 else f' fill-opacity="{opacity}"'
            parts.append(f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{radius}" fill="{color}"{alpha}/>')
        else:
            _, lines, width, color = shape
            d = ''.join('M' + 'L'.join(f'{x} {y}' for x, y in line) for line in lines)
            parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW} {VIEW}">{"".join(parts)}</svg>\n'


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, 'icon.svg'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(svg())
    for name, size in SIZES.items():
        with open(os.path.join(out, name), 'wb') as f:
            f.write(png(paint(size)))


if __name__ == '__main__':
    main()
