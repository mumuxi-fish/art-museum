#!/usr/bin/env python3
"""给已下载的画作补齐展览文案与排序用的年代。

Cleveland 的 API 里有几样正是展签需要的东西：
  description        策展人写的一段介绍，相当于墙上的说明文字
  did_you_know       一条冷知识
  technique          材质（oil on fabric 之类）
  dimensions         尺寸
  creditline         入藏来源
  creation_date_earliest  可排序的年份数字
  id / url           回查用

用法：python3 tools/enrich-artworks.py tools/artworks.json
已补过的会跳过，可以反复跑。
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

SRC = sys.argv[1] if len(sys.argv) > 1 else "tools/artworks.json"
API = "https://openaccess-api.clevelandart.org/api/artworks/"
UA = {"User-Agent": "art-museum-static-build/1.0 (personal project)"}

FIELDS = [
    "id", "accession_number", "description", "did_you_know", "technique",
    "dimensions", "creditline", "creation_date_earliest", "creation_date_latest",
    "creation_date", "url", "current_location", "tombstone",
]


def get_json(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read())
        except Exception:  # noqa: BLE001
            if i == tries - 1:
                return None
            time.sleep(0.8 * (i + 1))
    return None


def accession_of(item):
    """从 source 里抠出入藏号，例如 .../art/1960.81 → 1960.81"""
    src = item.get("source") or ""
    m = re.search(r"/art/([^/?#]+)$", src)
    return m.group(1) if m else None


def fmt_dimensions(d):
    """API 的 dimensions 是嵌套字典，直接 str() 会印出一坨 Python 字面量。
    取未装框尺寸，换算成厘米，再补一个英寸。"""
    if not isinstance(d, dict):
        return clean(d)
    part = d.get("unframed") or d.get("framed") or {}
    if not isinstance(part, dict) or not part:
        return ""
    h, w = part.get("height"), part.get("width")
    if not h or not w:
        return ""
    label = "未装框" if d.get("unframed") else "装框"
    hi, wi = part.get("height_inch"), part.get("width_inch")
    out = f"{label} {w * 100:.1f} × {h * 100:.1f} cm"
    if hi and wi:
        out += f"（{wi:g} × {hi:g} in）"
    return out


def clean(text):
    """去掉 API 返回里的 HTML 标签，展签上不该出现 <em> 这种东西。"""
    if not text:
        return ""
    s = re.sub(r"<[^>]+>", "", str(text))
    s = s.replace("\r\n", " ").replace("\n", " ").replace("\r", " ")
    return re.sub(r"\s+", " ", s).strip()


def fetch(acc):
    qs = urllib.parse.urlencode({
        "accession_number": acc,
        "fields": ",".join(FIELDS),
    })
    data = get_json(f"{API}?{qs}")
    if not data or not data.get("data"):
        return acc, None
    return acc, data["data"][0]


def main():
    doc = json.load(open(SRC, encoding="utf-8"))

    # 收集所有需要补的入藏号
    targets = []
    for key, items in doc.items():
        for it in items:
            dims = it.get("dimensions") or ""
            if it.get("description") and it.get("sortYear") and "{" not in dims:
                continue
            acc = accession_of(it)
            if acc:
                targets.append(acc)

    print(f"需要补文案的：{len(targets)} 件")
    info = {}
    if targets:
        with ThreadPoolExecutor(max_workers=6) as pool:
            for acc, rec in pool.map(fetch, targets):
                if rec:
                    info[acc] = rec
                else:
                    print(f"  ! 取不到 {acc}")

    filled = 0
    for key, items in doc.items():
        for it in items:
            acc = accession_of(it)
            rec = info.get(acc)
            if not rec:
                continue
            it["description"] = clean(rec.get("description"))
            it["didYouKnow"] = clean(rec.get("did_you_know"))
            it["technique"] = clean(rec.get("technique"))
            it["dimensions"] = fmt_dimensions(rec.get("dimensions"))
            it["creditline"] = clean(rec.get("creditline"))
            it["museumId"] = rec.get("id")
            it["url"] = rec.get("url") or it.get("source")
            earliest = rec.get("creation_date_earliest")
            latest = rec.get("creation_date_latest")
            it["sortYear"] = int(earliest) if earliest else None
            it["sortYearEnd"] = int(latest) if latest else None
            if it.get("description"):
                filled += 1

    with open(SRC, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)

    total = sum(len(v) for v in doc.values())
    print(f"补到文案 {filled} / {total} 件")
    for key, items in doc.items():
        years = [i.get("sortYear") for i in items]
        ok = sum(1 for y in years if y)
        print(f"  {key:<8} 有年代 {ok}/{len(items)}  区间 {min([y for y in years if y] or [0])}–{max([y for y in years if y] or [0])}")


if __name__ == "__main__":
    main()
