#!/usr/bin/env python3
"""从一张实拍图生成 og:image（分享预览图）。

为什么要有这个脚本：分享链接出去本来是一张白板。og:image 需要固定尺寸
（1200×630）、绝对地址，还要把截图里的 HUD 盖掉 —— 手改一次容易，
下次换图就忘了怎么裁。

用法：
    python3 tools/make-og-image.py <源图> [输出路径]

源图建议用展厅的实拍（画作清晰、有长凳和地板反射那种）。
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SRC = sys.argv[1] if len(sys.argv) > 1 else None
OUT = sys.argv[2] if len(sys.argv) > 2 else "public/og-image.jpg"

TARGET_W, TARGET_H = 1200, 630
TITLE = "ART MUSEUM"
SUBTITLE = "沉浸式 3D 艺术馆 · 72 幅公版画作 · 九个展厅"

# 截图里 HUD 压在这两个角上，裁完要铺一条盖掉
HUD_BAND_H = 34


def pick_font(size):
    for path in (
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Supplemental/Songti.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/Library/Fonts/Arial.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except Exception:  # noqa: BLE001
            continue
    return ImageFont.load_default()


def main():
    if not SRC or not os.path.exists(SRC):
        print("用法: python3 tools/make-og-image.py <源图> [输出路径]", file=sys.stderr)
        return 1

    im = Image.open(SRC).convert("RGB")
    w, h = im.size

    # 按目标比例裁（不拉伸）。底部通常有操作提示条，所以重心往上挪一点。
    crop_h = round(w / (TARGET_W / TARGET_H))
    top = max(0, min((h - crop_h) // 2 - 24, h - crop_h))
    im = im.crop((0, top, w, top + crop_h)).resize((TARGET_W, TARGET_H), Image.LANCZOS)

    # 用墙面平均色盖掉顶部的 HUD
    patch = im.crop((int(TARGET_W * 0.75), 6, int(TARGET_W * 0.92), 26))
    px = list(patch.getdata())
    avg = tuple(sum(p[i] for p in px) // len(px) for i in range(3))
    ImageDraw.Draw(im).rectangle([0, 0, TARGET_W, HUD_BAND_H], fill=avg)

    # 左下角压标题
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle([0, TARGET_H - 92, TARGET_W, TARGET_H], fill=(8, 8, 12, 155))
    d.text((46, TARGET_H - 74), TITLE, font=pick_font(30), fill=(255, 255, 255, 242))
    d.text((46, TARGET_H - 38), SUBTITLE, font=pick_font(19), fill=(220, 214, 204, 195))

    im.save(OUT, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"{OUT}  {os.path.getsize(OUT) // 1024} KB  {im.size}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
