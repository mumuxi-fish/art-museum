#!/usr/bin/env python3
"""压缩 GLB 里的嵌入纹理。

为什么：Met 的扫描件带 3 张 4096x4096 JPEG，共 2.89MB，占模型 81%。
走廊里一件 2 米高的雕塑根本用不到这个精度，降到 1024 视觉上没区别。

做法：解析 GLB → 抽出每张纹理 → 缩放重编码 → 重建 BIN chunk →
更新 bufferViews 的偏移 → 写回。几何数据原样搬运，不动 accessor。

用法：
    python3 tools/shrink-sculpture.py public/models/204758.glb [长边] [质量]
"""
import json
import os
import struct
import sys
from io import BytesIO

from PIL import Image

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def read_glb(path):
    data = open(path, "rb").read()
    magic, ver, total = struct.unpack("<III", data[:12])
    if magic != 0x46546C67:
        raise ValueError("不是 GLB")
    off, chunks = 12, []
    while off < total:
        clen, ctype = struct.unpack("<II", data[off:off + 8])
        chunks.append((ctype, data[off + 8:off + 8 + clen]))
        off += 8 + clen
    gltf = json.loads(chunks[0][1].decode("utf-8"))
    binary = next(c[1] for c in chunks if c[0] == BIN_CHUNK)
    return gltf, binary


def write_glb(path, gltf, binary):
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)          # JSON chunk 要 4 字节对齐
    bn = binary + b"\x00" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(bn)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), JSON_CHUNK))
        f.write(js)
        f.write(struct.pack("<II", len(bn), BIN_CHUNK))
        f.write(bn)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    path = sys.argv[1]
    max_edge = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
    quality = int(sys.argv[3]) if len(sys.argv) > 3 else 82

    before = os.path.getsize(path)
    gltf, binary = read_glb(path)
    bvs = gltf.get("bufferViews", [])
    images = gltf.get("images", [])
    if not images:
        print("没有嵌入纹理，无需处理")
        return 0

    tex_bv = {im["bufferView"] for im in images if "bufferView" in im}

    # 逐张重编码
    new_payload = {}
    for i, im in enumerate(images):
        bi = im.get("bufferView")
        if bi is None:
            continue
        bv = bvs[bi]
        off = bv.get("byteOffset", 0)   # glTF 里 byteOffset 可选，默认 0
        raw = binary[off: off + bv["byteLength"]]
        with Image.open(BytesIO(raw)) as pic:
            pic = pic.convert("RGB")
            w0, h0 = pic.size
            if max(w0, h0) > max_edge:
                s = max_edge / max(w0, h0)
                pic = pic.resize((max(1, round(w0 * s)), max(1, round(h0 * s))), Image.LANCZOS)
            buf = BytesIO()
            pic.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
        new_payload[bi] = buf.getvalue()
        im["mimeType"] = "image/jpeg"
        print(f"  纹理{i}: {w0}x{h0} {bv['byteLength']//1024}KB"
              f" -> {pic.size[0]}x{pic.size[1]} {len(new_payload[bi])//1024}KB")

    # 重建 BIN：按 bufferView 原顺序摆放，纹理用新数据
    out = bytearray()
    for i, bv in enumerate(bvs):
        if i in new_payload:
            blob = new_payload[i]
        else:
            off = bv.get("byteOffset", 0)
            blob = binary[off: off + bv["byteLength"]]
        # 每个 bufferView 起始按 4 字节对齐
        pad = (4 - len(out) % 4) % 4
        out.extend(b"\x00" * pad)
        bv["byteOffset"] = len(out)
        bv["byteLength"] = len(blob)
        out.extend(blob)

    gltf["buffers"] = [{"byteLength": len(out)}]
    write_glb(path, gltf, bytes(out))

    after = os.path.getsize(path)
    print(f"\n{before/1048576:.2f} MB -> {after/1048576:.2f} MB"
          f"（省 {100 - after/before*100:.0f}%）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
