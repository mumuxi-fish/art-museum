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
- 👤 **画家小像** - 名牌右侧挂画家本人的圆形小像：11 位抓到公版真头像（自画像 / 照片 / 胸像，
  Met + Cleveland CC0），其余 24 位用程序化剪影兜底
- 📋 **走廊展签** - 每个展厅门旁一块导言展签：展厅名 + 主题介绍 + 年代区间
- 🪑 **长凳与坐下** - 每个展厅一条长凳，走过去按 <kbd>E</kbd> 坐下看画
- 🗿 **走廊尽头端景** - 真 3D 扫描雕塑立在石基座上，配顶部射灯
- 🗺️ **导览小地图** - 左下角实时平面图，标出所在位置、朝向和展厅编号
- 🌇 **光线随时间** - 右下角滑块，从「正午」拖到「闭馆」：环境光转暖、雾变浓、灯槽渐亮
- ❓ **操作说明** - 右上角 ? 或按 <kbd>H</kbd>，随时查快捷键（开场提示几秒后就没了）
- 🔊 **空间声音** - Web Audio 纯合成：环境底噪、按地面材质变化的脚步声、混响
- 🎵 **舒缓背景音乐** - 一条本地实时生成的氛围音，外加 5 首 Kevin MacLeod 的轻音乐（`public/music/`，CC BY 4.0）；<kbd>B</kbd> 开关，<kbd>空格</kbd> 或 ⏸ ▶ 暂停 / 继续，<kbd>N</kbd> 或 ⏭ 切下一首，右上角 ♫ 打开**播放列表**直接点着换
- 📷 **导入你自己的照片 / 视频 / 音频** - 右上角 🖼 选一个本地文件夹，就地生成一座专属展厅
  （东墙主位 + 南北两墙的长厅）：照片和视频挂上墙（视频是**静音循环的影像装置**，
  点开详情带声播），纯音频做成墙上的**听音点**（走近按 E 播放 / 暂停）；
  单个媒体文件上限 300MB，全部只在浏览器里处理，不上传、不进仓库，点 ↩ 还原默认展馆
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

- **点击画面**: 锁定鼠标，进入沉浸模式（指针自由时：点中画作/长凳直接打开，点空处才锁定）
- **WASD**: 移动
- **鼠标**: 转动视角
- **E 键**: 看向画作时查看作品详情；走到长凳前坐下
- **F 键**: 手电筒
- **M 键**: 声音开关
- **B 键**: 背景音乐开关
- **N 键**: 切换下一首音乐（载入中也能直接切，正在下的那首作废）
- **空格**: 暂停 / 继续背景音乐（右上角 ⏸ ▶ 按钮；手机端在动作区），文件曲会记住进度
- **♫ 按钮**: 打开播放列表，点曲目直接切换（右上角；手机端在动作区）
- **🖼 按钮**: 选一个本地文件夹，用你的照片 / 视频 / 音频生成专属展厅（只在本机处理，不上传）；
  已导入时变成 ↩，点击还原默认展馆
- **听音点**: 展厅墙上带 ♪ 的小牌子，视线对准按 **E** 播放 / 暂停（同一时刻只响一段）
- **ESC**: 关闭浮层 / 起身 / 释放鼠标（退出沉浸模式，随后可点界面上的按钮）

---

# 🧩 扩展指南

所有内容都是**数据驱动**的：改数据文件 → 跑脚本 → 重新构建。不需要动 3D 代码。

先说明整个管线，再分几种情况讲。

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

## 三、画家头像（名牌旁边那张小像）

每幅画的名牌右侧挂一张**画家本人的圆形小像**（直径 0.2 来米，跟名牌同高，不占画的位置）。
`museum.json` 里用一个 `portrait` 字段区分三种情况：

| 值 | 含义 |
|---|---|
| `portraits/xxx.webp` | 抓到的公版真头像（自画像 / 照片 / 胸像），文件在 `public/art/portraits/` |
| `silhouette` | 没抓到，`textures.js` 现画一张剪影兜底（按画家名散列出深浅） |
| 没有该字段 | 自己导入的照片墙（🖼）：作者是文件夹名，没处抓 |

抓取只用两个在本机可达、且明确 CC0 的源：**The Met** 和 **Cleveland**（维基被墙、
AIC 的 IIIF 图 403、NGA 的开放数据要下 80MB 且限速，都没走）。
判定很保守，宁可没有也不挂错脸：

1. 标题是 *self-portrait* **且作者就是本人** → 自画像；
2. *Portrait of \<画家\>* 且名字出现在**逗号之前** → 他人所作
   （"Portrait of Wilhem van Heythuijsen, **after Frans Hals**" 画的是前者，不是哈尔斯）；
3. 题名以画家名开头、作者是别人 → 照片 / 胸像（"Édouard Manet, Seated, Holding His Hat"）。

名刺、风景版画、"XX 的笔法讨论" 这类题名一律挡掉（`BAD_TITLE`）。
Met 的检索按相关性排序，得开 `title=true` 并翻十几名，所以脚本里是一张
（查询 × 深度）的计划表：**全局限速 1s + 403/429 指数退避冷却 + 结果落磁盘缓存**，
重跑只补没拿到的那部分。

```bash
python3 tools/fetch-portraits.py      # 抓头像 → tools/portraits.json + .portraits-src/ 原图
python3 tools/shrink-portraits.py     # 居中取方（纵向 40% 处）→ 256px WebP → public/art/portraits/
python3 tools/build-galleries.py tools/artworks.json public/data/museum.json
node tools/check-portraits.mjs        # 自检：文件 / 来源授权 / museum.json 三者对得上
```

现在 35 位画家里 **11 位有真头像**（Met 7 + Cleveland 4），其余 24 位走剪影；
元数据（标题、作者、来源链接、授权）都在 `tools/portraits.json`，出处同时写进
[CREDITS.md](./CREDITS.md)。原图 `.portraits-src/` 不进仓库（已 gitignore）。

## 四、加 / 换雕塑

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

## 五、加一个展厅

需要动一点 `tools/build-galleries.py`，三处：

1. **平面**：在文件顶部的坐标定义区加一个房间矩形，并让它与走廊贴合（决定门洞位置）
2. **`THEMES`**：加一个主题（键名与 `artworks.json` 的顶层键对应），
   同时给 `THEMES` 补上 `blurb`（走廊展签上的主题介绍）
3. **房间定义**：照抄一个现有展厅的 `rooms.append({...})`，改 `id` / 名称 / 尺寸 / 材质

门洞、门套、走廊展签、长凳、名牌**全部自动生成**，不用手写。

## 六、换地板材质

`build-galleries.py` 里每个房间的 `materials.floorType` 决定地板：

| 值 | 效果 |
|---|---|
| `stone` | 简约哑光地砖（默认）：大片浅色 + 极淡云纹 + 1.25m 十字细砖缝 |
| `wood` | 木地板：板缝 + 木纹 |
| `solid` | 纯色 |

配色由同一行的 `floorDark` / `floorLight` 两个十六进制值控制。

> ⚠️ 曾经的 `checker`（棋盘）和 `stripes`（条纹）已经废弃——走廊是 41.5×4.5，
> 长宽比 9:1，任何有方向的图案都会被拉成条状。纹理重复次数现在按房间长宽分别计算。

## 七、用你自己的照片 / 视频 / 音频生成展厅

右上角 🖼 不走 `tools/` 那条数据管线——照片不是仓库内容，整件事在浏览器里就地完成。
文件夹里的东西按扩展名分三类，各走各的路：

| 类型 | 处理 | 在馆里的样子 |
|---|---|---|
| 图片（jpg/png/webp/avif…） | `createImageBitmap` 解码 → canvas 缩两档（640 / 1600）转 WebP | 挂框的照片 |
| 视频（mp4/webm/mov…） | 解码校验 + 抽一帧当封面，**原文件整个**存进 IndexedDB | **影像装置**：深框屏幕，静音循环自动播；点开详情浮层用原始视频**带声**播 |
| 音频（mp3/wav/m4a…） | 只探解码和时长，原文件存进 IndexedDB | **听音点**：墙上带 ♪ 的小牌子，视线对准按 **E** 播放 / 暂停 |

1. 点 🖼 选一个文件夹（`webkitdirectory`，连子目录一起读）
2. 单个媒体文件 **> 300MB 直接跳过**（视频是整个文件进 IndexedDB，不设限会把站点配额吃光）；
   解不开的格式（HEIC 图片、HEVC 视频等）也单个跳过，不让整个文件夹失败
3. `src/mygallery-plan.js` 按图片/视频的长宽比排一版平面：**门厅 + 一条长厅**，
   第一件作品挂进门正对的东墙主位（`hero`，配更亮的射灯），其余对半挂南北两面长墙；
   音频跟在同面墙的**照片之后**、中间隔 0.8m 排成一条矮牌子（照片在前、听音点在后），
   厅长会为牌子一起变长；一张照片都没有时，第一块牌子顶替主位挂东墙；
   单幅面积按张数反比缩放，长厅长度不短于 14m
4. 刷新一次，走和默认展馆完全相同的启动路径，只是 `loader.js` 优先读 IndexedDB
   里那份方案；`textures.js` 的 `artWallUrl/artDetailUrl/artVideoUrl` 被换成 blob URL，
   挂画、详情浮层、「相关作品」都不用知道自己看的是谁的图
5. 点 ↩ 删掉 IndexedDB 记录再刷新，就回到默认展馆

影像装置的播放由 `room.js` 管：**只有房间可见 + 页面在前台**才播，切走就停；
`main.js` 每帧问 `videosNeedRender()`，有影像在播就不走"静止跳渲染"那条省电路径
（three 每次绑 `VideoTexture` 会自己刷新帧，但只有真的 `render()` 才会上传）。
听音点是 `listen.js` 里的一个 `<audio>`：同一时刻只响一段，播新的自动停旧的，
和右上角的背景音乐互不干扰（B/N/空格那套键管不到它）。

平面自检不碰浏览器：`node tools/check-mygallery.mjs`（1~80 张、含极端横竖幅、
影像 + 听音点混排、纯音频文件夹，共 151 项：门洞 / 贴墙 / 越界 / 壁灯不压画 /
射灯数不超上限 / 牌子不与画重叠 / 时长格式）。

限制：媒体不进仓库、不上传，换浏览器或清站点数据就没了；一次只保留一套方案
（导入新的覆盖旧的）；墙上的射灯按 `room.artLight.max` 等间隔挑着加，
几十张照片也不会把房间的光照 shader 撑爆。

---

## 🗂️ 项目结构

```
art-museum/
├── index.html                  # 入口
├── public/
│   ├── art/                    # 72 幅公版画作（离线打包）+ portraits/ 画家小像
│   ├── music/                  # 5 首背景音乐（Kevin MacLeod，CC BY 4.0）
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
│   ├── interact.js             # 视线拾取（画作/长凳/听音点）、坐下/起身、作品详情触发
│   ├── minimap.js              # 左下角导览小地图（Canvas 2D，实时位置与朝向）
│   ├── daylight.js             # 光线随时间（正午 → 闭馆，环境光/雾/灯槽/反射插值）
│   ├── audio.js                # Web Audio 合成：环境音 / 脚步 / 交互音 / 混响 / 背景音乐
│   ├── flashlight.js           # 手电筒（双层锥 + 手持阻尼）
│   ├── loader.js               # museum.json 加载（优先读自己导入的展厅方案）+ 画作流式加载
│   ├── mygallery.js            # 🖼 本地导入：图片缩图 / 视频抽封面 / 音频探时长 + IndexedDB
│   ├── mygallery-plan.js       # 图片+视频+听音点 → 单厅平面（纯数据，可 Node 自检）
│   ├── listen.js               # 听音点：一个 <audio> 单轨播放（E 播放/暂停，互斥）
│   └── style.css               # HUD / 浮层 / 提示样式
├── tools/
│   ├── fetch-artworks.py       # 从 Cleveland Open Access 抓画作（直接输出 WebP）
│   ├── enrich-artworks.py      # 补策展文案（可反复跑）
│   ├── to-webp.py              # 把已有的 JPG 批量转 WebP 并同步元数据
│   ├── fetch-sculpture.py      # 从 Met 抓 3D 雕塑
│   ├── shrink-sculpture.py     # 压缩 GLB 里的嵌入纹理
│   ├── fetch-portraits.py       # 画家头像：Met + Cleveland 抓公版（限速 + 缓存）
│   ├── shrink-portraits.py      # 头像裁方缩到 256px WebP
│   ├── build-galleries.py      # 排版引擎：生成 museum.json + CREDITS.md
│   ├── check-plan.mjs          # 默认展馆平面自检（画有没有挂进门洞）
│   ├── check-portraits.mjs     # 头像自检（文件 / 来源授权 / museum.json 对得上）
│   ├── check-mygallery.mjs     # 自建展厅平面自检（node 直接跑）
│   ├── artworks.json           # 画作清单（数据源）
│   ├── portraits.json          # 画家头像清单（数据源：真头像的来源与授权）
│   └── sculpture.json          # 雕塑元数据（数据源）
├── .github/workflows/deploy.yml
└── package.json
```

## 📜 画作授权

画作来自 **The Cleveland Museum of Art Open Access**，雕塑来自 **The Metropolitan
Museum of Art Open Access**，均为 CC0 公有领域作品。
名牌旁边的画家小像同理：**11 位**取自 Met / Cleveland 的 CC0 开放数据，
逐幅清单与馆藏链接见 [CREDITS.md](./CREDITS.md)。

## 🎵 音乐授权

`public/music/` 下的 5 首背景音乐来自 **Kevin MacLeod**（[incompetech.com](https://incompetech.com)），
按 **[Creative Commons: By Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)** 授权使用：

| 曲目 | 用在哪 |
|---|---|
| Friday Morning | 背景音乐 · 钢琴即兴 |
| Bathed in the Light | 背景音乐 · 明亮轻盈 |
| Daybreak | 背景音乐 · 复古电钢琴 |
| Gymnopedie No 1 | 背景音乐 · 萨蒂 |
| Dreamer | 背景音乐 · 钢琴与轻打击 |

署名同样写在游戏内的操作说明面板（按 <kbd>H</kbd>）底部。
除此之外的第一首「合成氛围」是 Web Audio 实时合成的，无外部素材。

---

**Enjoy!** 🎨✨
