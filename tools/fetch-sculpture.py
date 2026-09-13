#!/usr/bin/env python3
"""下载走廊尽头那件雕塑的 3D 扫描。

来源：The Metropolitan Museum of Art Open Access（CC0）。
Met 把带 3D 扫描的藏品放在 Vntana 上，`met_scans` 这个仓库把 129 件藏品的
元数据（含直链）整理成了 catalog.json，这里直接读它、按 object id 取。

用法：
    python3 tools/fetch-sculpture.py                    # 默认取 Canova《珀耳修斯》
    python3 tools/fetch-sculpture.py 204812             # 换一件，按 Met object id
    python3 tools/fetch-sculpture.py --list             # 列出所有可选的

产物：
    public/models/<id>.glb
    tools/sculpture.json   （标题 / 作者 / 年代 / 尺寸 / 出处，供展签用）
"""
import json
import os
import sys
import urllib.request

CATALOG = "https://cdn.jsdelivr.net/gh/InconsolableCellist/met_scans@master/catalog.json"
OUT_DIR = "public/models"
META_OUT = "tools/sculpture.json"
DEFAULT_ID = 204758   # Antonio Canova, Perseus with the Head of Medusa, 1804–6
UA = {"User-Agent": "art-museum-static-build/1.0 (personal project)"}


def get_json(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def get_bytes(url, timeout=180):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def load_catalog():
    data = get_json(CATALOG)
    items = data if isinstance(data, list) else list(data.values())
    return [i for i in items if any(f.get("format") == "GLB" for f in (i.get("files") or []))]


def glb_of(item):
    for f in item.get("files") or []:
        if f.get("format") == "GLB":
            return f
    return None


def main():
    args = [a for a in sys.argv[1:]]
    catalog = load_catalog()

    if "--list" in args:
        print(f"可选 {len(catalog)} 件：")
        for it in catalog:
            g = glb_of(it)
            mb = (g.get("size_bytes") or 0) / 1048576
            print(f"  {it['object_id']:<8} {mb:5.1f}MB  {(it.get('title') or '')[:44]:<46}"
                  f"{(it.get('artistDisplayName') or '-')[:26]:<28}{(it.get('medium') or '')[:20]}")
        return

    oid = int(args[0]) if args and args[0].isdigit() else DEFAULT_ID
    item = next((i for i in catalog if i["object_id"] == oid), None)
    if not item:
        print(f"catalog 里没有 object {oid}，用 --list 看可选项", file=sys.stderr)
        sys.exit(1)

    g = glb_of(item)
    os.makedirs(OUT_DIR, exist_ok=True)
    fname = f"{oid}.glb"
    path = os.path.join(OUT_DIR, fname)

    print(f"下载 {item.get('title')}（{item.get('artistDisplayName') or '佚名'}）")
    print(f"  {g['size_bytes'] / 1048576:.1f} MB · {g.get('polys')} 面")
    blob = get_bytes(g["download_url"])
    if blob[:4] != b"glTF":
        print("  下回来的不是 GLB，放弃", file=sys.stderr)
        sys.exit(1)
    with open(path, "wb") as f:
        f.write(blob)
    print(f"  写入 {path}")

    meta = {
        "model": fname,
        "objectId": item["object_id"],
        "title": item.get("title") or "",
        "artist": item.get("artistDisplayName") or "",
        "year": item.get("objectDate") or "",
        "medium": item.get("medium") or "",
        "dimensions": item.get("dimensions") or "",
        "creditline": item.get("creditLine") or "",
        "source": item.get("met_url") or "",
    }
    with open(META_OUT, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"  写入 {META_OUT}")


if __name__ == "__main__":
    main()
