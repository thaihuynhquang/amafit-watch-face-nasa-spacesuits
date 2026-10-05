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

Time and stat numbers ship as pre-rendered digit images (IMG_TIME / TEXT_IMG
widgets), not TEXT with a custom font: on the Cheetah Pro, large or several
custom-font TEXT widgets failed to render. The date stays a TEXT widget -- it
needs letters, so it uses the device's system font: with a custom font file
the Cheetah Pro dropped glyphs ("T2, 05/10" showed as "2, 0/0").
"""
import math
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

# Every stat icon (heart, step, power, shoe) is fitted into one square box,
# longer side = ICON_SIZE, so they read as one set on the device. Keep in
# sync with ICON_SIZE in watchface/index.js.
ICON_SIZE = 40
# The heart is a solid, nearly square shape, so at the full box it looks
# bigger than the line-drawn icons; draw it smaller to match them optically.
HEART_ICON_SIZE = 32

# Default preview data from the Zepp OS watchface specification. Stat strings
# use TEXT_IMG syntax: "." is the widget's dot_image. The device appends a
# TEXT_IMG's unit image (% for battery) by itself.
PREVIEW_HOUR = "10"
PREVIEW_MINUTE = "09"
PREVIEW_HEART = "86"
PREVIEW_STEPS = "8670"
PREVIEW_POWER = "75"
PREVIEW_DISTANCE = "5.30"

# AOD rule from the specification: lit pixels must stay under 10% of the
# screen. Checked with the widest, most-ink values each AOD field can show.
AOD_MAX_LIT_RATIO = 0.10
AOD_WORST_HOUR = "20"
AOD_WORST_MINUTE = "08"
AOD_WORST_AMPM = "pm"
AOD_WORST_DATE = "WED, SEP 28"
AOD_WORST_STEPS = "88888"


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


def fit_icon(im, trim=True, size=ICON_SIZE):
    """Scale `im` so its longer side is `size` and center it on an
    ICON_SIZE square canvas. `trim` first crops to the visible ink."""
    if trim:
        im = im.crop(im.getchannel("A").point(lambda a: 255 if a > 32 else 0).getbbox())
    scale = size / max(im.size)
    im = resize_rgba(im, (max(1, round(im.width * scale)), max(1, round(im.height * scale))))
    canvas = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((ICON_SIZE - im.width) // 2, (ICON_SIZE - im.height) // 2))
    return canvas


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
POWER_SRC_BOX = (202, 556, 567, 844)


def power_icons():
    """power.png / power_charging.png on one shared canvas, not trimmed
    separately so they swap in place."""
    normal = key_by_saturation(os.path.join(DESIGN_DIR, "battery-icon.png"),
                               POWER_SRC_BOX, ICON_ORANGE)
    charging = key_by_saturation(os.path.join(DESIGN_DIR, "battery-charged-icon.png"),
                                 POWER_SRC_BOX)
    return fit_icon(normal, trim=False), fit_icon(charging, trim=False)


def step_icon():
    return fit_icon(key_by_saturation(os.path.join(DESIGN_DIR, "steps-icon.png"),
                                      color=ICON_ORANGE))


def build_background():
    im = navy_background()

    artemis, (ax, ay) = mockup_icon(ARTEMIS_BOX)
    paste_centered(im, artemis, CX, ay)

    nasa = scaled_to_width(key_by_saturation(os.path.join(DESIGN_DIR, "nasa-logo.png"),
                                             color=NASA_RED), 81)
    paste_centered(im, nasa, CX, 260)

    heart = fit_icon(key_by_saturation(os.path.join(DESIGN_DIR, "heart-icon.png"),
                                       color=ICON_ORANGE), size=HEART_ICON_SIZE)
    paste_centered(im, heart, ICON_CENTER_X_LEFT, STAT_ROW_Y_TOP)

    shoe = fit_icon(key_from_mockup(SHOE_BOX))
    paste_centered(im, shoe, ICON_CENTER_X_RIGHT, STAT_ROW_Y_BOTTOM)

    return im


def centered_position(icon, cx, cy):
    """Top-left of a runtime icon widget -- printed for watchface/index.js."""
    return (round(cx - icon.width / 2), round(cy - icon.height / 2))


def glyph_set(font_file, size, extra):
    """White digit images 0-9 plus `extra` ({name: char}), for IMG_TIME /
    TEXT_IMG. Digits share one cell width (tabular) so values don't jitter,
    and every image shares one height and baseline so they line up in a row.
    Returns ({name: image}, offset from image top to the digits' vertical
    center)."""
    f = font(font_file, size)
    chars = {str(d): str(d) for d in range(10)}
    chars.update(extra)
    digit_w = math.ceil(max(f.getlength(str(d)) for d in range(10)))
    top = min(f.getbbox(c, anchor="ls")[1] for c in chars.values())
    bottom = max(f.getbbox(c, anchor="ls")[3] for c in chars.values())
    pad = 1
    height = bottom - top + 2 * pad
    baseline = pad - top

    images = {}
    for name, c in chars.items():
        advance = f.getlength(c)
        w = digit_w if c.isdigit() else math.ceil(advance)
        im = Image.new("RGBA", (w, height), (0, 0, 0, 0))
        ImageDraw.Draw(im).text(((w - advance) / 2, baseline), c, font=f, fill=WHITE, anchor="ls")
        images[name] = im

    digit_top = f.getbbox("0", anchor="ls")[1]
    return images, baseline + digit_top / 2


def time_glyphs():
    return glyph_set(TIME_FONT, TIME_TEXT_SIZE, {"colon": ":"})


def ampm_images():
    """am_en.png / pm_en.png on one shared canvas, plus the offset from image
    top to the letters' vertical center."""
    f = font(TIME_FONT, AMPM_TEXT_SIZE)
    top, bottom = f.getbbox("AMP", anchor="ls")[1], f.getbbox("AMP", anchor="ls")[3]
    w = math.ceil(max(f.getlength("AM"), f.getlength("PM"))) + 2
    h = bottom - top + 2
    out = {}
    for name, text in [("am", "AM"), ("pm", "PM")]:
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((1, 1 - top), text, font=f, fill=WHITE, anchor="ls")
        out[name] = im
    return out, h / 2


def stat_glyphs():
    return glyph_set(TEXT_FONT, STAT_TEXT_SIZE,
                     {"dot": ".", "percent": "%", "invalid": "--"})


def draw_text_img(dst, images, x, y, text, unit=None):
    """Composite a left-aligned TEXT_IMG value, as the device draws it: the
    unit image, if any, is appended after the text."""
    names = ["dot" if c == "." else c for c in text]
    if unit:
        names.append(unit)
    for name in names:
        dst.alpha_composite(images[name], (x, y))
        x += images[name].width


def time_x(time_images, is_12h):
    """Hour x of the IMG_TIME widget. Tabular digits and a zero-padded hour
    keep HH:MM a constant width: in 12h it is right-aligned at TIME_RIGHT_X to
    leave room for AM/PM, in 24h it is centered on the dial."""
    width = 4 * time_images["0"].width + time_images["colon"].width
    return TIME_RIGHT_X - width if is_12h else round(CX - width / 2)


def draw_time(dst, time_images, time_center, hour, minute, ampm, ampm_images_, ampm_center):
    """`ampm` is "am" / "pm" for the 12h layout, None for 24h."""
    x = time_x(time_images, ampm is not None)
    y = round(TIME_CENTER_Y - time_center)
    for c in hour + ":" + minute:
        im = time_images["colon" if c == ":" else c]
        dst.alpha_composite(im, (x, y))
        x += im.width
    if ampm:
        dst.alpha_composite(ampm_images_[ampm], (AMPM_X, round(AMPM_CENTER_Y - ampm_center)))


def draw_date(dst, date):
    ImageDraw.Draw(dst).text((CX, DATE_CENTER_Y), date, font=font(TEXT_FONT, DATE_TEXT_SIZE),
                             fill=WHITE, anchor="mm")


def lit_ratio(im):
    """Share of the round display's pixels that are visibly lit."""
    rgb = np.array(im.convert("RGB")).astype(int)
    ys, xs = np.mgrid[0:H, 0:W]
    on_screen = np.hypot(xs - CX + 0.5, ys - CY + 0.5) <= 240
    lit = rgb.max(axis=2) > 32
    return (lit & on_screen).sum() / on_screen.sum()


def save(im, path):
    """Save under assets/<target>/images/, the folder layout the Zepp OS
    watchface samples use."""
    full = os.path.join(ASSET_DIR, "images", path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    im.save(full)


def save_all(images, folder):
    for name, im in images.items():
        save(im, f"{folder}/{name}.png")


def main():
    bg = build_background()
    save(bg.convert("RGB"), "bg.png")

    power, power_charging = power_icons()
    save(power, "icons/power.png")
    save(power_charging, "icons/power_charging.png")
    power_pos = centered_position(power, ICON_CENTER_X_LEFT, STAT_ROW_Y_BOTTOM)

    step = step_icon()
    save(step, "icons/step.png")
    step_pos = centered_position(step, ICON_CENTER_X_RIGHT, STAT_ROW_Y_TOP)

    time_images, time_center = time_glyphs()
    save_all(time_images, "time")
    ampm, ampm_center = ampm_images()
    save_all(ampm, "time")
    stat_images, stat_center = stat_glyphs()
    save_all(stat_images, "stat")

    stat_y_top = round(STAT_ROW_Y_TOP - stat_center)
    stat_y_bottom = round(STAT_ROW_Y_BOTTOM - stat_center)
    print("watchface/index.js constants:")
    print(f"  POWER_X={power_pos[0]} POWER_Y={power_pos[1]} STEP_X={step_pos[0]} STEP_Y={step_pos[1]}")
    minute_offset = 2 * time_images["0"].width + time_images["colon"].width
    print(f"  TIME_X_12H={time_x(time_images, True)} TIME_X_24H={time_x(time_images, False)} "
          f"MINUTE_OFFSET={minute_offset} TIME_Y={round(TIME_CENTER_Y - time_center)} "
          f"AMPM_Y={round(AMPM_CENTER_Y - ampm_center)}")
    print(f"  STAT_Y_TOP={stat_y_top} STAT_Y_BOTTOM={stat_y_bottom} "
          f"STAT_H={stat_images['0'].height}")

    # Normal-mode preview with the spec's default data, for icon.png / preview.png.
    preview = bg.copy()
    for icon, pos in [(power, power_pos), (step, step_pos)]:
        preview.alpha_composite(icon, pos)
    draw_time(preview, time_images, time_center, PREVIEW_HOUR, PREVIEW_MINUTE, "am", ampm, ampm_center)
    draw_date(preview, "FRI, SEP 24")
    draw_text_img(preview, stat_images, STAT_TEXT_X_LEFT, stat_y_top, PREVIEW_HEART)
    draw_text_img(preview, stat_images, STAT_TEXT_X_RIGHT, stat_y_top, PREVIEW_STEPS)
    draw_text_img(preview, stat_images, STAT_TEXT_X_LEFT, stat_y_bottom, PREVIEW_POWER, unit="percent")
    draw_text_img(preview, stat_images, STAT_TEXT_X_RIGHT, stat_y_bottom, PREVIEW_DISTANCE)
    preview.save(os.path.join(ROOT, "tools", "_preview_full.png"))

    # AOD (screen-off): black background with time, date and steps -- the
    # spec's top-priority fields -- at the same positions as normal mode.
    def render_aod(hour, minute, ampm_name, date, steps):
        im = Image.new("RGBA", (W, H), (0, 0, 0, 255))
        im.alpha_composite(step, step_pos)
        draw_time(im, time_images, time_center, hour, minute, ampm_name, ampm, ampm_center)
        draw_date(im, date)
        draw_text_img(im, stat_images, STAT_TEXT_X_RIGHT, stat_y_top, steps)
        return im

    render_aod(PREVIEW_HOUR, PREVIEW_MINUTE, "am", "FRI, SEP 24", PREVIEW_STEPS).save(
        os.path.join(ROOT, "tools", "_preview_aod.png"))
    ratio = max(lit_ratio(render_aod(AOD_WORST_HOUR, AOD_WORST_MINUTE, ampm_name,
                                     AOD_WORST_DATE, AOD_WORST_STEPS))
                for ampm_name in [AOD_WORST_AMPM, None])
    print(f"AOD lit pixels, worst case: {ratio:.1%} (limit {AOD_MAX_LIT_RATIO:.0%})")
    if ratio > AOD_MAX_LIT_RATIO:
        raise SystemExit("AOD layout lights too many pixels -- trim AOD elements")

    # zeus build resizes icon.png to the device previewSize (324x324 on
    # Cheetah Pro) for the Zepp app gallery; ship it at that size already.
    thumb = preview.resize((324, 324), Image.LANCZOS).convert("RGB")
    thumb.save(os.path.join(ASSET_DIR, "preview.png"))
    thumb.save(os.path.join(ASSET_DIR, "icon.png"))

    print("Assets written to", ASSET_DIR)


if __name__ == "__main__":
    main()
