# 🎨 3D 艺术博物馆 · GitHub Pages 版

沉浸式 3D 虚拟艺术展厅，基于 Three.js 构建，**无后端依赖**，可直接部署到 GitHub Pages。

## ✨ 特性

- 🖼️ **3D 虚拟展厅** - WASD 第一人称漫游
- 🎨 **可视化编辑器** - 在线调整墙面/地板/灯光
- 📷 **本地上传图片** - 通过 data URL 离线保存
- 💾 **localStorage 持久化** - 编辑自动保存到浏览器
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
- **E 键**: 靠近门时切换到下一个展厅
- **ESC**: 退出沉浸模式

### 编辑模式
访问 `/editor.html` 打开可视化编辑器：
- 选择展厅切换
- 调整墙面/地板颜色
- 自定义画作属性

## 🗂️ 项目结构

```
3D-art/
├── index.html              # 主展厅入口
├── editor.html             # 编辑器入口
├── public/
│   └── data/
│       └── galleries.json  # 展厅默认配置
├── src/
│   ├── main.js             # 展厅浏览逻辑
│   ├── editor.js           # 编辑器逻辑
│   └── editor-3d.js        # 3D 编辑器核心
├── .github/workflows/
│   └── deploy.yml          # GitHub Pages 自动部署
└── package.json
```

## ⚙️ 自定义展厅

编辑 `public/data/galleries.json` 即可修改展厅配置。

### 展厅结构

```json
{
  "galleries": [
    {
      "name": "展厅名称",
      "lighting": { "ambientIntensity": 0.7 },
      "materials": { "wallColor": 16117224 },
      "dimensions": { "roomHalfWidth": 10 },
      "arts": [
        {
          "title": "画作名称",
          "wall": "back|left|right|front",
          "hue": 0.5,
          "size": { "width": 2, "height": 1.5 }
        }
      ]
    }
  ]
}
```

> 画作使用 hue 值生成渐变色纹理，无需实际图片即可预览。

---

**Enjoy!** 🎨✨
