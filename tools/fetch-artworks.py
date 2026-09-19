#!/usr/bin/env python3
"""从 Cleveland Museum of Art Open Access API 抓取 CC0 画作。

为什么用 Cleveland:
  - Met 的 /search 标了 isPublicDomain 的结果太少(Monet 只有 13 件),选题做不了
  - Art Institute of Chicago 的图片 CDN 对本机 IP 返回 403
  - Cleveland 的 API 和图片 CDN 都稳定,元数据干净,且提供 2732px 的 print 图

搜索接口是模糊匹配,所以搜完之后还要按作者/类型/标题再筛一遍。
图片取 print 尺寸,本地缩到长边 MAX_EDGE 再存。
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://openaccess-api.clevelandart.org/api/artworks/"

OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "public/art"
META_OUT = sys.argv[2] if len(sys.argv) > 2 else "tools/artworks.json"

MAX_EDGE = 1200
# 1200 而不是 1400：详情浮层里大图的显示高度约 608px，1200 长边已接近 1:1，
# 再大只是白白增加下载量（实测 1400→1200 省了 57% 体积）。
# 已有的 40 幅是用 tools/to-webp.py 降到 1200 的，这里保持一致。
# 挂在墙上的画不能太扁或太瘦。3400x231 的长卷铺满整面墙会很怪,直接挡掉。
MIN_ASPECT = 0.34
MAX_ASPECT = 3.05
JPEG_Q = 84
# WebP 质量。78 是"省一半体积、笔触还看得出来"的甜点（实测 q75 开始糊）
WEBP_Q = 78
PER_THEME = 8

# artists  : 作者名必须包含其中之一(不区分大小写)
# types    : CMA 的 type 字段必须命中
# title_re : 标题必须匹配的正则,用来剔掉跑题的搜索结果
# max_per_artist : 同一作者上限,避免一屋子全是同一个人
THEMES = [
    {
        "key": "dawn",
        "name": "展厅一 · 晨光",
        "queries": ["monet", "pissarro", "sisley", "boudin", "daubigny"],
        "artists": ["monet", "pissarro", "sisley", "boudin", "daubigny"],
        "types": ["Painting"],
        "title_re": r"(?i)^(?!.*(portrait|self-portrait|kerchief)).*$",
        "max_per_artist": 3,
    },
    {
        "key": "sun",
        "name": "展厅二 · 暖阳",
        "queries": ["renoir", "degas", "cassatt", "manet", "morisot"],
        "artists": ["renoir", "degas", "cassatt", "manet", "morisot"],
        "types": ["Painting"],
        "title_re": r"(?i)^(?!.*(portrait of|self-portrait)).*$",
        "max_per_artist": 3,
    },
    {
        "key": "minimal",
        "name": "展厅三 · 极简",
        "queries": ["hokusai", "hiroshige", "utamaro"],
        "artists": ["hokusai", "hiroshige", "utamaro", "katsushika", "utagawa", "kitagawa"],
        "types": ["Print"],
        "title_re": r".*",
        "max_per_artist": 3,
    },
    {
        "key": "night",
        "name": "展厅四 · 星空",
        "queries": ["nocturne", "night painting", "evening", "moonlight", "twilight",
                    "Twilight in the Wilderness", "Evening Mood", "Gray and Silver"],
        "artists": None,
        "types": ["Painting", "Print"],
        # 钉一批具体作品,优先入馆;不够 8 幅时再用下面的 title_re 补。
        # 不加这一层的话,靠标题正则捞出来的是欧/中/日/印/波斯大杂烩,不成一个展。
        "titles": [
            r"Twilight in the Wilderness",
            r"Evening Mood",
            r"Gray and Silver",
            r"The Marl Pit at Mulcent",
            r"Drying the Linen",
            r"Scenes of Witchcraft: Night",
            r"Scenes of Witchcraft: Evening",
            r"^Nocturne$",
        ],
        # 只认真正的夜色题材。原来把 sea/coast/storm 也放进来,结果透纳的
        # 风景版画被捞了一大堆,跟"星空"完全不搭。
        "title_re": r"(?i)(nocturne|night|moon|moonlight|moonrise|evening|twilight|dusk|star|gray and|grey and|silver)",
        "max_per_artist": 4,
    },
    {
        "key": "flora",
        "name": "展厅五 · 花语",
        "queries": ["flower painting", "vase of flowers", "flowers still life",
                    "bouquet of flowers"],
        "artists": None,
        "types": ["Painting"],
        "title_re": r"(?i)(flower|bouquet|vase|rose|blossom|chrysanthem|peony|dahlia|hortensia|iris|tulip|still life|garland|jasmine|azalea|pansy|fruit)",
        "max_per_artist": 2,
    },

    # ---- 以下四厅按「画派」划分，和上面按题材分的五厅互补 ----
    # 时代跨度从 17 世纪荷兰一直到 20 世纪美国，走一圈是一条完整的艺术史脉络。
    # artists 白名单是必须的：Cleveland 的搜索是模糊匹配，
    # 搜 "ruisdael" 会把 van Dyck、van Beyeren 一起捞出来（实测过）。
    {
        "key": "dutch",
        "name": "展厅六 · 荷兰黄金时代",
        "queries": ["rembrandt", "frans hals", "jacob van ruisdael",
                    "salomon van ruysdael", "jan steen"],
        "artists": ["rembrandt", "hals", "ruisdael", "ruysdael", "steen", "flinck"],
        "types": ["Painting"],
        "title_re": r".*",
        "max_per_artist": 4,
    },
    {
        "key": "barbizon",
        "name": "展厅七 · 巴比松与写实",
        "queries": ["corot", "courbet", "daubigny", "theodore rousseau",
                    "millet", "bonvin"],
        "artists": ["corot", "courbet", "daubigny", "rousseau", "millet",
                    "bonvin", "meissonier"],
        "types": ["Painting"],
        "title_re": r"(?i)^(?!.*(portrait of|self-portrait)).*$",
        "max_per_artist": 3,
    },
    {
        "key": "postimp",
        "name": "展厅八 · 后印象与纳比",
        "queries": ["cezanne", "gauguin", "vuillard", "bonnard", "denis", "seurat"],
        "artists": ["cezanne", "gauguin", "vuillard", "bonnard", "denis",
                    "seurat", "guillaumin", "maufra"],
        "types": ["Painting"],
        "title_re": r".*",
        "max_per_artist": 4,
    },
    {
        "key": "american",
        "name": "展厅九 · 美国绘画",
        "queries": ["george inness", "winslow homer", "william merritt chase",
                    "john singer sargent", "childe hassam"],
        "artists": ["inness", "homer", "chase", "sargent", "hassam"],
        "types": ["Painting"],
        "title_re": r".*",
        "max_per_artist": 4,
    },
]

UA = {"User-Agent": "art-museum-static-build/1.0 (personal project)"}


def get_json(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except Exception:  # noqa: BLE001
            if i == tries - 1:
                return None
            time.sleep(0.8 * (i + 1))
    return None


def get_bytes(url, tries=3, timeout=180):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception:  # noqa: BLE001
            if i == tries - 1:
                return None
            time.sleep(1.0 * (i + 1))
    return None


def clean(text):
    return re.sub(r"\s+", " ", (text or "")).strip()


def dedupe_key(title):
    """标题归一化后做去重键,避免同一作品的不同印次/标点差异重复入馆。"""
    return re.sub(r"[^a-z0-9]", "", title.lower())


def artist_name(rec):
    for c in rec.get("creators") or []:
        if (c.get("role") or "artist") == "artist":
            desc = clean(c.get("description"))
            if desc:
                return re.split(r"\s*\(", desc)[0].strip()
    return ""


def collect(theme):
    rows = []
    for q in theme["queries"]:
        qs = urllib.parse.urlencode({"q": q, "cc0": "1", "has_image": "1", "limit": 100})
        data = get_json(f"{API}?{qs}")
        if not data:
            print(f"  ! 搜索失败: {q}", file=sys.stderr)
            continue
        rows.extend(data.get("data") or [])
        time.sleep(0.15)
    return rows


def matches(theme, rec):
    if clean(rec.get("share_license_status")).upper() != "CC0":
        return None
    if clean(rec.get("type")) not in theme["types"]:
        return None
    artist = artist_name(rec)
    if not artist:
        return None
    allow = theme.get("artists")
    if allow and not any(a in artist.lower() for a in allow):
        return None
    title = clean(rec.get("title"))
    if not title or len(title) > 72:
        return None
    if not re.search(theme["title_re"], title):
        return None
    imgs = rec.get("images") or {}
    pick = imgs.get("print") or imgs.get("web")
    if not pick or not pick.get("url"):
        return None
    try:
        iw, ih = float(pick.get("width") or 0), float(pick.get("height") or 0)
    except (TypeError, ValueError):
        return None
    if not iw or not ih:
        return None
    ar = iw / ih
    if not (MIN_ASPECT <= ar <= MAX_ASPECT):
        return None
    return {
        "title": title,
        "artist": artist,
        "year": clean(rec.get("creation_date")),
        "img": pick["url"],
        "alt": (imgs.get("web") or {}).get("url"),
        "id": rec.get("id"),
        "acc": rec.get("accession_number"),
        "type": clean(rec.get("type")),
    }


def main():
    import io

    from PIL import Image  # noqa: PLC0415

    os.makedirs(OUT_DIR, exist_ok=True)

    # 可选第三个参数:只重跑指定展厅,例如 `--only night,flora`。
    # 其余展厅沿用已有 artworks.json,避免为了改一个主题把 40 张图全部重下。
    only = None
    if len(sys.argv) > 3:
        only = {k.strip() for k in sys.argv[3].split(",") if k.strip()}

    result = {}
    used = set()
    if only and os.path.exists(META_OUT):
        result = json.load(open(META_OUT, encoding="utf-8"))
        for key, items in result.items():
            # 要重跑的主题不能算进 used —— 否则它上次自己抓的结果会被当成
            # "别的厅已经用过了"而去重掉，重跑一次反而越抓越少（实测 dutch
            # 从 8 幅掉到 4 幅）。
            if key in only:
                continue
            for it in items:
                used.add(dedupe_key(it["title"]))
        print(f"沿用已有 {sum(len(v) for k, v in result.items() if k not in only)} 幅,"
              f"重跑 {sorted(only)}")

    for theme in THEMES:
        if only and theme["key"] not in only:
            continue
        rows = collect(theme)
        print(f"[{theme['key']}] 候选 {len(rows)} 件，筛选…")

        allow_titles = theme.get("titles") or []

        def priority(hit):
            for i, pat in enumerate(allow_titles):
                if re.search(pat, hit["title"], re.I):
                    return i
            return len(allow_titles)

        hits = [h for h in (matches(theme, rec) for rec in rows) if h]
        hits.sort(key=priority)  # 稳定排序:同优先级保持搜索原始顺序

        picked, per_artist = [], {}
        for hit in hits:
            if len(picked) >= PER_THEME:
                break
            dk = dedupe_key(hit["title"])
            if dk in used:
                continue
            if per_artist.get(hit["artist"], 0) >= theme["max_per_artist"]:
                continue
            used.add(dk)
            per_artist[hit["artist"]] = per_artist.get(hit["artist"], 0) + 1
            picked.append(hit)

        print(f"  选中 {len(picked)} 幅: " + ", ".join(p["artist"] for p in picked))

        items = []
        for i, p in enumerate(picked, 1):
            blob = get_bytes(p["img"])
            if not blob and p.get("alt"):
                blob = get_bytes(p["alt"])
            if not blob:
                print(f"  ! 下载失败 {p['title']}")
                continue
            try:
                im = Image.open(io.BytesIO(blob)).convert("RGB")
            except Exception as e:  # noqa: BLE001
                print(f"  ! 解码失败 {p['title']}: {e}")
                continue
            w0, h0 = im.size
            if max(w0, h0) > MAX_EDGE:
                s = MAX_EDGE / max(w0, h0)
                im = im.resize((max(1, round(w0 * s)), max(1, round(h0 * s))), Image.LANCZOS)
            fname = f"{theme['key']}-{i:02d}.webp"
            path = os.path.join(OUT_DIR, fname)
            # WebP 比 JPG 省得多（实测这批画作省约 38%），浏览器支持率 99%+
            im.save(path, "WEBP", quality=WEBP_Q, method=6)
            nbytes = os.path.getsize(path)
            items.append({
                "file": fname, "title": p["title"], "artist": p["artist"],
                "year": p["year"], "w": im.width, "h": im.height, "bytes": nbytes,
                "source": f"https://www.clevelandart.org/art/{p['acc'] or p['id']}",
                "credit": f"The Cleveland Museum of Art, {p['acc']}",
            })
            print(f"  {i:02d} {fname}  {w0}x{h0} → {im.width}x{im.height}  "
                  f"{nbytes//1024}KB  {p['artist']} — {p['title']}")
        result[theme["key"]] = items

    # 按 THEMES 的顺序重排,让 json 读起来和展厅顺序一致
    ordered = {t["key"]: result[t["key"]] for t in THEMES if t["key"] in result}
    with open(META_OUT, "w", encoding="utf-8") as f:
        json.dump(ordered, f, ensure_ascii=False, indent=2)

    total = sum(len(v) for v in ordered.values())
    size = sum(i["bytes"] for v in ordered.values() for i in v)
    print(f"\n合计 {total} 幅，{size/1024/1024:.1f} MB")


if __name__ == "__main__":
    main()
