#!/usr/bin/env python3
"""给墙面生成一套 640px 的画作小图，输出到 public/art/640/。

为什么：72 张 1200px 的画全部解码成 RGBA 约 325MB，加 mipmap 约 430MB ——
但画挂在墙上实际只显示约 600px 高，多出来的像素全是在给详情浮层买单。
分成两档之后各取所需：

    art/*.webp       1200px   详情浮层、相关作品大图（76vh 才不糊）
    art/640/*.webp   640px    墙上的 3D 纹理（src/textures.js 的 artWallUrl）

显存约降 4 倍，纹理上传也更快，本地和线上都受益。

用法：
    pip install pillow
    python3 tools/make-wall-textures.py [源目录] [输出目录] [长边]

输出目录里已存在的同名文件会跳过（源图没换就不重算），
源图比目标还小的直接复制。要全部重算先删掉输出目录。
"""
import os
import shutil
import sys

try:
    from PIL import Image
except ImportError:  # noqa: E402
    sys.exit("! 缺少 Pillow：pip install pillow")

SRC_DIR = sys.argv[1] if len(sys.argv) > 1 else "public/art"
DST_DIR = sys.argv[2] if len(sys.argv) > 2 else os.path.join(SRC_DIR, "640")
MAX_EDGE = int(sys.argv[3]) if len(sys.argv) > 3 else 640

# 和 tools/to-webp.py 同一套参数，保证两档画质一致
QUALITY = 78
METHOD = 6


def main():
    if not os.path.isdir(SRC_DIR):
        print(f"! 目录不存在: {SRC_DIR}", file=sys.stderr)
        return 1

    names = sorted(
        f for f in os.listdir(SRC_DIR)
        if f.lower().endswith((".webp", ".jpg", ".jpeg", ".png"))
    )
    if not names:
        print("! 源目录里没有图片", file=sys.stderr)
        return 1

    os.makedirs(DST_DIR, exist_ok=True)
    made = skipped = 0
    total_in = total_out = 0

    for name in names:
        src = os.path.join(SRC_DIR, name)
        dst = os.path.join(DST_DIR, name)

        # 源图没更新过就别重算（640px 一批编码要跑一会儿）
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            skipped += 1
            continue

        with Image.open(src) as im:
            im = im.convert("RGB")
            w, h = im.size
            if max(w, h) > MAX_EDGE:
                s = MAX_EDGE / max(w, h)
                im = im.resize(
                    (max(1, round(w * s)), max(1, round(h * s))),
                    Image.LANCZOS,
                )
            ext = os.path.splitext(name)[1].lower()
            if ext == ".webp":
                im.save(dst, "WEBP", quality=QUALITY, method=METHOD)
            else:
                # jpg/png 源也统一转成 webp，和 wall 档的 URL 保持一致
                im.save(os.path.splitext(dst)[0] + ".webp", "WEBP",
                        quality=QUALITY, method=METHOD)
                dst = os.path.splitext(dst)[0] + ".webp"

        made += 1
        total_in += os.path.getsize(src)
        total_out += os.path.getsize(dst)
        print(f"  {name}  {w}x{h} -> {im.size[0]}x{im.size[1]}"
              f"  {os.path.getsize(dst) // 1024} KB")

    print(f"\n{made} 张新生成，{skipped} 张已存在跳过")
    if made:
        print(f"  本批: {total_in / 1048576:.1f} MB -> {total_out / 1048576:.1f} MB")

    # 顺带报一下两档的总量，方便看显存账
    sizes = {}
    for d in (SRC_DIR, DST_DIR):
        s = sum(
            os.path.getsize(os.path.join(d, f))
            for f in os.listdir(d)
            if f.lower().endswith((".webp", ".jpg", ".jpeg", ".png"))
        )
        sizes[d] = s
    for d, s in sizes.items():
        print(f"  {d}: {s / 1048576:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
