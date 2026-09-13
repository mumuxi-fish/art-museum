#!/usr/bin/env python3
"""生成整座馆的平面图数据 public/data/museum.json。

和上一版的区别：以前每个展厅是"一个独立的房间"，五个房间靠瞬移串联；
现在是一张连续的平面图——门厅 + 主廊 + 五个不同尺寸的展厅，玩家一路走过去。

坐标约定：X 向东，Z 向南（平面图上的"下"）。房间用中心点 + 宽深描述，
相邻关系和门洞在运行时的 plan.js 里自动推导，这里只管摆位置。
"""
import json
import math
import os
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "tools/artworks.json"
DST = sys.argv[2] if len(sys.argv) > 2 else "public/data/museum.json"

WALL_T = 0.3          # 墙厚
OPEN_W = 3.2          # 门洞宽
OPEN_H = 3.0          # 门洞高（上面留门楣，形成"压缩感"）
HANG_Y = 2.2          # 画心统一高度

# ---------------------------------------------------------------- 房间几何
# 门厅在西端，主廊向东延伸 41.5m，四个展厅挂在主廊南北两侧，
# 花语在走廊尽头作为视觉焦点。相邻即自动开门洞。
ENTRANCE = {"x": 4.5, "z": 19.0, "w": 9.0, "d": 9.0, "h": 4.4}
CORRIDOR = {"x": 29.75, "z": 18.75, "w": 41.5, "d": 4.5, "h": 4.0}

THEMES = {
    "dawn": {
        "name": "展厅一 · 晨光",
        "hue": 0.09,
        "rect": {"x": 18.25, "z": 9.0, "w": 12.5, "d": 15.0, "h": 7.4},
        "ambientIntensity": 0.58,
        "materials": {
            "wallColor": 0xF2EDE3, "ceilingColor": 0xC6C1B7, "accentColor": 0x8C7A5E,
            "floorDark": 0xA9A093, "floorLight": 0xE7E1D5, "floorType": "checker",
            "doorColor": 0x4A3B2C, "frameColor": 0x5A4632,
            "frameRoughness": 0.7, "frameMetalness": 0.05,
        },
        "lightColor": "#fff5e8", "wallLightColor": "#ffe8d0",
    },
    "sun": {
        "name": "展厅二 · 暖阳",
        "hue": 0.07,
        "rect": {"x": 35.5, "z": 8.25, "w": 14.0, "d": 16.5, "h": 7.0},
        "ambientIntensity": 0.55,
        "materials": {
            "wallColor": 0xEFE0CE, "ceilingColor": 0xCAC0B1, "accentColor": 0xB08454,
            "floorDark": 0xC3A184, "floorLight": 0xEFE3D2, "floorType": "stripes",
            "doorColor": 0x5C4028, "frameColor": 0x6B4F2F,
            "frameRoughness": 0.72, "frameMetalness": 0.04,
        },
        "lightColor": "#ffeedd", "wallLightColor": "#ffeecc",
    },
    "minimal": {
        "name": "展厅三 · 极简",
        "hue": 0.55,
        "rect": {"x": 19.0, "z": 27.75, "w": 14.0, "d": 13.5, "h": 7.8},
        "ambientIntensity": 0.62,
        "materials": {
            "wallColor": 0xEDEDEA, "ceilingColor": 0xD2D2CD, "accentColor": 0x4A4A48,
            "floorDark": 0xC7C7C0, "floorLight": 0xE4E4DE, "floorType": "checker",
            "doorColor": 0x3A3A38, "frameColor": 0x2E2E2C,
            "frameRoughness": 0.6, "frameMetalness": 0.12,
        },
        "lightColor": "#f7f4ee", "wallLightColor": "#f0ece4",
    },
    "night": {
        "name": "展厅四 · 星空",
        "hue": 0.66,
        "rect": {"x": 37.0, "z": 28.0, "w": 14.0, "d": 14.0, "h": 7.6},
        "ambientIntensity": 0.62,
        "materials": {
            "wallColor": 0x2A3040, "ceilingColor": 0x1E222E, "accentColor": 0x6E7BA8,
            "floorDark": 0x2A3140, "floorLight": 0x4A5470, "floorType": "checker",
            "doorColor": 0x1B2030, "frameColor": 0x8A7A5A,
            "frameRoughness": 0.55, "frameMetalness": 0.25,
        },
        "lightColor": "#e8f0ff", "wallLightColor": "#cfd8ff",
        "artLight": {"base": 15.0, "hero": 20.0},
    },
    "flora": {
        "name": "展厅五 · 花语",
        "hue": 0.95,
        "rect": {"x": 55.25, "z": 18.75, "w": 9.5, "d": 16.5, "h": 7.0},
        "ambientIntensity": 0.58,
        "materials": {
            "wallColor": 0xF3E6E8, "ceilingColor": 0xC9BFC1, "accentColor": 0xA86B76,
            "floorDark": 0x8A6248, "floorLight": 0xD9BFA8, "floorType": "wood",
            "doorColor": 0x6B4038, "frameColor": 0x7A5240,
            "frameRoughness": 0.75, "frameMetalness": 0.03,
        },
        "lightColor": "#fff3e0", "wallLightColor": "#ffe9d0",
    },
}

# 每个展厅的入口在哪一面 —— 决定主墙（入口对面那面）和挂画布局
ENTRANCE_SIDE = {
    "dawn": "south",     # 门开在朝走廊的南墙 → 主墙是北墙
    "sun": "south",
    "minimal": "north",  # 门开在北墙 → 主墙是南墙
    "night": "north",
    "flora": "west",     # 门开在西墙 → 主墙是东墙
}

OPPOSITE = {"north": "south", "south": "north", "east": "west", "west": "east"}


def fit(w, h, max_w, max_h, target_area):
    """按真实宽高比缩放，长边不超过上限，面积接近 target_area。"""
    if not w or not h:
        return round(max_w * 0.72, 3), round(max_h * 0.72, 3)
    ar = w / h
    ww = math.sqrt(target_area * ar)
    hh = math.sqrt(target_area / ar)
    s = min(1.0, max_w / ww, max_h / hh)
    return round(ww * s, 3), round(hh * s, 3)


def wall_frame(side, r):
    """返回某面墙的放置参数：(墙长, 墙上一点的函数, 朝向)。"""
    x0, z0 = r["x"] - r["w"] / 2, r["z"] - r["d"] / 2
    x1, z1 = r["x"] + r["w"] / 2, r["z"] + r["d"] / 2
    inset = WALL_T / 2 + 0.02
    if side == "north":   # z = z0，面向 +z
        return r["w"], (lambda t: (x0 + t, z0 + inset)), 0.0
    if side == "south":   # z = z1，面向 -z
        return r["w"], (lambda t: (x0 + t, z1 - inset)), math.pi
    if side == "west":    # x = x0，面向 +x
        return r["d"], (lambda t: (x0 + inset, z0 + t)), math.pi / 2
    return r["d"], (lambda t: (x1 - inset, z0 + t)), -math.pi / 2


def place_on_wall(items, side, r, max_h, area, hero=False):
    """把一批画均匀排到某面墙上。hero=True 时中间那幅放大。"""
    if not items:
        return []
    length, at, rot = wall_frame(side, r)
    n = len(items)
    margin = max(1.1, length * 0.08)
    usable = length - 2 * margin
    slot = usable / n
    out = []
    for i, item in enumerate(items):
        t = margin + slot * (i + 0.5)
        is_hero = hero and n >= 3 and i == n // 2
        a = area * (1.5 if is_hero else 1.0)
        mh = max_h * (1.18 if is_hero else 1.0)
        mw = min(slot * 0.8, 3.4)
        w, h = fit(item.get("w"), item.get("h"), mw, mh, a)
        px, pz = at(t)
        out.append({
            "id": f"{item['_key']}-art-{i + 1:02d}",
            "title": item["title"],
            "artist": item["artist"],
            "year": item.get("year", ""),
            "image": item["file"],
            "source": item.get("source", ""),
            "wall": side,
            "position": {"x": round(px, 3), "y": HANG_Y, "z": round(pz, 3)},
            "size": {"width": w, "height": h},
            "rotation": {"y": round(rot, 4), "z": 0},
            "hue": item["_hue"],
            "hero": is_hero,
        })
    return out


def build_arts(key, items, r):
    """主墙 3 幅（中间为 hero）+ 一面侧墙 3 幅 + 另一面侧墙 2 幅。"""
    ent = ENTRANCE_SIDE[key]
    main = OPPOSITE[ent]
    sides = [s for s in ("north", "south", "east", "west") if s not in (ent, main)]
    # 画幅更大的作品留给主墙；最大的那幅放主墙正中间
    items = sorted(items, key=lambda it: -(it.get("w", 1) * it.get("h", 1)))
    main_items, rest = items[:3], items[3:]
    a_items, b_items = rest[:3], rest[3:5]
    ordered_main = [main_items[1], main_items[0], main_items[2]] if len(main_items) == 3 else main_items
    arts = []
    arts += place_on_wall(ordered_main, main, r, 2.7, 4.2, hero=True)
    arts += place_on_wall(a_items, sides[0], r, 2.4, 3.4)
    arts += place_on_wall(b_items, sides[1], r, 2.4, 3.4)
    return arts


def build_lights(key, r, t, ceiling_count=2):
    k = ((r["h"] - 0.5) / 6.0) ** 2
    lights = []
    zs = [-r["d"] * 0.22, r["d"] * 0.22] if ceiling_count == 2 else [0.0]
    for i, dz in enumerate(zs):
        lights.append({
            "id": f"{key}-light-{i + 1}", "name": f"顶灯{i + 1}", "type": "ceiling",
            "position": {"x": round(r["x"], 2), "y": round(r["h"] - 0.06, 2), "z": round(r["z"] + dz, 2)},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "color": t["lightColor"], "intensity": round((70 if i == 0 else 54) * k, 1),
            "range": round(r["h"] * 3.0, 1), "angle": 1.25, "penumbra": 0.55, "enabled": True,
        })
    for i, side in enumerate(("west", "east")):
        x = r["x"] + (-1 if side == "west" else 1) * (r["w"] / 2 - 0.5)
        lights.append({
            "id": f"{key}-wall-{i + 1}", "name": f"{side}墙灯", "type": "wall",
            "position": {"x": round(x, 2), "y": round(r["h"] * 0.56, 2), "z": round(r["z"], 2)},
            "rotation": {"x": 0, "y": math.pi / 2 if side == "west" else -math.pi / 2, "z": 0},
            "color": t["wallLightColor"], "intensity": 16,
            "range": 9, "angle": 1.0, "penumbra": 0.8, "enabled": True,
        })
    return lights


def build_museum(src):
    rooms = []

    rooms.append({
        "id": "entrance", "kind": "entrance", "name": "门厅",
        "center": {"x": ENTRANCE["x"], "z": ENTRANCE["z"]},
        "size": {"w": ENTRANCE["w"], "d": ENTRANCE["d"]},
        "height": ENTRANCE["h"],
        "ambientIntensity": 0.5,
        "materials": {
            "wallColor": 0xE8E2D6, "ceilingColor": 0xB8B2A6, "accentColor": 0x6B5B45,
            "floorDark": 0x9A9186, "floorLight": 0xDAD3C6, "floorType": "checker",
            "doorColor": 0x3E3226, "frameColor": 0x5A4632,
            "frameRoughness": 0.7, "frameMetalness": 0.05,
        },
        "lights": [{
            "id": "entrance-light-1", "name": "门厅顶灯", "type": "ceiling",
            "position": {"x": ENTRANCE["x"], "y": round(ENTRANCE["h"] - 0.06, 2), "z": ENTRANCE["z"]},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "color": "#fff2e0", "intensity": round(46 * ((ENTRANCE["h"] - 0.5) / 6.0) ** 2, 1),
            "range": 14, "angle": 1.3, "penumbra": 0.6, "enabled": True,
        }],
        "arts": [],
        "signs": [{
            "kind": "directory", "wall": "north",
            "position": {
                "x": ENTRANCE["x"] + 1.4, "y": 1.85,
                "z": round(ENTRANCE["z"] - ENTRANCE["d"] / 2 + WALL_T / 2 + 0.03, 3),
            },
            "rotation": {"y": 0, "z": 0},
            "size": {"width": 2.9, "height": 1.85},
        }, {
            "kind": "frontdoors", "wall": "west",
            "position": {
                "x": round(ENTRANCE["x"] - ENTRANCE["w"] / 2 + WALL_T / 2 + 0.05, 3),
                "y": 1.6, "z": ENTRANCE["z"],
            },
            "rotation": {"y": math.pi / 2, "z": 0},
            "size": {"width": 3.4, "height": 3.2},
        }],
    })

    corridor_lights = []
    for i in range(4):
        corridor_lights.append({
            "id": f"corridor-light-{i + 1}", "name": f"走廊顶灯{i + 1}", "type": "ceiling",
            "position": {"x": 12.0 + i * 12.0, "y": round(CORRIDOR["h"] - 0.06, 2), "z": CORRIDOR["z"]},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "color": "#fff6ea", "intensity": round(34 * ((CORRIDOR["h"] - 0.5) / 6.0) ** 2, 1),
            "range": 13, "angle": 1.3, "penumbra": 0.62, "enabled": True,
        })
    rooms.append({
        "id": "corridor", "kind": "corridor", "name": "主廊",
        "center": {"x": CORRIDOR["x"], "z": CORRIDOR["z"]},
        "size": {"w": CORRIDOR["w"], "d": CORRIDOR["d"]},
        "height": CORRIDOR["h"],
        "ambientIntensity": 0.45,
        "materials": {
            "wallColor": 0xDED8CB, "ceilingColor": 0xA9A399, "accentColor": 0x6B5B45,
            "floorDark": 0x8E877C, "floorLight": 0xD2CBBE, "floorType": "stripes",
            "doorColor": 0x3E3226, "frameColor": 0x5A4632,
            "frameRoughness": 0.72, "frameMetalness": 0.06,
        },
        "lights": corridor_lights,
        "arts": [],
        "signs": [],
    })

    for key, t in THEMES.items():
        items = src.get(key) or []
        if not items:
            print(f"! {key} 没有画作，跳过", file=sys.stderr)
            continue
        for it in items:
            it["_key"] = key
            it["_hue"] = t["hue"]
        r = t["rect"]
        arts = build_arts(key, items, r)
        rooms.append({
            "id": key, "kind": "gallery", "name": t["name"],
            "center": {"x": r["x"], "z": r["z"]},
            "size": {"w": r["w"], "d": r["d"]},
            "height": r["h"],
            "ambientIntensity": t["ambientIntensity"],
            "materials": t["materials"],
            "lights": build_lights(key, r, t),
            "artLight": t.get("artLight", {"base": 8.5, "hero": 11.5}),
            "arts": arts,
            "signs": [],
            "entranceSide": ENTRANCE_SIDE[key],
        })
        print(f"{t['name']}: {len(arts)} 幅 · {r['w']}×{r['d']}×{r['h']} m")

    return {
        "spawn": {"x": 1.9, "z": 20.1, "yaw": -1.15},
        "wallThickness": WALL_T,
        "opening": {"width": OPEN_W, "height": OPEN_H},
        "rooms": rooms,
    }


def build_legacy(museum):
    """给 editor.html 用的旧格式：每个展厅单独成一个居中的房间。"""
    galleries = []
    for room in museum["rooms"]:
        if room["kind"] != "gallery":
            continue
        r, c = room["size"], room["center"]
        arts = []
        for a in room["arts"]:
            arts.append({
                **{k: v for k, v in a.items() if k != "hero"},
                "position": {
                    "x": round(a["position"]["x"] - c["x"], 3),
                    "y": a["position"]["y"],
                    "z": round(a["position"]["z"] - c["z"], 3),
                },
            })
        lights = []
        for l in room["lights"]:
            lights.append({
                **l,
                "position": {
                    "x": round(l["position"]["x"] - c["x"], 2),
                    "y": l["position"]["y"],
                    "z": round(l["position"]["z"] - c["z"], 2),
                },
            })
        galleries.append({
            "id": room["id"], "name": room["name"],
            "ambientIntensity": room["ambientIntensity"],
            "dimensions": {
                "roomHalfWidth": max(r["w"], r["d"]) / 2,
                "roomHeight": room["height"],
                "wallDepth": WALL_T,
            },
            "materials": room["materials"],
            "lights": lights,
            "arts": arts,
        })
    return {"galleries": galleries}


def write_credits(museum, path):
    lines = [
        "# 画作来源与授权",
        "",
        "本展厅内的全部画作均来自 **The Cleveland Museum of Art Open Access** 计划，",
        "作品以 CC0 1.0 公有领域贡献条款提供，可自由使用。",
        "",
        "> 图像与元数据来源：The Cleveland Museum of Art (clevelandart.org), Open Access (CC0)",
        "",
        "本文件由 `tools/build-galleries.py` 自动生成，请勿手工编辑。",
        "",
    ]
    for room in museum["rooms"]:
        if room["kind"] != "gallery" or not room["arts"]:
            continue
        lines += [f"## {room['name']}", "",
                  f"位置：{room['size']['w']} × {room['size']['d']} m，层高 {room['height']} m", "",
                  "| 作品 | 作者 | 年代 | 来源 |", "| --- | --- | --- | --- |"]
        for a in room["arts"]:
            title = a["title"].replace("|", "\\|")
            artist = (a["artist"] or "Unknown").replace("|", "\\|")
            year = (a.get("year") or "").replace("|", "\\|")
            src = a.get("source") or ""
            link = f"[CMA {src.rsplit('/', 1)[-1]}]({src})" if src else "—"
            lines.append(f"| {title} | {artist} | {year} | {link} |")
        lines.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"写入 {path}")


def main():
    src = json.load(open(SRC, encoding="utf-8"))
    museum = build_museum(src)

    os.makedirs(os.path.dirname(DST), exist_ok=True)
    with open(DST, "w", encoding="utf-8") as f:
        json.dump(museum, f, ensure_ascii=False, indent=2)
    print(f"\n写入 {DST}（{len(museum['rooms'])} 个空间）")

    legacy_path = os.path.join(os.path.dirname(DST), "galleries.json")
    with open(legacy_path, "w", encoding="utf-8") as f:
        json.dump(build_legacy(museum), f, ensure_ascii=False, indent=2)
    print(f"写入 {legacy_path}（编辑器用旧格式）")

    write_credits(museum, os.path.join(os.path.dirname(DST), "..", "..", "CREDITS.md"))


if __name__ == "__main__":
    main()
