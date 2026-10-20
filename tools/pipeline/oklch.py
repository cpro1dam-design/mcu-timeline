# -*- coding: utf-8 -*-
"""Couleurs : sRGB ↔ OKLab/OKLCH (Björn Ottosson), luminance et contraste WCAG.

Mêmes constantes que site/shared/js/color.js (vecteurs de test communs dans tools/tests).
"""
import math


def hex_to_rgb(h):
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def rgb_to_hex(rgb):
    return '#' + ''.join('{:02X}'.format(int(round(max(0.0, min(1.0, c)) * 255))) for c in rgb)


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _gam(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def rgb_to_oklab(rgb):
    r, g, b = (_lin(c) for c in rgb)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = (math.copysign(abs(x) ** (1 / 3.0), x) for x in (l, m, s))
    return (0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_)


def oklab_to_rgb(lab):
    L, a, b = lab
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return tuple(_gam(c) if c >= 0 else -_gam(-c) for c in (r, g, bb))


def rgb_to_oklch(rgb):
    L, a, b = rgb_to_oklab(rgb)
    C = math.hypot(a, b)
    H = math.degrees(math.atan2(b, a)) % 360
    return L, C, H


def oklch_to_rgb(lch):
    L, C, H = lch
    return oklab_to_rgb((L, C * math.cos(math.radians(H)), C * math.sin(math.radians(H))))


def in_gamut(rgb, eps=1e-4):
    return all(-eps <= c <= 1 + eps for c in rgb)


def oklch_to_hex(L, C, H):
    """Projection dans le gamut sRGB en réduisant la chroma (recherche dichotomique)."""
    rgb = oklch_to_rgb((L, C, H))
    if not in_gamut(rgb):
        lo, hi = 0.0, C
        for _ in range(30):
            mid = (lo + hi) / 2
            if in_gamut(oklch_to_rgb((L, mid, H))):
                lo = mid
            else:
                hi = mid
        rgb = oklch_to_rgb((L, lo, H))
    return rgb_to_hex(rgb)


def hex_to_oklch(h):
    return rgb_to_oklch(hex_to_rgb(h))


def luminance(h):
    r, g, b = (_lin(c) for c in hex_to_rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def composite(fg_hex, alpha, bg_hex):
    f, b = hex_to_rgb(fg_hex), hex_to_rgb(bg_hex)
    return rgb_to_hex(tuple(alpha * x + (1 - alpha) * y for x, y in zip(f, b)))


def clamp_lightness_for_luminance(L, C, H, max_y):
    """Baisse L jusqu'à ce que la luminance relative WCAG soit ≤ max_y."""
    h = oklch_to_hex(L, C, H)
    while luminance(h) > max_y and L > 0.02:
        L -= 0.005
        h = oklch_to_hex(L, C, H)
    return L, h


def raise_until_contrast(L, C, H, bg_hex, minimum, step=0.01, max_l=0.98):
    """Monte L jusqu'à atteindre `minimum` de contraste avec `bg_hex`."""
    h = oklch_to_hex(L, C, H)
    while contrast(h, bg_hex) < minimum and L < max_l:
        L += step
        h = oklch_to_hex(L, C, H)
    return L, h
