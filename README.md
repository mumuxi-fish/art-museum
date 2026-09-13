# 🎨 Art Museum · 沉浸式 3D 虚拟艺术馆

沉浸式 3D 虚拟艺术展厅，基于 Three.js 构建，**无后端依赖**，可直接部署到 GitHub Pages。

馆内挂着 **40 幅真实的公版画作**（来自 The Cleveland Museum of Art Open Access），
分 5 个展厅陈列，全部离线打包，不依赖任何外部接口。

平面是一张连续的动线：**门厅 → 主廊 → 五个不同尺寸的展厅**，没有传送，
进门就是馆内，一路走过去。

平面是一张连续的动线：**门厅 → 主廊 → 五个不同尺寸的展厅**，没有传送，
进门就是馆内，一路走过去。

## ✨ 特性

- 🖼️ **40 幅真实画作** - 莫奈、毕沙罗、雷诺阿、德加、葛饰北斋、歌川广重、惠斯勒、雷东……
  按主题分为晨光 / 暖阳 / 极简 / 星空 / 花语五个展厅
- 🏛️ **画作名牌** - 每幅画下方有 title / artist / year 小牌子，像真的美术馆
- 🚶 **第一人称漫游** - WASD 移动，鼠标转视角；指针锁定不可用时自动切拖动转视角
- 🏛️ **连续动线** - 门厅、41.5m 主廊、五个不同尺寸的展厅，走进门就是走进门
- 📋 **走廊展签** - 每个展厅门旁一块导言展签：展厅名 + 主题介绍
- 🪑 **长凳与坐下** - 每个展厅一条长凳，走过去按 <kbd>E</kbd> 坐下看画
- 🗿 **走廊尽头端景** - 主廊东端一件青铜雕塑立在基座上，配一盏射灯
- 🖼️ **作品详情** - 视线对准画作按 <kbd>E</kbd>，弹出大图、作者、年代与馆藏链接
- 💡 **逐幅射灯** - 每幅画配一盏柔和射灯，锥角按画面宽度反算
- 📱 **移动端支持** - 触控摇杆漫步画廊
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

### 浏览模式
- **点击画面**: 锁定鼠标，进入沉浸模式
- **WASD**: 移动
- **鼠标**: 转动视角
- **E 键**: 看向画作时查看作品详情；走到长凳前坐下
- **F 键**: 手电筒
- **ESC**: 关闭浮层 / 起身 / 退出沉浸模式

## 🗂️ 项目结构

```
art-museum/
├── index.html                  # 入口
├── public/
│   ├── art/                    # 40 幅公版画作(离线打包)
│   └── data/galleries.json     # 展厅配置(由脚本生成)
├── src/
│   ├── main.js                 # 入口:装配模块 + 主循环 + 灯光预算
│   ├── config.js               # 全局常量(眼高/移速)
│   ├── scene.js                # 场景 / 相机 / 渲染器 单例
│   ├── plan.js                 # 平面图编译器:相邻检测 / 门洞 / 墙段 / 可行走判定
│   ├── room.js                 # 整馆构建:墙/地板/门套/画作/名牌/长凳/雕塑/展签
│   ├── textures.js             # 确定性纹理 + 画作名牌/门楣名牌/导览图/展签贴图
│   ├── lights.js               # 灯具模型与光源创建
│   ├── controls.js             # 指针锁定 + 拖动转视角 + 移动端摇杆 + 碰撞
│   ├── interact.js             # 视线拾取、坐下/起身、作品详情触发
│   ├── player.js               # 可选的第一人称身体
│   ├── flashlight.js           # 手电筒(双层锥 + 手持阻尼)
│   └── style.css               # HUD / 浮层 / 提示样式
├── tools/
│   ├── fetch-artworks.py       # 从 Cleveland Open Access 抓画作
│   └── build-galleries.py      # 生成 galleries.json + CREDITS.md
├── .github/workflows/deploy.yml
└── package.json
```

## ⚙️ 重新生成展厅数据

展厅配置不是手写的，由两个脚本生成，方便换一批画：

```bash
# 1. 抓取画作(需要能访问 openaccess-api.clevelandart.org 和 openaccess-cdn.clevelandart.org)
python3 tools/fetch-artworks.py public/art tools/artworks.json

# 2. 生成 galleries.json 与 CREDITS.md
python3 tools/build-galleries.py tools/artworks.json public/data/galleries.json
```

`fetch-artworks.py` 里的 `THEMES` 定义了每个展厅的选画规则：作者白名单、
作品分类、标题正则、同一作者上限。想换主题改这里即可。

## ⚙️ 自定义展厅

也可以直接编辑 `public/data/museum.json`。

### 展厅结构

```json
{
  "galleries": [
    {
      "name": "展厅名称",
      "ambientIntensity": 0.3,
      "dimensions": { "roomHalfWidth": 10, "roomHeight": 8, "wallDepth": 0.35 },
      "materials": { "wallColor": 15920611, "floorType": "checker" },
      "lights": [],
      "arts": [
        {
          "id": "dawn-art-01",
          "title": "画作名称",
          "artist": "作者",
          "year": "1906",
          "image": "dawn-01.jpg",
          "wall": "back|left|right|front",
          "position": { "x": -7.2, "y": 2.3, "z": -9.63 },
          "size": { "width": 2.4, "height": 1.8 },
          "rotation": { "y": 0, "z": 0 },
          "hue": 0.09
        }
      ]
    }
  ]
}
```

- `image` 指向 `public/art/` 下的文件名；留空或加载失败时，会用 `hue` 生成一张
  **确定性**的程序化纹理兜底（同一个 `hue` 每次渲染结果一致）。
- `size` 建议按画作真实宽高比填写，否则会被拉伸。

## 📜 画作授权

全部画作来自 **The Cleveland Museum of Art Open Access**，均为 CC0 公有领域作品。
逐幅清单与馆藏链接见 [CREDITS.md](./CREDITS.md)。

---

**Enjoy!** 🎨✨
