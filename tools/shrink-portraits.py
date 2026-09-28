#!/usr/bin/env python3
"""把 .portraits-src/ 里的画家头像原图缩成 256×256 方图 WebP。

为什么：原图动辄一两千像素、几百 KB，名牌旁边那张小圆像只显示 0.2 来米，
用不着；而且仓库里要进 35 张，得压到 20KB 上下。

裁法：居中取方，纵向中心取在 40% 处 —— 肖像画的头基本都在上半张，
0.5 会把头顶切掉、0.4 能把脸稳稳框进来。

用法：
    python3 tools/shrink-portraits.py        # 先跑 fetch-portraits.py

输出 public/art/portraits/<slug>.webp，同时更新 tools/portraits.json 的 size。
"""
import glob
import json
import os

from PIL import Image

RAW_DIR = ".portraits-src"
OUT_DIR = "public/art/portraits"
META = "tools/portraits.json"
SIZE = 256
QUALITY = 82
METHOD = 6
BIAS = 0.40


def find_raw(slug, hint):
    """按 portraits.json 里的提示找原图；提示失效（扩展名变了）就自己 glob。"""
    if hint:
        path = os.path.join(RAW_DIR, hint)
        if os.path.exists(path):
            return path
    hits = sorted(glob.glob(os.path.join(RAW_DIR, slug + ".*")),
                  key=lambda p: os.path.getsize(p), reverse=True)
    hits = [p for p in hits if not os.path.isdir(p)]
    return hits[0] if hits else None


def main():
    with open(META, encoding="utf-8") as f:
        meta = json.load(f)
    os.makedirs(OUT_DIR, exist_ok=True)

    ok = skipped = 0
    for artist, info in meta["artists"].items():
        if not info.get("file"):
            continue
        slug = os.path.splitext(os.path.basename(info["file"]))[0]
        src = find_raw(slug, info.get("raw"))
        if not src:
            print(f"  · {artist}: 原图不在 {RAW_DIR}/，跳过")
            skipped += 1
            continue
        with Image.open(src) as im:
            im = im.convert("RGB")
            w, h = im.size
            side = min(w, h)
            left = (w - side) // 2
            top = int(round((h - side) * BIAS))
            top = max(0, min(h - side, top))
            im = im.crop((left, top, left + side, top + side))
            im = im.resize((SIZE, SIZE), Image.LANCZOS)
            dst = os.path.join(OUT_DIR, os.path.basename(info["file"]))
            im.save(dst, "WEBP", quality=QUALITY, method=METHOD)
        info["size"] = os.path.getsize(dst)
        info["raw"] = os.path.relpath(src, RAW_DIR)
        ok += 1
        print(f"  ✓ {artist:<28} -> {os.path.basename(dst)} "
              f"{w}×{h}→{SIZE} {info['size'] // 1024}KB")

    with open(META, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\n缩好 {ok} 张（跳过 {skipped}）到 {OUT_DIR}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
