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
        "name": "展厅一 · 光与河岸",
        "blurb": "印象派第一次把空气画成了主角。莫奈、毕沙罗、西斯莱、道比尼笔下的河岸、田野与光。",
        "hue": 0.09,
        "rect": {"x": 18.25, "z": 9.0, "w": 12.5, "d": 15.0, "h": 7.4},
        "ambientIntensity": 0.58,
        "materials": {
            "wallColor": 0xF2EDE3, "ceilingColor": 0xC6C1B7, "accentColor": 0x8C7A5E,
            "floorDark": 0xA9A093, "floorLight": 0xE7E1D5, "floorType": "stone",
            "doorColor": 0x4A3B2C, "frameColor": 0x5A4632,
            "frameRoughness": 0.7, "frameMetalness": 0.05,
        },
        "lightColor": "#fff5e8", "wallLightColor": "#ffe8d0",
    },
    "sun": {
        "name": "展厅二 · 日常与肖像",
        "blurb": "十九世纪法国的人物与日常。雷诺阿、德加、马奈、莫里索——闲坐、舞蹈、读书的午后。",
        "hue": 0.07,
        "rect": {"x": 35.5, "z": 8.25, "w": 14.0, "d": 16.5, "h": 7.0},
        # 一道不到顶的独立展墙：进门后正前方被挡住，要往东绕过去才看得到主墙。
        # 高 3.6m 是刻意的 —— 挡得住视线，又不会撞到 7m 高的天花灯槽。
        "partitions": [
            {"x0": 28.5, "z0": 7.9, "x1": 35.2, "z1": 8.2, "h": 3.6},
        ],
        "ambientIntensity": 0.55,
        "materials": {
            "wallColor": 0xEFE0CE, "ceilingColor": 0xCAC0B1, "accentColor": 0xB08454,
            "floorDark": 0xC3A184, "floorLight": 0xEFE3D2, "floorType": "stone",
            "doorColor": 0x5C4028, "frameColor": 0x6B4F2F,
            "frameRoughness": 0.72, "frameMetalness": 0.04,
        },
        "lightColor": "#ffeedd", "wallLightColor": "#ffeecc",
    },
    "minimal": {
        "name": "展厅三 · 浮世绘",
        "blurb": "日本浮世绘版画。北斋、广重、歌麿——用最少的笔触留住一场雨、一轮月、一阵风。",
        "hue": 0.55,
        "rect": {"x": 19.0, "z": 27.75, "w": 14.0, "d": 13.5, "h": 7.8},
        "ambientIntensity": 0.62,
        "materials": {
            "wallColor": 0xEDEDEA, "ceilingColor": 0xD2D2CD, "accentColor": 0x4A4A48,
            "floorDark": 0xC7C7C0, "floorLight": 0xE4E4DE, "floorType": "stone",
            "doorColor": 0x3A3A38, "frameColor": 0x2E2E2C,
            "frameRoughness": 0.6, "frameMetalness": 0.12,
        },
        "lightColor": "#f7f4ee", "wallLightColor": "#f0ece4",
    },
    "night": {
        "name": "展厅四 · 夜色与海",
        "blurb": "从罗萨的巫术之夜到丘奇的荒野暮色，三百年的夜、黄昏与海。",
        "hue": 0.66,
        "rect": {"x": 37.0, "z": 28.0, "w": 14.0, "d": 14.0, "h": 7.6},
        # 同上，从东墙伸出，进门要往西绕
        "partitions": [
            {"x0": 37.4, "z0": 27.85, "x1": 44.0, "z1": 28.15, "h": 3.6},
        ],
        "ambientIntensity": 0.62,
        "materials": {
            "wallColor": 0x2A3040, "ceilingColor": 0x1E222E, "accentColor": 0x6E7BA8,
            "floorDark": 0x2A3140, "floorLight": 0x4A5470, "floorType": "stone",
            "doorColor": 0x1B2030, "frameColor": 0x8A7A5A,
            "frameRoughness": 0.55, "frameMetalness": 0.25,
        },
        "lightColor": "#e8f0ff", "wallLightColor": "#cfd8ff",
        "artLight": {"base": 15.0, "hero": 20.0},
    },
    "flora": {
        "name": "展厅五 · 花与静物",
        "blurb": "从十六世纪荷兰静物到蒙德里安的菊花。四百年间，花如何被画。",
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
    # 面朝这面墙时，south / west 的 t 增方向是往右，会读成倒序，翻一下
    if side in ("south", "west"):
        items = list(reversed(items))
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
            "sortYear": item.get("sortYear"),
            "description": item.get("description", ""),
            "didYouKnow": item.get("didYouKnow", ""),
            "technique": item.get("technique", ""),
            "dimensions": item.get("dimensions", ""),
            "creditline": item.get("creditline", ""),
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
    # 按年代布展：进门面对的主墙是最早的三幅，然后沿一侧墙、另一侧墙依次往后。
    # 绕房间走一圈就是一条时间线。
    items = sorted(items, key=lambda it: (it.get("sortYear") or 9999))
    main_items, rest = items[:3], items[3:]
    a_items, b_items = rest[:3], rest[3:5]
    # 严格按年代排，不再为了"把最大的一幅放中间"而打乱顺序 ——
    # 中间那幅的视觉焦点交给射灯（hero）和 1.5 倍面积，不靠调换位置
    ordered_main = main_items
    arts = []
    arts += place_on_wall(ordered_main, main, r, 2.7, 4.2, hero=True)
    arts += place_on_wall(a_items, sides[0], r, 2.4, 3.4)
    arts += place_on_wall(b_items, sides[1], r, 2.4, 3.4)
    # 统一重编 id。place_on_wall 里的序号是"每面墙内"的，
    # 三面墙拼起来会出现 art-01/02/03 各重复几次，id 撞车。
    for i, a in enumerate(arts):
        a["id"] = f"{key}-art-{i + 1:02d}"
    return arts


FACING_YAW = {"north": 0.0, "south": math.pi, "east": -math.pi / 2, "west": math.pi / 2}
TOWARD = {"east": (1.2, 0.0), "west": (-1.2, 0.0), "south": (0.0, 1.2), "north": (0.0, -1.2)}


def bench_for(key, r):
    """一条长凳：坐在上面正对主墙。朝向决定凳子是横放还是竖放。"""
    ent = ENTRANCE_SIDE[key]
    main = OPPOSITE[ent]
    dx, dz = TOWARD[ent]
    return {
        "x": round(r["x"] + dx, 2),
        "z": round(r["z"] + dz, 2),
        "rotY": 0.0 if main in ("north", "south") else math.pi / 2,
        "facing": round(FACING_YAW[main], 4),
        "w": 1.9,
        "d": 0.52,
        "seatY": 0.46,
    }


def year_range(arts):
    """展厅里作品的年代区间，例如 1864–1926。"""
    ys = [a.get("sortYear") for a in arts if a.get("sortYear")]
    if not ys:
        return ""
    lo, hi = min(ys), max(ys)
    return f"{lo}" if lo == hi else f"{lo}–{hi}"


def build_lights(key, r, t, ceiling_count=2):
    k = ((r["h"] - 0.5) / 6.0) ** 2
    lights = []
    zs = [-r["d"] * 0.22, r["d"] * 0.22] if ceiling_count == 2 else [0.0]
    for i, dz in enumerate(zs):
        lights.append({
            "id": f"{key}-light-{i + 1}", "name": f"灯槽{i + 1}", "type": "cove",
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


def load_sculpture():
    """走廊尽头那件雕塑的元数据，由 tools/fetch-sculpture.py 产出。
    没有就退回程序化形体。"""
    path = os.path.join(os.path.dirname(SRC), "sculpture.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return None


def build_museum(src):
    rooms = []
    sculpt = load_sculpture()

    rooms.append({
        "id": "entrance", "kind": "entrance", "name": "门厅",
        "center": {"x": ENTRANCE["x"], "z": ENTRANCE["z"]},
        "size": {"w": ENTRANCE["w"], "d": ENTRANCE["d"]},
        "height": ENTRANCE["h"],
        "ambientIntensity": 0.5,
        "materials": {
            "wallColor": 0xE8E2D6, "ceilingColor": 0xB8B2A6, "accentColor": 0x6B5B45,
            "floorDark": 0x9A9186, "floorLight": 0xDAD3C6, "floorType": "stone",
            "doorColor": 0x3E3226, "frameColor": 0x5A4632,
            "frameRoughness": 0.7, "frameMetalness": 0.05,
        },
        # 门厅 4 盏（2×2）。原来只有 1 盏，可见灯数比走廊少（5 vs 8），
        # 穿过门洞时画面会突然变亮。灯数对齐后过渡就平了。
        "lights": [
            {
                "id": f"entrance-light-{i + 1}", "name": f"门厅顶灯{i + 1}", "type": "ceiling",
                "position": {
                    "x": ENTRANCE["x"] + dx * 2.2,
                    "y": round(ENTRANCE["h"] - 0.06, 2),
                    "z": ENTRANCE["z"] + dz * 2.2,
                },
                "rotation": {"x": 0, "y": 0, "z": 0},
                "color": "#fff2e0", "intensity": round(13 * ((ENTRANCE["h"] - 0.5) / 6.0) ** 2, 1),
                "range": 12, "angle": 1.3, "penumbra": 0.6, "enabled": True,
            }
            for i, (dx, dz) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)])
        ],
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
            "id": f"corridor-light-{i + 1}", "name": f"走廊灯槽{i + 1}", "type": "cove",
            "position": {"x": 12.0 + i * 12.0, "y": round(CORRIDOR["h"] - 0.06, 2), "z": CORRIDOR["z"]},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "color": "#fff6ea", "intensity": round(58 * ((CORRIDOR["h"] - 0.5) / 6.0) ** 2, 1),
            "range": 17, "angle": 1.42, "penumbra": 0.85, "enabled": True,
        })
    rooms.append({
        "id": "corridor", "kind": "corridor", "name": "主廊",
        "center": {"x": CORRIDOR["x"], "z": CORRIDOR["z"]},
        "size": {"w": CORRIDOR["w"], "d": CORRIDOR["d"]},
        "height": CORRIDOR["h"],
        "ambientIntensity": 0.45,
        "materials": {
            "wallColor": 0xDED8CB, "ceilingColor": 0xA9A399, "accentColor": 0x6B5B45,
            "floorDark": 0x8E877C, "floorLight": 0xD2CBBE, "floorType": "stone",
            "doorColor": 0x3E3226, "frameColor": 0x5A4632,
            "frameRoughness": 0.72, "frameMetalness": 0.06,
        },
        "lights": corridor_lights,
        "arts": [],
        "signs": [],
        # 走廊 41.5m 是很大的一片空间，光秃秃的会很空。
        # 长椅走 benches（自动获得碰撞 + 坐下交互），绿植走 furniture。
        "benches": [
            {"x": 12.8, "z": CORRIDOR["z"] - 1.5, "rotY": 0.0, "facing": math.pi,
             "w": 2.1, "d": 0.5, "seatY": 0.44},
            {"x": 28.0, "z": CORRIDOR["z"] + 1.5, "rotY": 0.0, "facing": 0.0,
             "w": 2.1, "d": 0.5, "seatY": 0.44},
            {"x": 43.8, "z": CORRIDOR["z"] - 1.5, "rotY": 0.0, "facing": math.pi,
             "w": 2.1, "d": 0.5, "seatY": 0.44},
        ],
        "furniture": [
            {"kind": "planter", "x": 9.7, "z": CORRIDOR["z"] + 1.72},
            {"kind": "planter", "x": 9.7, "z": CORRIDOR["z"] - 1.72},
            {"kind": "planter", "x": 49.9, "z": CORRIDOR["z"] + 1.72},
            {"kind": "planter", "x": 49.9, "z": CORRIDOR["z"] - 1.72},
            {"kind": "planter", "x": 22.2, "z": CORRIDOR["z"] - 1.72},
            {"kind": "planter", "x": 32.0, "z": CORRIDOR["z"] + 1.72},
        ],
        "sculpture": {
            "x": 45.4, "z": CORRIDOR["z"],
            "plinth": 0.92, "plinthH": 0.72, "height": 2.0,
            **(sculpt or {}),
        },
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
            "blurb": t["blurb"],
            "yearRange": year_range(arts),
            "benches": [bench_for(key, r)],
            "partitions": t.get("partitions", []),
            "arts": arts,
            "signs": [],
            "entranceSide": ENTRANCE_SIDE[key],
        })
        print(f"{t['name']}: {len(arts)} 幅 · {r['w']}×{r['d']}×{r['h']} m")

    return {
        "spawn": {"x": 3.4, "z": 18.9, "yaw": -1.5708},
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

    write_credits(museum, os.path.join(os.path.dirname(DST), "..", "..", "CREDITS.md"))


if __name__ == "__main__":
    main()
