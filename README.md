# 🎨 Art Museum · 沉浸式 3D 虚拟艺术馆

沉浸式 3D 虚拟艺术展厅，基于 Three.js 构建，**无后端依赖**，可直接部署到 GitHub Pages。

馆内挂着 **72 幅真实的公版画作**（来自 The Cleveland Museum of Art Open Access），
分 9 个展厅陈列；走廊尽头立着一件 **Canova《珀尔修斯与美杜莎之首》** 的真 3D 扫描件
（The Met Open Access）。全部资源离线打包，不依赖任何外部接口。

平面是一张连续的动线：**门厅 → 41.5m 主廊 → 九个展厅**。门厅是枢纽（西大门、
东通主廊、北通荷兰厅、南通巴比松厅），没有传送，进门就是馆内，一路走过去。

九个展厅分两组：**前五厅按题材**（光与河岸、日常与肖像、浮世绘、夜色与海、花与静物），
**后四厅按画派**（荷兰黄金时代、巴比松与写实、后印象与纳比、美国绘画）。
时代从 17 世纪荷兰一路排到 20 世纪美国，走完一圈就是一条完整的艺术史脉络。

## ✨ 特性

- 🖼️ **72 幅真实画作** - 伦勃朗、哈尔斯、柯罗、库尔贝、塞尚、高更、莫奈、雷诺阿、
  葛饰北斋、惠斯勒、Inness、Homer…… 从文艺复兴后一直到二十世纪初
- 🏛️ **两种布展逻辑** - 前五厅按题材（看什么），后四厅按画派（谁在画、属于哪一派）
- 📅 **编年布展** - 每个展厅按年代排序，绕房间走一圈就是一条时间线
- 🏷️ **完整展签** - 作品详情含策展介绍、材质、尺寸、入藏来源（取自馆方 API）
- 🚶 **第一人称漫游** - WASD 移动，鼠标转视角；指针锁定不可用时自动切拖动转视角
- 📋 **走廊展签** - 每个展厅门旁一块导言展签：展厅名 + 主题介绍 + 年代区间
- 🪑 **长凳与坐下** - 每个展厅一条长凳，走过去按 <kbd>E</kbd> 坐下看画
- 🗿 **走廊尽头端景** - 真 3D 扫描雕塑立在石基座上，配顶部射灯
- 🗺️ **导览小地图** - 左下角实时平面图，标出所在位置、朝向和展厅编号
- 🔊 **空间声音** - Web Audio 纯合成：环境底噪、按地面材质变化的脚步声、混响
- 💡 **逐幅射灯** - 每幅画配一盏柔和射灯，锥角按画面宽度反算
- 🌐 **纯静态** - 无需后端服务器

## 🚀 快速部署

### 方式一：GitHub Pages（推荐）

1. Fork 或创建自己的仓库
2. 在仓库 Settings → Pages 中选择 `GitHub Actions` 作为 Source
3. Push 到 `main` 分支，GitHub Actions 会自动构建并部署

### 方式二：本地运行

```bash
npm install
npm run dev     # 开发模式
npm run build   # 构建静态文件
npm run preview # 预览构建结果
```

## 🎮 使用说明

- **点击画面**: 锁定鼠标，进入沉浸模式
- **WASD**: 移动
- **鼠标**: 转动视角
- **E 键**: 看向画作时查看作品详情；走到长凳前坐下
- **F 键**: 手电筒
- **M 键**: 声音开关
- **ESC**: 关闭浮层 / 起身 / 退出沉浸模式

---

# 🧩 扩展指南

所有内容都是**数据驱动**的：改数据文件 → 跑脚本 → 重新构建。不需要动 3D 代码。

先说明整个管线，再分四种情况讲。

## 数据管线

```
tools/artworks.json          ← 画作清单（手动维护或脚本生成）
tools/sculpture.json         ← 雕塑元数据
        │
        │  tools/enrich-artworks.py   （可选）补策展文案
        ▼
tools/build-galleries.py     ← 排版引擎：决定每幅画挂哪面墙、多大、射灯多亮
        │
        ▼
public/data/museum.json      ← 运行时唯一读取的数据文件
```

**关键点：`public/data/museum.json` 是生成物，不要手改**——下次跑脚本会覆盖。
要改内容就改上游的 `tools/` 数据。

`build-galleries.py` 负责的事情（所以扩展时不用操心）：

- 房间矩形 → 自动推导相邻关系 → 生成门洞 → 把墙拆成绕开洞口的墙段
- 每厅按年代排序 → 主墙 3 幅 + 两侧墙 3+2 幅 → 反算画幅尺寸和射灯锥角
- 生成走廊展签、门楣名牌、长凳位置、雕塑基座碰撞体

## 一、加一幅画（最常用）

**三步。**

**1.** 把图片放进 `public/art/`（命名建议跟主题走，如 `dawn-09.jpg`）

**2.** 在 `tools/artworks.json` 对应主题的数组里加一条：

```json
{
  "file": "dawn-09.jpg",
  "title": "Water Lilies",
  "artist": "Claude Monet",
  "year": "c. 1915–26",
  "w": 1400,
  "h": 651,
  "source": "https://www.clevelandart.org/art/1960.81",
  "credit": "The Cleveland Museum of Art, 1960.81"
}
```

顶层键就是九个展厅：`dawn` / `sun` / `minimal` / `night` / `flora`（按题材）
和 `dutch` / `barbizon` / `postimp` / `american`（按画派）。

| 字段 | 说明 |
|---|---|
| `file` | `public/art/` 下的文件名 |
| `w` / `h` | **图片像素尺寸**，必须填。程序靠它算挂画大小和射灯锥角，填错会导致画被拉伸或射灯打偏 |
| `source` | 馆藏链接。详情浮层的「馆藏记录 →」指向它；`enrich-artworks.py` 也靠它去拉文案 |
| `credit` | 入藏来源，显示在详情浮层 |
| `description` / `technique` / `dimensions` / `didYouKnow` | 策展文案，**可以留空**，跑 enrich 脚本会自动补 |

**3.** 重新生成数据：

```bash
python3 tools/build-galleries.py tools/artworks.json public/data/museum.json
npm run build
```

想要策展文案（详情浮层里那段介绍），在中间插一步：

```bash
python3 tools/enrich-artworks.py tools/artworks.json
```

它会按 `source` 里的馆藏编号去 Cleveland API 拉 `description`（策展人写的墙面说明）、
`did_you_know`、`technique`、`dimensions`、`creditline`。**已补过的会自动跳过**，
可以反复跑。

> 注意：馆藏编号必须能在 Cleveland 的库里查到，否则那一条会保持为空。
> 用别家博物馆的图时，这一步跳过就行，手填 `description` 也可以。

## 二、批量拉一批画（换主题）

改 `tools/fetch-artworks.py` 里的 `THEMES`，然后：

```bash
python3 tools/fetch-artworks.py public/art tools/artworks.json
python3 tools/enrich-artworks.py tools/artworks.json
python3 tools/build-galleries.py tools/artworks.json public/data/museum.json
```

`THEMES` 每一项定义**一个展厅**：

```python
{
    "key": "dawn",                    # 与 artworks.json 的顶层键对应
    "name": "展厅一 · 光与河岸",
    "queries": ["monet", "pissarro"], # 搜索关键词
    "artists": ["monet", "pissarro"], # 作者名必须包含其中之一
    "types": ["Painting"],            # CMA 的 type 字段
    "title_re": r"(?i)^(?!.*(portrait)).*$",  # 标题正则，剔掉跑题结果
    "max_per_artist": 3,              # 同一作者上限，避免一屋子同一个人
}
```

脚本会搜索 → 按上面四条规则筛 → 下载 print 尺寸大图 → 缩到长边 1400px → 写元数据。
宽高比会被限制在 0.34 ~ 3.05，挡掉长卷和条幅（挂墙上会很怪）。

## 三、加 / 换雕塑

**换一件**：编辑 `tools/sculpture.json`，然后重跑 `build-galleries.py`。

```json
{
  "model": "204758.glb",
  "title": "Perseus with the Head of Medusa",
  "artist": "Antonio Canova",
  "year": "1804–6",
  "medium": "Marble",
  "source": "https://www.metmuseum.org/art/collection/search/204758"
}
```

模型文件放 `public/models/`。**尺寸和位置全自动**——程序量出模型的世界包围盒，
缩到目标高度、水平居中、底面坐在基座上。换任何模型都不用调参数。

**重新下载**：改 `tools/fetch-sculpture.py` 里的 Met `objectId`，然后：

```bash
python3 tools/fetch-sculpture.py    # 下载 GLB + 写 sculpture.json
python3 tools/build-galleries.py tools/artworks.json public/data/museum.json
```

> Met 的扫描件是 Draco 压缩的，解码器在 `public/draco/`（从 `three` 包里拷的）。
> 模型加载失败会自动退回程序化形体，不会开天窗。

## 四、加一个展厅

需要动一点 `tools/build-galleries.py`，三处：

1. **平面**：在文件顶部的坐标定义区加一个房间矩形，并让它与走廊贴合（决定门洞位置）
2. **`THEMES`**：加一个主题（键名与 `artworks.json` 的顶层键对应），
   同时给 `THEMES` 补上 `blurb`（走廊展签上的主题介绍）
3. **房间定义**：照抄一个现有展厅的 `rooms.append({...})`，改 `id` / 名称 / 尺寸 / 材质

门洞、门套、走廊展签、长凳、名牌**全部自动生成**，不用手写。

## 五、换地板材质

`build-galleries.py` 里每个房间的 `materials.floorType` 决定地板：

| 值 | 效果 |
|---|---|
| `stone` | 抛光水磨石（默认）：底色 + 柔和色斑 + 细碎石粒，无图案 |
| `wood` | 木地板：板缝 + 木纹 |
| `solid` | 纯色 |

配色由同一行的 `floorDark` / `floorLight` 两个十六进制值控制。

> ⚠️ 曾经的 `checker`（棋盘）和 `stripes`（条纹）已经废弃——走廊是 41.5×4.5，
> 长宽比 9:1，任何有方向的图案都会被拉成条状。纹理重复次数现在按房间长宽分别计算。

---

## 🗂️ 项目结构

```
art-museum/
├── index.html                  # 入口
├── public/
│   ├── art/                    # 72 幅公版画作（离线打包）
│   ├── models/                 # 雕塑 GLB
│   ├── draco/                  # Draco 解码器（模型是压缩的）
│   └── data/museum.json        # 运行时数据（由脚本生成，勿手改）
├── src/
│   ├── main.js                 # 入口：装配模块 + 主循环 + 灯光预算
│   ├── config.js               # 全局常量（眼高/移速）
│   ├── scene.js                # 场景 / 相机 / 渲染器 单例
│   ├── plan.js                 # 平面图编译器：相邻检测 / 门洞 / 墙段 / 可行走判定
│   ├── room.js                 # 整馆构建：墙/地板/门套/画作/名牌/长凳/雕塑/展签
│   ├── textures.js             # 确定性纹理 + 名牌/展签/导览图贴图
│   ├── lights.js               # 灯具模型与光源创建
│   ├── controls.js             # 指针锁定 + 拖动转视角 + 碰撞
│   ├── interact.js             # 视线拾取、坐下/起身、作品详情触发
│   ├── minimap.js              # 左下角导览小地图（Canvas 2D，实时位置与朝向）
│   ├── audio.js                # Web Audio 合成：环境音 / 脚步 / 交互音 / 混响
│   ├── flashlight.js           # 手电筒（双层锥 + 手持阻尼）
│   └── style.css               # HUD / 浮层 / 提示样式
├── tools/
│   ├── fetch-artworks.py       # 从 Cleveland Open Access 抓画作（直接输出 WebP）
│   ├── enrich-artworks.py      # 补策展文案（可反复跑）
│   ├── to-webp.py              # 把已有的 JPG 批量转 WebP 并同步元数据
│   ├── fetch-sculpture.py      # 从 Met 抓 3D 雕塑
│   ├── shrink-sculpture.py     # 压缩 GLB 里的嵌入纹理
│   ├── build-galleries.py      # 排版引擎：生成 museum.json + CREDITS.md
│   ├── artworks.json           # 画作清单（数据源）
│   └── sculpture.json          # 雕塑元数据（数据源）
├── .github/workflows/deploy.yml
└── package.json
```

## 📜 画作授权

画作来自 **The Cleveland Museum of Art Open Access**，雕塑来自 **The Metropolitan
Museum of Art Open Access**，均为 CC0 公有领域作品。
逐幅清单与馆藏链接见 [CREDITS.md](./CREDITS.md)。

---

**Enjoy!** 🎨✨
