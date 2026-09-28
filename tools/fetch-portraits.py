#!/usr/bin/env python3
"""给每位画家找一张公版头像，登记进 tools/portraits.json。

为什么：展厅里想在名牌旁边挂一张画家本人的小像。维基百科/维基共享在这个环境
访问不到，可访问又明确公版的只有 Met 与 Cleveland 两家（都用 CC0）。

判定很保守，宁可没有也不挂错脸：
  1. 自画像：标题里有 self-portrait，且作者就是这位画家 —— 脸肯定是他的
  2. 他人所作：标题明确写「Portrait of <画家名>」
  3. 题名即人名：标题就是画家名字、作者是别人（通常是照片或胸像）
  画家名用「全名 / 别名 / 姓 + 名字里另一词」三重判定，避免
  Théodore Rousseau 匹配到 Henri Rousseau。

Met 的检索是按相关性排序的 OR 结果，得开 title=true 并翻到较深的名次才找得到，
所以按 (查询, 深度) 做计划，先并行搜、再并行取详情。

匹配上的下载原图到 .portraits-src/（不进仓库），缩小那一步由
tools/shrink-portraits.py 负责（转 256px 方图 WebP 进 public/art/portraits/）。

用法：
    python3 tools/fetch-portraits.py [--search-only] [--artist 画家名]
"""
import hashlib
import json
import os
import re
import sys
import threading
import time
import unicodedata
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

import requests

MET = "https://collectionapi.metmuseum.org/public/collection/v1"
CMA = "https://openaccess-api.clevelandart.org/api/artworks/"
ARTWORKS = "tools/artworks.json"
META = "tools/portraits.json"
RAW_DIR = ".portraits-src"
CACHE_DIR = os.path.join(RAW_DIR, "cache")
TIMEOUT = 25
WORKERS = 6
HEADERS = {"User-Agent": "art-museum-portrait-fetch/1.0 (personal, non-commercial)"}
# Met 对并发很敏感（一压上去就 403 封 IP），所以：
#   1) 所有请求过一把全局限速闸，至少隔 MIN_INTERVAL；
#   2) 403/429 视为封禁，整体冷却并指数退避（45s → 90s → 180s）；
#   3) 结果落磁盘缓存，重跑只发还没拿到的那部分。
MIN_INTERVAL = 1.0
BAN_SECONDS = 45

# (查询模板, 类别, 扫描深度, 只搜标题) —— 深度是按相关性名次翻多少条
MET_PLAN = [
    ("self-portrait {a}", "self", 8, True),
    ("{a} self-portrait", "self", 6, True),
    ("portrait of {a}", "portrait-of", 12, True),
    ("{a} portrait", "portrait-of", 8, True),
]
CMA_PLAN = [
    ("{a} self-portrait", "self", 15),
    ("portrait of {a}", "portrait-of", 15),
    ("{a} portrait", "portrait-of", 15),
    ("{a}", "named", 12),
]
SCORE = {"self": 100, "portrait-of": 60, "named": 40}

# 单名/少见写法的别名（匹配用，全是无歧义的整词）
ALIASES = {
    "Rembrandt van Rijn": ["rembrandt"],
    "Katsushika Hokusai": ["hokusai"],
    "Utagawa Hiroshige": ["hiroshige"],
    "Katsushika Taito II": ["taito ii", "katsushika taito"],
    "Sesshū Tōyō": ["sesshu toyo", "sesshu"],
}
PARTICLES = {"van", "der", "de", "la", "le", "von", "den", "del"}

SELF_RE = re.compile(
    r"self[\s\-_]?portrait|selbstbildnis|autoritratto|autoportrait|autorretrato",
    re.I,
)
PORTRAIT_OF_RE = re.compile(r"portrait of|portrait d['’]|bildnis von|portrait du", re.I)
# 名字确实出现了、但那不是一张脸的题名：摹本（after X）、诗文画册、名片……
BAD_TITLE = re.compile(
    r"\bafter\b|\bschool of\b|\bcircle of\b|\bstyle of\b|\bworkshop of\b"
    r"|\bcalling card\b|\bcarte de visite\b|\bvisiting card\b"
    r"|\bdiscussion\b|\bbrushwork\b|\bcalligraphy\b|\bpoem\b|\bessay\b"
    r"|\bpreface\b|\btitle page\b|\bnotes on\b",
    re.I,
)
# 头像得是个人脸：织物纹样/器皿这类就算了（硬币浮雕也不划算）
BAD_TYPE = (
    "textile", "tapestry", "vessel", "jewelry", "medal", "coin",
    "furniture", "book", "books", "album", "manuscript", "periodical",
    "ephemera",
)


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("’", "'")
    s = re.sub(r"[^a-z0-9']+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def name_in(text, artist):
    """text 里是不是明确写着这位画家。"""
    n = norm(text)
    if not n:
        return False
    if norm(artist) in n:                      # 全名：claude monet
        return True
    for a in ALIASES.get(artist, []):          # 别名：rembrandt / hokusai
        if a in n.split():
            return True
    toks = [t for t in norm(artist).split() if t not in PARTICLES]
    if not toks:
        return False
    present = set(n.split())
    # 姓对上了，还得有名字里的另一个词，才排除同姓的别人
    return toks[-1] in present and (
        len(toks) == 1 or any(t in present for t in toks[:-1])
    )


def display_matches(display, artist):
    """创作者字段是不是这位画家。"""
    n = norm(display)
    return bool(n) and name_in(n, artist)


def slugify(artist):
    return norm(artist).replace("'", "").replace(" ", "-")


def starts_with_name(text, artist):
    """题名是不是以这位画家的名字开头（"Édouard Manet, Seated..." ✓）。"""
    n = norm(text)
    if not n:
        return False
    for cand in [norm(artist)] + list(ALIASES.get(artist, [])):
        if n == cand or n.startswith(cand + " ") or n.startswith(cand + "s "):
            return True
    return False


def kind_of(title, creator, artist, is_self_field=False):
    """返回类别或 None（不合格）。is_self_field：Met 有独立的 artistDisplayName。"""
    t = title or ""
    if not t or BAD_TITLE.search(t):
        return None
    if SELF_RE.search(t):
        # 自画像的作者必须是本人；谁画的、谁雕的都算
        return "self" if display_matches(creator, artist) else None
    m = PORTRAIT_OF_RE.search(t)
    if m:
        # 名字得在 "portrait of" 之后、第一个逗号之前 ——
        # "Portrait of Wilhem van Heythuijsen, after Frans Hals" 画的是前者，
        # "after Frans Hals" 说的是粉本来源，不是被画的人
        if name_in(t[m.end():].split(",")[0], artist):
            return "portrait-of"
        return None
    # 题名以这位画家开头、作者却是别人 —— 照片、胸像、别人画的速写大多长这样
    if creator and not display_matches(creator, artist) and starts_with_name(t, artist):
        return "named"
    return None


# ---------------- 检索 ----------------
_cache = {}
_search_cache = {}


_GATE = threading.Lock()
_LAST_AT = [0.0]
_COOLDOWN = [0.0]
_LAST_BAN = [0.0]
_BAN_FAILOVER = [0]


def _gate():
    """全局限速：Met 见到并发就封 IP，所以所有请求都过这一道闸。"""
    with _GATE:
        while True:
            now = time.time()
            if now >= _COOLDOWN[0]:
                break
            time.sleep(min(_COOLDOWN[0] - now, 5))
        wait = _LAST_AT[0] + MIN_INTERVAL - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _LAST_AT[0] = time.monotonic()


def _banned_recently():
    """上一次封禁就在 BAN_SECONDS 之内 —— 这条 403 是同一拨，别再等一轮。"""
    return time.time() - _LAST_BAN[0] < BAN_SECONDS


def _cooldown():
    """连着被封就一次比一次等得久，别拿脑袋撞墙。"""
    with _GATE:
        _BAN_FAILOVER[0] = min(_BAN_FAILOVER[0] + 1, 3)
        delay = BAN_SECONDS * (2 ** (_BAN_FAILOVER[0] - 1))
        _COOLDOWN[0] = max(_COOLDOWN[0], time.time() + delay)
        _LAST_BAN[0] = time.time()
    print(f"  · 触发限流，整体冷却 {delay}s", file=sys.stderr)


def _cache_path(key):
    name = hashlib.sha1(json.dumps(key, ensure_ascii=False).encode("utf-8")).hexdigest()
    return os.path.join(CACHE_DIR, name + ".json")


def get(url, params=None, tries=4):
    """带限速、冷却和磁盘缓存的 GET。

    403/429 视为限流：第一次触发整体冷却后重试；冷却过了还 403 就当这条
    对象本身不可访问（Met 对受限藏品就是这么回的），直接跳过。
    200 的结果写进 .portraits-src/cache/，重跑不再发同样的请求。
    """
    key = (url, tuple(sorted((params or {}).items())))
    if key in _cache:
        return _cache[key]
    path = _cache_path(key)
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            _cache[key] = data
            return data
        except (OSError, ValueError):
            pass
    data = None
    for i in range(tries):
        _gate()
        try:
            r = requests.get(url, params=params, timeout=TIMEOUT, headers=HEADERS)
        except (requests.ConnectionError, requests.Timeout, ValueError) as err:
            if i == tries - 1:
                print(f"  ! {url}: {err}", file=sys.stderr)
                return None
            time.sleep(1.5 * (i + 1))
            continue
        if r.status_code in (403, 429):
            if _banned_recently():
                return None
            _cooldown()
            continue
        if r.status_code >= 400:
            if i == 0:
                print(f"  · {r.status_code} {url} {params}", file=sys.stderr)
            return None
        try:
            data = r.json()
        except ValueError:
            return None
        break
    if data is None:
        return None
    _BAN_FAILOVER[0] = 0
    os.makedirs(CACHE_DIR, exist_ok=True)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except OSError:
        pass
    _cache[key] = data
    return data


def met_search(args):
    artist, tpl, kind, depth, title_only = args
    params = {"hasImages": "true", "q": tpl.format(a=artist)}
    if title_only:
        params["title"] = "true"
    key = ("met", artist, tuple(sorted(params.items())))
    if key in _search_cache:
        ids = _search_cache[key]
    else:
        try:
            ids = (get(f"{MET}/search", params) or {}).get("objectIDs") or []
        except Exception:
            ids = []
        _search_cache[key] = ids
    return [(artist, kind, rank, oid) for rank, oid in enumerate(ids[:depth])]


def cma_search(args):
    artist, tpl, kind, depth = args
    key = ("cma", artist, tpl)
    if key in _search_cache:
        rows = _search_cache[key]
    else:
        try:
            rows = (get(CMA, {"q": tpl.format(a=artist), "has_image": "1", "limit": str(depth)})
                    or {}).get("data") or []
        except Exception:
            rows = []
        _search_cache[key] = rows
    out = []
    for art in rows:
        if (art.get("share_license_status") or "") not in ("CC0", "Public Domain"):
            continue
        if any(bad in (art.get("type") or "").lower() for bad in BAD_TYPE):
            continue
        image = ((art.get("images") or {}).get("web") or {}).get("url")
        if not image:
            continue
        creators = [c.get("description", "") for c in art.get("creators") or []]
        k = kind_of(art.get("title"), creators[0] if creators else "", artist)
        if k != kind:          # 计划里的查询和实际类别不一致时仍按实际类别记
            if k is None:
                continue
        out.append((artist, k, 0, {
            "provider": "Cleveland",
            "title": art.get("title") or "",
            "creator": creators[0] if creators else "",
            "license": "CC0",
            "source": art.get("url") or "",
            "image": image,
            "date": art.get("creation_date") or "",
            "id": f"cma-{art.get('id')}",
        }))
    return out


def met_object(oid):
    key = ("obj", oid)
    if key in _search_cache:
        return _search_cache[key]
    try:
        obj = get(f"{MET}/objects/{oid}")
    except Exception:
        obj = None
    _search_cache[key] = obj
    return obj


def evaluate_met(artist, kind, rank, obj):
    if not obj or not obj.get("isPublicDomain") or not obj.get("primaryImageSmall"):
        return None
    if any(bad in (obj.get("classification") or "").lower() for bad in BAD_TYPE):
        return None
    k = kind_of(obj.get("title"), obj.get("artistDisplayName") or "", artist)
    if k != kind:
        if k is None:
            return None
        kind = k
    return (artist, kind, rank, {
        "provider": "Met",
        "title": obj.get("title") or "",
        "creator": obj.get("artistDisplayName") or "",
        "license": "CC0 (Open Access)",
        "source": obj.get("objectURL") or "",
        "image": obj.get("primaryImageSmall") or obj.get("primaryImage") or "",
        "date": obj.get("objectDate") or "",
        "id": f"met-{obj.get('objectID')}",
    })


def collect(artists):
    met_jobs = [
        (a, tpl, kind, depth, title_only)
        for a in artists
        for tpl, kind, depth, title_only in MET_PLAN
    ]
    cma_jobs = [
        (a, tpl, kind, depth) for a in artists for tpl, kind, depth in CMA_PLAN
    ]
    found = {a: [] for a in artists}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for rows in pool.map(cma_search, cma_jobs):
            for row in rows:
                found[row[0]].append(row)
        for rows in pool.map(met_search, met_jobs):
            for row in rows:
                found.setdefault(row[0], []).append(row)
        # 汇总要去重的 Met object id，再并行取详情
        pending = {}
        for a, rows in found.items():
            jobs = [r for r in rows if len(r) == 4 and isinstance(r[2], int) and isinstance(r[3], int)]
            if not jobs:
                continue
            pending[a] = jobs
        oids = sorted({r[3] for rows in pending.values() for r in rows})
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            objs = dict(zip(oids, pool.map(met_object, oids)))
        out = {a: [] for a in artists}
        for a, rows in found.items():
            for row in rows:
                if len(row) == 4 and isinstance(row[3], int):
                    res = evaluate_met(a, row[1], row[2], objs.get(row[3]))
                else:
                    res = row
                if res:
                    out[a].append(res)
    return out


def pick(rows):
    if not rows:
        return None
    # 类别优先，名次靠前的优先，同级 Met 优先（CDN 更稳）
    rows.sort(key=lambda r: (-SCORE.get(r[1], 0), r[2], r[3]["provider"] != "Met"))
    return rows[0][1], rows[0][3]


def download(entry):
    """把原图抓到 .portraits-src/，返回本地路径（或 None）。"""
    url = entry["image"]
    if not url:
        return None
    ext = os.path.splitext(url.split("?")[0])[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"):
        ext = ".jpg"
    path = os.path.join(RAW_DIR, entry["slug"] + ext)
    if os.path.exists(path) and os.path.getsize(path) > 1024:
        return path
    try:
        r = requests.get(url, timeout=TIMEOUT, stream=True, headers=HEADERS)
        r.raise_for_status()
        with open(path, "wb") as f:
            for chunk in r.iter_content(1 << 15):
                f.write(chunk)
    except Exception as err:
        print(f"  ! 下载失败 {entry['artist']}: {err}", file=sys.stderr)
        return None
    return path if os.path.getsize(path) > 1024 else None


def main():
    search_only = "--search-only" in sys.argv
    only = None
    if "--artist" in sys.argv:
        only = sys.argv[sys.argv.index("--artist") + 1]

    with open(ARTWORKS, encoding="utf-8") as f:
        src = json.load(f)
    artists = sorted({a["artist"] for group in src.values() for a in group})
    if only:
        artists = [a for a in artists if norm(only) in norm(a)]
    print(f"画家 {len(artists)} 位")

    found = collect(artists)
    hits = {}
    for artist in artists:
        res = pick(found.get(artist) or [])
        hits[artist] = res
        if res:
            kind, info = res
            print(f"  ✓ {artist:<28} [{info['provider']}] {kind}: {info['title'][:52]}")
        else:
            print(f"  · {artist:<28} — 没找到（走剪影兜底）")
    hit = sum(1 for v in hits.values() if v)
    print(f"\n真头像 {hit}/{len(artists)}")
    if search_only or only:
        return 0

    os.makedirs(RAW_DIR, exist_ok=True)
    meta = {"_note": "画家头像：file 是 public/art/ 下的相对路径；没有 file 的用程序化剪影兜底。"}
    meta["artists"] = {}
    for artist in sorted({a["artist"] for group in src.values() for a in group}):
        res = hits.get(artist)
        if not res:
            meta["artists"][artist] = {"file": None, "kind": "silhouette"}
            continue
        kind, info = res
        info = dict(info, artist=artist, slug=slugify(artist))
        if not download(info):
            meta["artists"][artist] = {"file": None, "kind": "silhouette"}
            continue
        meta["artists"][artist] = {
            "file": f"portraits/{info['slug']}.webp",
            "raw": info["slug"] + os.path.splitext(info["image"].split("?")[0])[1].lower(),
            "kind": kind,
            "title": info["title"],
            "creator": info["creator"],
            "date": info["date"],
            "provider": info["provider"],
            "license": info["license"],
            "source": info["source"],
        }
    with open(META, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write("\n")
    n = sum(1 for v in meta["artists"].values() if v["file"])
    print(f"写了 {META}：{n} 张真头像，原图在 {RAW_DIR}/（不进仓库）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
