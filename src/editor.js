import {
  init3DEditor, loadGallery, refreshGallery, getSelection,
  setToolMode, getGalleryData, updateSelectedPainting,
  selectByType, updateSelectedLight,
  duplicateSelectedItem, deleteSelectedItem,
  addLight, addPainting, getLightList, getArtList
} from './editor-3d.js';

let galleriesData = null;
let currentIndex = 0;
let currentGallery = null;
const STORAGE_KEY = 'art-museum-galleries';
const LEGACY_STORAGE_KEY = '3d-art-museum-galleries';

const $ = (id) => document.getElementById(id);

// ── 初始化 ──
export function initEditor() {
  console.log('编辑器初始化...');

  const viewport = $('viewport');
  if (viewport) {
    init3DEditor(viewport, on3DSelectionChange);
    console.log('3D 视口已初始化');
  } else {
    console.error('找不到 viewport 元素');
  }

  loadGalleries();
  bindEvents();
  loadPresets();
}

// ── Toast ──
function toast(msg, type = 'info', dur = 3000) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), dur);
}

// ── 画廊数据存取 ──
function saveToLocalStorage() {
  try {
    const clean = JSON.parse(JSON.stringify(galleriesData));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (err) {
    console.warn('localStorage 保存失败:', err.message);
  }
}

function loadFromLocalStorage() {
  try {
    let saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      // 旧版本数据迁移
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        localStorage.setItem(STORAGE_KEY, legacy);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        saved = legacy;
      }
    }
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

// ── 加载展馆列表 ──
async function loadGalleries() {
  const localData = loadFromLocalStorage();

  if (localData && localData.galleries?.length > 0) {
    galleriesData = localData;
    console.log('从 localStorage 加载展馆:', galleriesData.galleries.length, '个');
  } else {
    try {
      const resp = await fetch('data/galleries.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      galleriesData = await resp.json();
      console.log('从静态 JSON 加载展馆:', galleriesData.galleries.length, '个');
      saveToLocalStorage();
    } catch (err) {
      console.error('加载展馆失败:', err);
      galleriesData = {
        galleries: [{
          id: 'gallery-default',
          name: '默认展厅',
          ambientIntensity: 0.35,
          materials: {
            wallColor: 16117224,
            accentColor: 13945400,
            ceilingColor: 16448245,
            floorDark: 4013104,
            floorLight: 16314604,
            doorColor: 4013104,
            floorType: 'checker'
          },
          dimensions: { roomHalfWidth: 10, roomHeight: 8, wallDepth: 0.35 },
          arts: [],
          lights: []
        }]
      };
      toast('使用默认展馆配置', 'info');
    }
  }

  const select = $('gallerySelect');
  if (!select) { console.error('找不到 gallerySelect'); return; }

  select.innerHTML = galleriesData.galleries.length
    ? galleriesData.galleries.map((g, i) => `<option value="${i}">${g.name}</option>`).join('')
    : '<option value="-1">无展馆数据</option>';

  if (galleriesData.galleries.length) {
    select.value = '0';
    selectGallery(0);
    console.log('已选择第一个展馆');
  }
}

function selectGallery(index) {
  currentIndex = index;
  currentGallery = JSON.parse(JSON.stringify(galleriesData.galleries[index]));
  console.log('切换展馆:', currentGallery.name);
  loadGallery(currentGallery);
  updateSelectLabel();
  renderImgGrid();
  showPanel('gallery');
  updateActionButtons();
}

function updateSelectLabel() {
  const select = $('gallerySelect');
  if (select && select.options[currentIndex]) {
    select.options[currentIndex].textContent = currentGallery.name;
  }
}

// ── 3D 选择回调 ──
function on3DSelectionChange(sel) {
  if (!sel) {
    showPanel('gallery');
    updateActionButtons();
    return;
  }

  const { type, data, position } = sel;

  if (type === 'painting') {
    showPaintingProps(data, position);
  } else if (type === 'light') {
    showLightProps(data);
  } else if (type === 'wall') {
    showMaterialProps('wall', currentGallery.materials, ['wallColor', 'accentColor', 'ceilingColor']);
  } else if (type === 'floor') {
    showMaterialProps('floor', currentGallery.materials, ['floorDark', 'floorLight', 'floorType']);
  } else if (type === 'ceiling') {
    showMaterialProps('ceiling', currentGallery.materials, ['ceilingColor']);
  }

  updateActionButtons();
}

// ── 面板切换 ──
function showPanel(panel) {
  ['gallery', 'painting', 'light', 'material'].forEach((p) => {
    const el = $('panel-' + p);
    if (el) el.style.display = p === panel ? 'block' : 'none';
  });
}

// ── 操作按钮状态 ──
function updateActionButtons() {
  const sel = getSelection();
  const isItem = sel && (sel.type === 'painting' || sel.type === 'light');
  const dupBtn = $('btnDuplicate');
  const delBtn = $('btnDelete');
  if (dupBtn) dupBtn.disabled = !isItem;
  if (delBtn) delBtn.disabled = !isItem;
}

// ── 灯具属性面板 ──
function showLightProps(data) {
  showPanel('light');
  if (!data) return;

  $('lightName').value = data.name || '';
  $('lightType').textContent = data.type === 'ceiling' ? '💡 顶灯' : '🔦 墙灯';
  $('lightColor').value = data.color || '#fff5e8';
  $('lightEnabled').checked = data.enabled !== false;

  const intensity = data.intensity ?? 1.0;
  $('lightIntensity').value = intensity;
  $('lightIntensityVal').textContent = intensity.toFixed(1);

  const range = data.range ?? 10;
  $('lightRange').value = range;
  $('lightRangeVal').textContent = range.toFixed(0);

  const angle = data.angle ?? 1.2;
  $('lightAngle').value = angle;
  $('lightAngleVal').textContent = angle.toFixed(2);

  const penumbra = data.penumbra ?? 0.4;
  $('lightPenumbra').value = penumbra;
  $('lightPenumbraVal').textContent = penumbra.toFixed(2);
}

// ── 画作属性面板 ──
function showPaintingProps(data, position) {
  showPanel('painting');
  if (!data) return;

  $('paintingTitle').value = data.title || '';
  $('paintingArtist').value = data.artist || '';
  $('paintingImage').textContent = data.image ? (data.image.startsWith('data:') ? '上传图片' : data.image) : '无图片';
  const wallSel = $('paintingWall');
  if (wallSel) wallSel.value = data.wall || 'back';
  const w = data.size?.width || 2;
  const h = data.size?.height || 1.5;
  $('paintingSizeW').value = w;
  $('paintingSizeH').value = h;
  const rw = $('paintingSizeW_range'), rh = $('paintingSizeH_range');
  if (rw) rw.value = w;
  if (rh) rh.value = h;

  if (position) {
    $('paintingPosX').value = position.x;
    $('paintingPosY').value = position.y;
    $('paintingPosZ').value = position.z;
    const px = $('paintingPosX_range'), py = $('paintingPosY_range'), pz = $('paintingPosZ_range');
    if (px) px.value = position.x;
    if (py) py.value = position.y;
    if (pz) pz.value = position.z;
  }

  const preview = $('paintingPreview');
  if (preview && data.image) {
    preview.innerHTML = `<img src="${escAttr(data.image)}" onerror="this.style.display='none'" style="max-width:100%;max-height:120px;border-radius:4px;">`;
  } else if (preview) {
    preview.innerHTML = '<div style="color:#555;font-size:0.75rem;">无图片</div>';
  }
}

function showMaterialProps(type, materials, keys) {
  showPanel('material');
  const label = $('materialType');
  if (label) label.textContent = type === 'wall' ? '墙面' : type === 'floor' ? '地板' : '天花板';

  ['wallColor', 'accentColor', 'ceilingColor', 'floorDark', 'floorLight', 'floorType'].forEach((k) => {
    const row = $('mat-row-' + k);
    if (row) row.style.display = keys.includes(k) ? '' : 'none';
    if (keys.includes(k) && k === 'floorType') {
      const select = $('mat-floorType');
      if (select) select.value = materials.floorType || 'checker';
    } else if (keys.includes(k) && materials[k] !== undefined) {
      const hex = rgbToHex(materials[k]);
      const input = $('mat-' + k);
      if (input) { input.value = hex; input.dispatchEvent(new Event('input')); }
    }
  });

  window._applyMaterialChange = (key, value) => {
    materials[key] = value;
    refreshGallery(currentGallery);
  };
}

// ── 同步画作属性到 3D ──
function syncPaintingTo3D() {
  const sel = getSelection();
  if (!sel || sel.type !== 'painting' || !sel.data) return;

  const updates = {
    title: $('paintingTitle').value,
    artist: $('paintingArtist').value,
  };

  const pw = parseFloat($('paintingSizeW').value);
  const ph = parseFloat($('paintingSizeH').value);
  if (!isNaN(pw) && !isNaN(ph)) {
    updates.size = { width: pw, height: ph };
    const rw = $('paintingSizeW_range'), rh = $('paintingSizeH_range');
    if (rw && +rw.value !== pw) rw.value = pw;
    if (rh && +rh.value !== ph) rh.value = ph;
  }

  updateSelectedPainting(updates);
}

function syncPaintingPosition() {
  const sel = getSelection();
  if (!sel || sel.type !== 'painting' || !sel.data) return;

  const px = parseFloat($('paintingPosX').value);
  const py = parseFloat($('paintingPosY').value);
  const pz = parseFloat($('paintingPosZ').value);
  if (isNaN(px) || isNaN(py) || isNaN(pz)) return;

  updateSelectedPainting({ position: { x: px, y: py, z: pz } });

  const rx = $('paintingPosX_range'), ry = $('paintingPosY_range'), rz = $('paintingPosZ_range');
  if (rx && +rx.value !== px) rx.value = px;
  if (ry && +ry.value !== py) ry.value = py;
  if (rz && +rz.value !== pz) rz.value = pz;
}

// ── 同步灯具属性到 3D ──
function syncLightTo3D() {
  const sel = getSelection();
  if (!sel || sel.type !== 'light' || !sel.data) return;

  const updates = {
    name: $('lightName').value,
    enabled: $('lightEnabled').checked,
    color: $('lightColor').value,
    intensity: parseFloat($('lightIntensity').value),
    range: parseFloat($('lightRange').value),
    angle: parseFloat($('lightAngle').value),
    penumbra: parseFloat($('lightPenumbra').value),
  };

  updateSelectedLight(updates);
}

// ── 工具模式 ──
function setTool(tool) {
  setToolMode(tool === 'select' ? 'select' : 'translate');
  const selBtn = $('btnToolSelect');
  const moveBtn = $('btnToolMove');
  if (selBtn) selBtn.classList.toggle('active', tool === 'select');
  if (moveBtn) moveBtn.classList.toggle('active', tool === 'translate');
}

// ── 上传 ──
async function doUpload(file) {
  if (!file.type.startsWith('image/')) { toast('只支持图片文件', 'error'); return; }
  if (file.size > 10 * 1024 * 1024) { toast('最大 10MB', 'error'); return; }

  const dataUrl = await new Promise((r) => {
    const fr = new FileReader();
    fr.onload = (e) => r(e.target.result);
    fr.readAsDataURL(file);
  });

  addArtToGallery(file.name.replace(/\.[^.]+$/, ''), dataUrl);
  toast('已添加图片: ' + file.name, 'success');
  renderImgGrid();
}

function addArtToGallery(title, image) {
  if (!currentGallery) return;
  if (!currentGallery.arts) currentGallery.arts = [];
  currentGallery.arts.push({
    id: 'art-' + Date.now(),
    title, image,
    wall: 'back',
    position: { x: 0, y: 2.5, z: -9 },
    size: { width: 2, height: 1.5 },
    rotation: { y: 0, z: 0 },
    artist: '',
  });
  refreshGallery(currentGallery);
  renderImgGrid();
}

// ── 图片库 ──
function renderImgGrid() {
  const grid = $('imgGrid');
  if (!grid) return;

  const arts = currentGallery?.arts || [];
  if (!arts.length) { grid.innerHTML = '<p class="empty">暂无图片，点击上方按钮添加</p>'; return; }

  grid.innerHTML = '';
  arts.forEach((a) => {
    if (!a.image) return;
    const card = document.createElement('div');
    card.className = 'img-card';
    const imgSrc = a.image.startsWith('data:') ? a.image : a.image;
    card.innerHTML = `<img src="${escAttr(imgSrc)}" onerror="this.style.display='none'" loading="lazy"><span class="name">${esc(a.title || '未命名')}</span>`;
    card.addEventListener('click', () => addArtToGallery(a.title + '-副本', a.image));
    grid.appendChild(card);
  });
}

// ── 保存 ──
function doSave() {
  const updated = getGalleryData();
  if (updated) {
    currentGallery = updated;
    galleriesData.galleries[currentIndex] = currentGallery;
  }
  updateSelectLabel();
  saveToLocalStorage();
  toast('已保存到本地存储', 'success');
}

function doExport() {
  const updated = getGalleryData();
  const data = updated || currentGallery;
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (data.name || 'gallery') + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('已导出', 'success', 2000);
}

function doImport(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.name || !imported.materials) throw new Error('缺少字段');
      if (!imported.lights) imported.lights = [];
      currentGallery = imported;
      galleriesData.galleries[currentIndex] = imported;
      refreshGallery(currentGallery);
      renderImgGrid();
      saveToLocalStorage();
      toast('导入成功', 'success');
    } catch (err) { toast('导入失败: ' + err.message, 'error'); }
  };
  reader.readAsText(file);
}

// ── 复制 / 删除 ──
function doDuplicate() {
  const result = duplicateSelectedItem();
  if (result) {
    toast('已复制', 'success', 2000);
    renderImgGrid();
    updateActionButtons();
  } else {
    toast('请先选择要复制的物品', 'info');
  }
}

function doDelete() {
  const sel = getSelection();
  if (!sel || (sel.type !== 'painting' && sel.type !== 'light')) {
    toast('请先选择要删除的物品', 'info');
    return;
  }
  const name = sel.type === 'painting' ? sel.data?.title || '画作' : sel.data?.name || '灯具';
  if (!confirm(`确定删除「${name}」？`)) return;
  const ok = deleteSelectedItem();
  if (ok) {
    toast('已删除', 'success', 2000);
    renderImgGrid();
    updateActionButtons();
    // Force panel back to gallery
    showPanel('gallery');
  }
}

// ── 新增 ──
function doAddLight(type) {
  const result = addLight(type || 'ceiling');
  if (result) {
    toast(`已添加${type === 'ceiling' ? '顶灯' : '墙灯'}`, 'success', 2000);
    renderImgGrid();
    updateActionButtons();
  }
}

function doAddPainting() {
  const result = addPainting();
  if (result) {
    toast('已添加画作', 'success', 2000);
    renderImgGrid();
    updateActionButtons();
  }
}

// ── 预设 ──
function loadPresets() {
  const wp = $('wallPresets');
  if (wp) {
    [
      { name: '晨白', color: '#f5f0e8' }, { name: '米黄', color: '#e8dcc8' },
      { name: '浅灰', color: '#e5e5e5' }, { name: '淡蓝', color: '#e0e8f0' },
      { name: '暖灰', color: '#d4cdc5' }, { name: '象牙', color: '#fffff0' },
    ].forEach((p) => {
      const btn = document.createElement('span');
      btn.className = 'preset';
      btn.textContent = p.name;
      btn.addEventListener('click', () => {
        if (currentGallery?.materials) {
          currentGallery.materials.wallColor = hexToRgb(p.color);
          refreshGallery(currentGallery);
        }
      });
      wp.appendChild(btn);
    });
  }

  const fp = $('floorPresets');
  if (fp) {
    [
      { name: '深棋', dark: '#3d3830', light: '#f8f4ec' },
      { name: '黑白', dark: '#2a2a2a', light: '#e8e8e8' },
      { name: '木质', dark: '#4a3525', light: '#c9b99a' },
      { name: '冷色', dark: '#2a3540', light: '#5a6a7e' },
      { name: '红棕', dark: '#4a2f25', light: '#d4b49a' },
    ].forEach((p) => {
      const btn = document.createElement('span');
      btn.className = 'preset';
      btn.textContent = p.name;
      btn.addEventListener('click', () => {
        if (currentGallery?.materials) {
          currentGallery.materials.floorDark = hexToRgb(p.dark);
          currentGallery.materials.floorLight = hexToRgb(p.light);
          refreshGallery(currentGallery);
        }
      });
      fp.appendChild(btn);
    });
  }
}

// ── 事件绑定 ──
function bindEvents() {
  // 快速选择
  ['Wall', 'Floor', 'Ceiling'].forEach((t) => {
    const btn = $('quickSelect' + t);
    if (btn) btn.addEventListener('click', () => selectByType(t.toLowerCase()));
  });

  // 展馆切换
  const gs = $('gallerySelect');
  if (gs) gs.addEventListener('change', () => {
    const v = parseInt(gs.value);
    if (v >= 0) selectGallery(v);
  });

  // 工具切换
  const selBtn = $('btnToolSelect');
  const moveBtn = $('btnToolMove');
  if (selBtn) selBtn.addEventListener('click', () => setTool('select'));
  if (moveBtn) moveBtn.addEventListener('click', () => setTool('translate'));

  // 复制 / 删除 / 新增
  const dupBtn = $('btnDuplicate');
  const delBtn = $('btnDelete');
  if (dupBtn) dupBtn.addEventListener('click', doDuplicate);
  if (delBtn) delBtn.addEventListener('click', doDelete);

  const addLightBtn = $('btnAddLight');
  const addWallLightBtn = $('btnAddWallLight');
  const addPaintingBtn = $('btnAddPainting');
  if (addLightBtn) addLightBtn.addEventListener('click', () => doAddLight('ceiling'));
  if (addWallLightBtn) addWallLightBtn.addEventListener('click', () => doAddLight('wall'));
  if (addPaintingBtn) addPaintingBtn.addEventListener('click', doAddPainting);

  // 画作属性
  ['paintingTitle', 'paintingArtist'].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener('input', syncPaintingTo3D);
  });

  // 尺寸滑块
  [
    { slider: 'paintingSizeW_range', text: 'paintingSizeW' },
    { slider: 'paintingSizeH_range', text: 'paintingSizeH' },
  ].forEach(({ slider, text }) => {
    const sl = $(slider), tx = $(text);
    if (sl && tx) {
      sl.addEventListener('input', () => { tx.value = sl.value; syncPaintingTo3D(); });
      tx.addEventListener('input', syncPaintingTo3D);
    }
  });

  // 位置滑块
  [
    { slider: 'paintingPosX_range', text: 'paintingPosX' },
    { slider: 'paintingPosY_range', text: 'paintingPosY' },
    { slider: 'paintingPosZ_range', text: 'paintingPosZ' },
  ].forEach(({ slider, text }) => {
    const sl = $(slider), tx = $(text);
    if (sl && tx) {
      sl.addEventListener('input', () => { tx.value = sl.value; syncPaintingPosition(); });
      tx.addEventListener('input', syncPaintingPosition);
    }
  });

  // 墙体选择
  const wallSelEl = $('paintingWall');
  if (wallSelEl) wallSelEl.addEventListener('change', () => {
    updateSelectedPainting({ wall: wallSelEl.value });
    const sel = getSelection();
    if (sel?.position) {
      $('paintingPosX').value = sel.position.x;
      $('paintingPosY').value = sel.position.y;
      $('paintingPosZ').value = sel.position.z;
      const rx = $('paintingPosX_range'), ry = $('paintingPosY_range'), rz = $('paintingPosZ_range');
      if (rx) rx.value = sel.position.x;
      if (ry) ry.value = sel.position.y;
      if (rz) rz.value = sel.position.z;
    }
  });

  // ── 灯具属性 ──
  const lightInputs = ['lightName', 'lightColor', 'lightEnabled', 'lightIntensity', 'lightRange', 'lightAngle', 'lightPenumbra'];
  lightInputs.forEach((id) => {
    const el = $(id);
    if (!el) return;
    const eventType = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventType, () => {
      syncLightTo3D();
      // Update display values for sliders
      if (id === 'lightIntensity') {
        const v = parseFloat(el.value);
        const label = $('lightIntensityVal');
        if (label) label.textContent = v.toFixed(1);
      } else if (id === 'lightRange') {
        const label = $('lightRangeVal');
        if (label) label.textContent = parseFloat(el.value).toFixed(0);
      } else if (id === 'lightAngle') {
        const label = $('lightAngleVal');
        if (label) label.textContent = parseFloat(el.value).toFixed(2);
      } else if (id === 'lightPenumbra') {
        const label = $('lightPenumbraVal');
        if (label) label.textContent = parseFloat(el.value).toFixed(2);
      }
    });
  });

  // 材质颜色
  ['wallColor', 'accentColor', 'ceilingColor', 'floorDark', 'floorLight'].forEach((key) => {
    const el = $('mat-' + key);
    if (el) el.addEventListener('input', () => {
      if (window._applyMaterialChange) window._applyMaterialChange(key, hexToRgb(el.value));
    });
  });

  const floorTypeSel = $('mat-floorType');
  if (floorTypeSel) floorTypeSel.addEventListener('change', () => {
    if (window._applyMaterialChange) window._applyMaterialChange('floorType', floorTypeSel.value);
  });

  // 保存/导出/导入
  const btnSave = $('btnSave');
  const btnSaveBottom = $('btnSaveBottom');
  const btnExport = $('btnExport');
  const btnImport = $('btnImport');
  const jsonFileInput = $('jsonFileInput');

  if (btnSave) btnSave.addEventListener('click', doSave);
  if (btnSaveBottom) btnSaveBottom.addEventListener('click', doSave);
  if (btnExport) btnExport.addEventListener('click', doExport);
  if (btnImport) btnImport.addEventListener('click', () => jsonFileInput?.click());
  if (jsonFileInput) jsonFileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) { doImport(e.target.files[0]); e.target.value = ''; }
  });

  // 上传
  const dz = $('dropzone');
  const fi = $('fileInput');

  if (dz && fi) {
    dz.addEventListener('click', () => fi.click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('over');
      if (e.dataTransfer?.files?.[0]) doUpload(e.dataTransfer.files[0]);
    });
    fi.addEventListener('change', (e) => {
      if (e.target.files[0]) { doUpload(e.target.files[0]); fi.value = ''; }
    });
  } else {
    console.error('上传组件未找到');
  }

  // 离线徽章
  const badge = $('offlineBadge');
  if (badge) {
    badge.textContent = '静态版';
    badge.classList.add('show');
  }
}

// ── 工具函数 ──
function rgbToHex(v) {
  if (!v && v !== 0) return '#ffffff';
  if (typeof v === 'string' && v.startsWith('#')) return v;
  return '#' + (typeof v === 'number' ? v.toString(16).padStart(6, '0') : 'ffffff');
}
function hexToRgb(v) {
  if (!v) return 0xffffff;
  if (typeof v === 'number') return v;
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(v);
  return m ? (parseInt(m[1], 16) << 16) | (parseInt(m[2], 16) << 8) | parseInt(m[3], 16) : 0xffffff;
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escAttr(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
