#!/usr/bin/env python3
"""把 public/art 里的画作从 JPG 转成 WebP。

为什么：40 张 JPG 共 10MB，转 WebP 后大约 6MB。
WebP 的浏览器支持率已经 99%+，对纯静态站没有风险。

顺带按 MAX_EDGE 降分辨率 —— 详情浮层里大图的显示高度约 608px，
1200px 的长边已经接近 1:1，1400px 是浪费。

用法：
    python3 tools/to-webp.py [图片目录] [artworks.json] [长边]

会就地转换（转完删掉原 JPG），并同步更新 artworks.json 里的 file 字段。
想反悔就 git checkout。
"""
import json
import os
import sys

from PIL import Image

SRC_DIR = sys.argv[1] if len(sys.argv) > 1 else "public/art"
META = sys.argv[2] if len(sys.argv) > 2 else "tools/artworks.json"
MAX_EDGE = int(sys.argv[3]) if len(sys.argv) > 3 else 1200

# 78 是"省一半体积、笔触还看得出来"的甜点。实测过：
#   q82 -> 省 31%（不够）    q75 -> 省 54%（画作的笔触开始糊）
# method=6 是最慢但压得最小的编码档。
QUALITY = 78
METHOD = 6


def main():
    if not os.path.isdir(SRC_DIR):
        print(f"! 目录不存在: {SRC_DIR}", file=sys.stderr)
        return 1

    jpgs = sorted(f for f in os.listdir(SRC_DIR) if f.lower().endswith((".jpg", ".jpeg")))
    if not jpgs:
        print("没有需要转换的 JPG")
        return 0

    before = sum(os.path.getsize(os.path.join(SRC_DIR, f)) for f in jpgs)
    renamed = {}
    sizes = {}

    for name in jpgs:
        src = os.path.join(SRC_DIR, name)
        stem = os.path.splitext(name)[0]
        dst_name = stem + ".webp"
        dst = os.path.join(SRC_DIR, dst_name)

        with Image.open(src) as im:
            im = im.convert("RGB")
            if max(im.size) > MAX_EDGE:
                s = MAX_EDGE / max(im.size)
                im = im.resize(
                    (max(1, round(im.size[0] * s)), max(1, round(im.size[1] * s))),
                    Image.LANCZOS,
                )
            im.save(dst, "WEBP", quality=QUALITY, method=METHOD)

        os.remove(src)
        renamed[name] = dst_name
        sizes[dst_name] = im.size
        print(f"  {name} -> {dst_name}  {im.size[0]}x{im.size[1]}  ({os.path.getsize(dst) // 1024} KB)")

    after = sum(os.path.getsize(os.path.join(SRC_DIR, v)) for v in renamed.values())
    print(f"\n{len(renamed)} 张：{before / 1048576:.1f} MB -> {after / 1048576:.1f} MB"
          f"（省 {100 - after / before * 100:.0f}%）")

    # 同步 artworks.json
    if os.path.exists(META):
        with open(META, encoding="utf-8") as f:
            data = json.load(f)
        n = 0
        for items in data.values():
            if not isinstance(items, list):
                continue
            for it in items:
                if it.get("file") in renamed:
                    it["file"] = renamed[it["file"]]
                    # w/h 也要跟着更新，否则元数据和实际图片对不上
                    if it["file"] in sizes:
                        it["w"], it["h"] = sizes[it["file"]]
                    n += 1
        with open(META, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"已更新 {META}（{n} 条）")
    else:
        print(f"! 找不到 {META}，跳过元数据同步", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
