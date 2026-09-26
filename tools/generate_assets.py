#!/usr/bin/env python3
"""Generate all watchface PNG assets for the NASA Artemis Cheetah Pro watchface.

Re-run any time the design changes:
    python3 tools/generate_assets.py

Outputs go into assets/480x480-amazfit-cheetah-pro/.

Layout is measured from design/watch-face-circle.png (1024x1024 mockup).
Every file in design/ is flat RGB with a checkerboard painted in, not real
transparency, so icons are keyed out here:
  - single-color icon files (heart, steps, battery, NASA worm) are keyed by
    saturation, since the checkerboard is pure gray;
  - the Artemis logo and the shoe are keyed out of the mockup against the
    navy dial, because their files are white-on-white (Artemis) or styled
    differently from the mockup (shoe).
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(ROOT, "assets", "480x480-amazfit-cheetah-pro")
FONT_DIR = os.path.join(ROOT, "tools", "fonts")
DESIGN_DIR = os.path.join(ROOT, "design")
MOCKUP_PATH = os.path.join(DESIGN_DIR, "watch-face-circle.png")

W = H = 480
CX = CY = 240

# Round dial in the mockup: center and radius of the navy display area.
# Device pixels = (mockup pixels - center) * SCALE + 240.
MOCKUP_CX, MOCKUP_CY = 517, 494
MOCKUP_R = 365
SCALE = 240 / MOCKUP_R


def to_device(x, y):
    return (x - MOCKUP_CX) * SCALE + CX, (y - MOCKUP_CY) * SCALE + CY


# ---- palette (sampled from the mockup and icon files) ----
BG_CENTER = (37, 66, 106)
BG_EDGE = (18, 38, 68)
WHITE = (255, 255, 255)
ICON_ORANGE = (203, 82, 35)
NASA_RED = (165, 42, 45)

# ---- layout, device pixels -- keep in sync with watchface/index.js ----
TIME_RIGHT_X = 376
TIME_CENTER_Y = 145
TIME_TEXT_SIZE = 112
AMPM_X = 382
AMPM_CENTER_Y = 172
AMPM_TEXT_SIZE = 34
DATE_CENTER_Y = 216
DATE_TEXT_SIZE = 34
STAT_TEXT_SIZE = 37
STAT_TEXT_X_LEFT = 150
STAT_TEXT_X_RIGHT = 319
STAT_ROW_Y_TOP = 320
STAT_ROW_Y_BOTTOM = 394
ICON_CENTER_X_LEFT = 112
ICON_CENTER_X_RIGHT = 282

# Battery icons are runtime widgets (normal/charging swap), not baked in.
BATTERY_ICON_W = 50


def font(filename, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, filename), size)


TIME_FONT = "Montserrat-SemiBold.ttf"
TEXT_FONT = "Roboto-Medium.ttf"


def navy_background():
    """Radial navy gradient with fine noise, filling the full square (the
    display hardware crops it to a circle)."""
    ys, xs = np.mgrid[0:H, 0:W]
    dist = np.hypot(xs - CX, ys - (CY + 10))
    t = np.clip(dist / 300, 0, 1) ** 1.4
    rgb = np.stack([BG_CENTER[i] + (BG_EDGE[i] - BG_CENTER[i]) * t for i in range(3)], axis=-1)
    rng = np.random.default_rng(7)
    rgb = rgb + rng.normal(0, 3.0, size=(H, W, 1))
    rgb = np.clip(rgb, 0, 255).astype("uint8")
    return Image.fromarray(rgb, "RGB").convert("RGBA")


def resize_rgba(im, size):
    """Resize in premultiplied space so transparent pixels don't bleed their
    color into anti-aliased edges."""
    return im.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")


def key_by_saturation(path, box=None, color=None):
    """Key a colored icon off the gray checkerboard of a design file.
    Alpha comes from saturation; `color` (if given) recolors it flat."""
    rgb = np.array(Image.open(path).convert("RGB")).astype(float)
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)
    alpha = np.clip((sat - 0.15) / 0.35, 0, 1)
    if box is None:
        ys, xs = np.where(alpha > 0.5)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    x0, y0, x1, y1 = box
    rgb = rgb[y0:y1, x0:x1]
    alpha = alpha[y0:y1, x0:x1]
    if color is not None:
        rgb = np.broadcast_to(np.array(color, float), rgb.shape)
    return Image.fromarray(np.dstack([rgb, alpha * 255]).astype("uint8"), "RGBA")


def key_from_mockup(box):
    """Key the icon inside `box` out of the mockup against the navy dial.
    The dial color is the median of the box border; alpha grows with color
    distance from it, and the foreground color is un-mixed from the dial."""
    x0, y0, x1, y1 = box
    rgb = np.array(Image.open(MOCKUP_PATH).convert("RGB")).astype(float)[y0:y1, x0:x1]
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.linalg.norm(rgb - bg, axis=2)
    alpha = np.clip((dist - 35) / 85, 0, 1)
    fg = bg + (rgb - bg) / np.maximum(alpha, 1e-3)[..., None]
    fg = np.clip(fg, 0, 255)
    return Image.fromarray(np.dstack([fg, alpha * 255]).astype("uint8"), "RGBA")


def scaled_to_width(im, width):
    return resize_rgba(im, (width, max(1, round(im.height * width / im.width))))


def paste_centered(dst, icon, cx, cy):
    dst.alpha_composite(icon, (round(cx - icon.width / 2), round(cy - icon.height / 2)))


def mockup_icon(box):
    """Mockup crop scaled to device size, with its device-space center."""
    icon = key_from_mockup(box)
    icon = resize_rgba(icon, (round(icon.width * SCALE), round(icon.height * SCALE)))
    x0, y0, x1, y1 = box
    return icon, to_device((x0 + x1) / 2, (y0 + y1) / 2)


# Crop windows in mockup pixels, each hugging one element with a margin of dial.
ARTEMIS_BOX = (455, 138, 580, 272)
SHOE_BOX = (528, 685, 632, 770)

# Union bbox of the body/bolt in both battery design files, so the normal and
# charging icons share one canvas and swap in place.
BATTERY_SRC_BOX = (202, 557, 566, 844)


def battery_icons():
    """battery.png / battery_charging.png on one shared canvas size."""
    body_src_w = BATTERY_SRC_BOX[2] - BATTERY_SRC_BOX[0]
    normal = key_by_saturation(os.path.join(DESIGN_DIR, "battery-icon.png"),
                               BATTERY_SRC_BOX, ICON_ORANGE)
    charging = key_by_saturation(os.path.join(DESIGN_DIR, "battery-charged-icon.png"),
                                 BATTERY_SRC_BOX)
    size = (BATTERY_ICON_W, round(normal.height * BATTERY_ICON_W / body_src_w))
    return resize_rgba(normal, size), resize_rgba(charging, size)


def build_background():
    im = navy_background()

    artemis, (ax, ay) = mockup_icon(ARTEMIS_BOX)
    paste_centered(im, artemis, CX, ay)

    nasa = scaled_to_width(key_by_saturation(os.path.join(DESIGN_DIR, "nasa-logo.png"),
                                             color=NASA_RED), 81)
    paste_centered(im, nasa, CX, 260)

    heart = scaled_to_width(key_by_saturation(os.path.join(DESIGN_DIR, "heart-icon.png"),
                                              color=ICON_ORANGE), 37)
    paste_centered(im, heart, ICON_CENTER_X_LEFT, STAT_ROW_Y_TOP)

    steps = scaled_to_width(key_by_saturation(os.path.join(DESIGN_DIR, "steps-icon.png"),
                                              color=ICON_ORANGE), 35)
    paste_centered(im, steps, ICON_CENTER_X_RIGHT, STAT_ROW_Y_TOP)

    shoe, _ = mockup_icon(SHOE_BOX)
    paste_centered(im, shoe, ICON_CENTER_X_RIGHT, STAT_ROW_Y_BOTTOM)

    return im


def battery_position(icon):
    """Top-left of the battery widget -- printed for watchface/index.js."""
    return (round(ICON_CENTER_X_LEFT - icon.width / 2),
            round(STAT_ROW_Y_BOTTOM - icon.height / 2))


def render_preview(bg, battery, battery_pos):
    """Composite a sample frame matching the mockup values, for icon.png /
    preview.png. Text anchors mirror the device widgets' align settings."""
    im = bg.copy()
    im.alpha_composite(battery, battery_pos)
    d = ImageDraw.Draw(im)

    d.text((TIME_RIGHT_X, TIME_CENTER_Y), "10:09", font=font(TIME_FONT, TIME_TEXT_SIZE),
           fill=WHITE, anchor="rm")
    d.text((AMPM_X, AMPM_CENTER_Y), "AM", font=font(TIME_FONT, AMPM_TEXT_SIZE),
           fill=WHITE, anchor="lm")
    d.text((CX, DATE_CENTER_Y), "FRI, SEP 24", font=font(TEXT_FONT, DATE_TEXT_SIZE),
           fill=WHITE, anchor="mm")

    f_stat = font(TEXT_FONT, STAT_TEXT_SIZE)
    for x, y, text in [
        (STAT_TEXT_X_LEFT, STAT_ROW_Y_TOP, "72"),
        (STAT_TEXT_X_RIGHT, STAT_ROW_Y_TOP, "8,125"),
        (STAT_TEXT_X_LEFT, STAT_ROW_Y_BOTTOM, "88%"),
        (STAT_TEXT_X_RIGHT, STAT_ROW_Y_BOTTOM, "6.45"),
    ]:
        d.text((x, y), text, font=f_stat, fill=WHITE, anchor="lm")
    return im


def main():
    bg = build_background()
    bg.convert("RGB").save(os.path.join(ASSET_DIR, "bg.png"))

    battery, battery_charging = battery_icons()
    battery.save(os.path.join(ASSET_DIR, "battery.png"))
    battery_charging.save(os.path.join(ASSET_DIR, "battery_charging.png"))
    battery_pos = battery_position(battery)
    print("battery device pos/size", battery_pos, battery.size)

    preview = render_preview(bg, battery, battery_pos)
    preview.save(os.path.join(ROOT, "tools", "_preview_full.png"))

    # zeus build resizes icon.png to the device previewSize (324x324 on
    # Cheetah Pro) for the Zepp app gallery; ship it at that size already.
    thumb = preview.resize((324, 324), Image.LANCZOS).convert("RGB")
    thumb.save(os.path.join(ASSET_DIR, "preview.png"))
    thumb.save(os.path.join(ASSET_DIR, "icon.png"))

    print("Assets written to", ASSET_DIR)


if __name__ == "__main__":
    main()
