import * as THREE from 'three';
import { createRenderer, createScene, createCamera, createGrid } from './world/scene.js';
import { rotate, applyRotation, horizontalVectors, getYawPitch, setYawPitch, setSensitivity, setSmoothing } from './world/camera.js';
import { createEnvironment } from './world/environment.js';
import { createClouds } from './world/clouds.js';
import { createCloudShadows } from './world/cloudShadows.js';
import { createPostprocessing } from './world/postprocessing.js';
import { parseFunction, TYPES } from './functions/parser.js';
import { buildExplicit, buildImplicit, buildParametric, geometryFromImplicitArrays, toColliderData } from './functions/geometry.js';
import { requestImplicitBuild } from './workers/implicitClient.js';
import { initPhysics, setSurfaceColliders, updateSurfaceColliders, setSurfaceFrictions, spawnPlayer, movePlayer, stepWorld, getPlayerPosition, resetPlayer, isGrounded, getHorizontalSpeed } from './physics/physics.js';
import { getMode, setMode, onModeChange, MODE } from './mode.js';
import { initFunctionEditor } from './ui/functionEditor.js';
import { initFnCodexPanel } from './ui/fnCodexPanel.js';
import { initEnvironmentPanel } from './ui/environmentPanel.js';
import { initMaterialPanel } from './ui/materialPanel.js';
import { initLivePanel } from './ui/livePanel.js';
import { initSavePanel } from './ui/savePanel.js';
import * as savesApi from './storage/saves.js';
import { exportBackup, importBackup } from './storage/backup.js';
import { LEVELS } from './game/levels.js';
import * as customLevels from './game/customLevels.js';
import * as playSession from './game/playSession.js';
import * as collection from './game/collection.js';
import * as achievements from './game/achievements.js';
import * as props from './game/props.js';
import * as markers from './game/markers.js';
import { initLevelPropsPanel } from './ui/levelPropsPanel.js';
import { initSettingsPanel, loadSettings } from './ui/settingsPanel.js';
import { armConfirm } from './ui/confirm.js';
import { showFade, hideFade, toggleFade, replayIn } from './ui/transitions.js';

// ---- 基础场景 ----
const viewport = document.getElementById('viewport');
const renderer = createRenderer(viewport);
const scene = createScene();
const camera = createCamera(viewport);
const { grid: _grid0, axes } = createGrid(scene);
let grid = _grid0;
const env = createEnvironment(scene);
env.setVisible(false);
const clouds = createClouds(scene);
clouds.setVisible(false);
const cloudShadows = createCloudShadows(renderer);
// 云影 uniforms 全局共享：所有曲面材质引用同一对象，逐帧只需改一次 enabled
const cloudShadowUniforms = {
  uCloudShadowMap: { value: cloudShadows.texture },
  uCloudShadowBounds: { value: cloudShadows.bounds },
  uCloudShadowDark: { value: 0.5 },
  uCloudShadowEnabled: { value: 0.0 },
};
// 后期处理懒初始化（D4）：bloom 为纯数据对象（供 needPost 判定，零 WebGL 开销），
// 首次真正需要后处理时才创建 EffectComposer（开启辉光/体积雾时）。
const bloom = { enabled: false, strength: 0.8, threshold: 0.85, radius: 0.4 };
let post = null;
function ensurePost() {
  if (!post) {
    post = createPostprocessing(renderer, scene, camera, bloom);
    post.applyBloom();
  }
  return post;
}

// 中性补光：编辑模式未开预览时，保证图像可见、能看到真实颜色
const neutralLight = new THREE.Group();
neutralLight.add(
  new THREE.HemisphereLight(0xffffff, 0xb0b0b0, 0.9),
  new THREE.DirectionalLight(0xffffff, 0.5),
);
neutralLight.children[1].position.set(30, 60, 20);
scene.add(neutralLight);

const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');
const btnMode = document.getElementById('btn-mode');
const modeHint = document.getElementById('mode-hint');
const appVersionEl = document.getElementById('app-version');
if (appVersionEl) appVersionEl.textContent = 'v' + ((window.appInfo && window.appInfo.version) || '');
const envPanel = document.getElementById('env-panel');
const materialPanel = document.getElementById('material-panel');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarResizer = document.getElementById('sidebar-resizer');
const sidebarFloatToggle = document.getElementById('sidebar-float-toggle');
const helpPanel = document.getElementById('help-panel');
const settingsPanel = document.getElementById('settings-panel');
const btnSettings = document.getElementById('btn-settings');
const btnPlay = document.getElementById('btn-play');
const playPanel = document.getElementById('play-panel');
const playLevelName = document.getElementById('play-level-name');
const playLevelDesc = document.getElementById('play-level-desc');
const playLevelStatus = document.getElementById('play-level-status');
const playStartBtn = document.getElementById('play-start');
const playExitBtn = document.getElementById('play-exit');
const playCodexBtn = document.getElementById('play-codex');
const playLevelList = document.getElementById('play-level-list');
const levelFnsPanel = document.getElementById('level-fns-panel');
const levelFnsList = document.getElementById('level-fns-list');
const levelPropsPanel = document.getElementById('level-props-panel');
const levelPropsUploadBtn = document.getElementById('level-props-upload');
const levelPropsUploadStatus = document.getElementById('level-props-upload-status');
const codexPanel = document.getElementById('codex-panel');
const codexList = document.getElementById('codex-list');
const achievementPanel = document.getElementById('achievement-panel');
const achievementList = document.getElementById('achievement-list');
const playAchievementsBtn = document.getElementById('play-achievements');
const fncodexPanel = document.getElementById('fncodex-panel');
const btnFnCodex = document.getElementById('btn-fncodex');
const playHud = document.getElementById('play-hud');
const playHudTime = document.getElementById('play-hud-time');
const playHudProgress = document.getElementById('play-hud-progress');
const playHudGoal = document.getElementById('play-hud-goal');
const winOverlay = document.getElementById('win-overlay');
const winTitle = document.getElementById('win-title');
const winStats = document.getElementById('win-stats');
const winRetry = document.getElementById('win-retry');
const winExit = document.getElementById('win-exit');

// ---- 函数图像（多图像） ----
const DEFAULT_PROPERTIES = () => ({
  color: '#bfd4e8',
  metalness: 0.1,
  roughness: 0.6,
  emissiveIntensity: 0,
  emissiveColor: '#ffffff',
  transmission: 0,
  ior: 1.5,
  opacity: 1,
  friction: 1, // 玩家踩在该曲面上的物理摩擦（越大越抓地、越小越滑）
});

// 读取「保存为默认材质」的持久化默认值（新图像套用）
function loadMaterialDefaults() {
  try {
    const v = JSON.parse(localStorage.getItem('function-hills-mat-defaults') || 'null');
    return (v && typeof v === 'object') ? v : null;
  } catch { return null; }
}

let surfaces = [];
let selectedId = null;
let idCounter = 0;
let editorApi = null;
let materialPanelApi = null;
let livePanelApi = null;
let savePanelApi = null;
let settingsPanelApi = null;
let loadingSave = false;      // 读档重建期间置真，抑制自动保存，避免读档时误写
let autosaveTimer = null;
let levelActive = false;      // 关卡模式进行中：抑制自动保存，避免关卡世界写进自由世界存档
let freeWorld = null;         // 进入关卡前的自由世界快照，退出时恢复
let activeLevel = null;       // 当前进行中的关卡对象
let selectedLevel = null;     // 玩法面板里当前选中的关卡对象（内置或自制）
let levelMarkers = [];        // 编辑模式的关卡道具（出生点/存档点/常数/终点）
let markerCounter = 0;
let levelPropsPanelApi = null;
let fnCodexApi = null;

function applyPropsToMaterial(m, p) {
  m.color.set(p.color);
  m.metalness = p.metalness;
  m.roughness = p.roughness;
  m.emissive.set(p.emissiveColor);
  m.emissiveIntensity = p.emissiveIntensity;
  m.transmission = p.transmission;
  m.ior = p.ior;
  m.opacity = p.opacity;
  m.transparent = p.opacity < 1 || p.transmission > 0;
  m.needsUpdate = true;
}

function createSurfaceMaterial(props) {
  // DoubleSide：函数曲面是单片薄面，正面（法线朝上）与背面都可见，
  // 避免从侧面/低角度观察碗状等陡峭曲面时，近侧墙面因背面剔除而「透空」。
  const m = new THREE.MeshPhysicalMaterial({ flatShading: true, side: THREE.DoubleSide });
  applyPropsToMaterial(m, props);

  // 注入真实云影：按世界坐标 xz 采样俯视云透射率纹理，云开启时压暗曲面
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCloudShadowMap = cloudShadowUniforms.uCloudShadowMap;
    shader.uniforms.uCloudShadowBounds = cloudShadowUniforms.uCloudShadowBounds;
    shader.uniforms.uCloudShadowDark = cloudShadowUniforms.uCloudShadowDark;
    shader.uniforms.uCloudShadowEnabled = cloudShadowUniforms.uCloudShadowEnabled;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCloudWorldPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvCloudWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' +
        'varying vec3 vCloudWorldPos;\n' +
        'uniform sampler2D uCloudShadowMap;\n' +
        'uniform float uCloudShadowBounds;\n' +
        'uniform float uCloudShadowDark;\n' +
        'uniform float uCloudShadowEnabled;\n' +
        'float cloudShadowFactor() {\n' +
        '  if (uCloudShadowEnabled < 0.5) return 1.0;\n' +
        '  vec2 suv = (vCloudWorldPos.xz + uCloudShadowBounds) / (2.0 * uCloudShadowBounds);\n' +
        '  float t = texture2D(uCloudShadowMap, suv).r;\n' +
        '  return mix(1.0, uCloudShadowDark, 1.0 - t);\n' +
        '}')
      .replace('#include <opaque_fragment>', 'outgoingLight *= cloudShadowFactor();\n#include <opaque_fragment>');
  };

  return m;
}

function getSurface(id) { return surfaces.find(s => s.id === id); }

// ---- 状态 ----
const keys = {};
let jumpQueued = false;
let pointerLocked = false;
let flyPos = camera.position.clone();
let sprint = false;          // 双击 W 触发的冲刺状态（按住 W 保持）
let lastForwardKeydown = 0;  // 上次 W 按下的时间戳，用于双击检测
let bobPhase = 0;            // 第一人称走路晃动相位
let bobAmount = 0;           // 晃动强度（走路渐入、停下渐出）
let bobStrength = 100;       // 头部晃动强度百分比（设置面板可调，0=完全关闭）

// 编辑模式飞行速度（滚轮调节，记忆到本地）
const FLY_SPEED_KEY = 'function-hills-fly-speed';
let flySpeed = Number(localStorage.getItem(FLY_SPEED_KEY));
if (!flySpeed || flySpeed < 1 || flySpeed > 100) flySpeed = 10;
let flySpeedTimer = null;

// ---- 舒适度设置应用（鼠标灵敏度 / FOV / 视角平滑 / 头部晃动 / 飞行速度）----
function setFov(v) {
  camera.fov = v;
  camera.updateProjectionMatrix();
}

// 画质档位（低/中/高）：只调渲染开销旋钮（分辨率/阴影贴图），
// 不改变环境面板的显式开关（阴影、云、辉光等开闭），也不覆盖云采样（云采样由环境面板唯一控制）。
function applyQuality(q) {
  const low = q === 'low';
  // 像素比固定 1（v1.0.0 即如此，不跟随系统缩放）：高画质若放大到 dpr×2，
  // 会让体积云等满屏逐像素开销翻 4 倍，高分屏上面对悬浮隐式曲面时明显掉帧。
  renderer.setPixelRatio(1);
  env.setShadowQuality(low);
  updateViewportSize();
}

function applySettings(settings) {
  if (!settings) return;
  setSensitivity(settings.sensitivity);
  setSmoothing(settings.smoothing);
  setFov(settings.fov);
  bobStrength = settings.headBob;
  if (typeof settings.flySpeed === 'number') {
    flySpeed = settings.flySpeed;
    try { localStorage.setItem(FLY_SPEED_KEY, String(flySpeed)); } catch {}
    if (settingsPanelApi) settingsPanelApi.setFlySpeed(flySpeed);
  }
  if (settings.quality) applyQuality(settings.quality);
}

// ---- 按键绑定 ----
const KEYMAP_KEY = 'function-hills-keymap';
const DEFAULT_KEYMAP = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  down: 'ShiftLeft',
  modeToggle: 'Tab',
  help: 'KeyH',
  lockMouse: 'KeyE',
  toggleSidebar: 'KeyF',
};
const ACTION_LABELS = {
  forward: '前进', backward: '后退', left: '左移', right: '右移',
  jump: '跳跃 / 上升', down: '下蹲 / 下降', modeToggle: '切换模式', help: '操作说明',
  lockMouse: '锁定 / 解锁鼠标', toggleSidebar: '呼出 / 收起侧边栏',
};

const keymap = { ...DEFAULT_KEYMAP };
try {
  const saved = JSON.parse(localStorage.getItem(KEYMAP_KEY) || 'null');
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(DEFAULT_KEYMAP)) {
      if (typeof saved[k] === 'string') keymap[k] = saved[k];
    }
  }
} catch {}

function saveKeymap() {
  try { localStorage.setItem(KEYMAP_KEY, JSON.stringify(keymap)); } catch {}
}

function keyDisplay(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names = {
    Space: '空格', ShiftLeft: '左Shift', ShiftRight: '右Shift',
    ControlLeft: '左Ctrl', ControlRight: '右Ctrl',
    AltLeft: '左Alt', AltRight: '右Alt',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Tab: 'Tab', Escape: 'Esc', Enter: '回车',
  };
  return names[code] || code;
}

// ---- 状态提示（toast）----
// 自动消失 + 渐隐 + 类型着色；新消息顶掉旧消息（单一 toast，避免飞行速度等高频提示堆积）
let statusTimer = null;

function showStatus(msg, type = 'info', duration = 1800) {
  clearTimeout(statusTimer);
  statusEl.classList.remove('fade-out', 'hidden', 'status-info', 'status-success', 'status-error');
  statusEl.classList.add('status-' + type);
  statusEl.textContent = msg;
  // 重放入场动画（连续显示时重新上移淡入）
  replayIn(statusEl);
  statusTimer = setTimeout(hideStatus, duration);
}

// 解锁成就并即时提示（幂等：已解锁不再重复提示）
function unlockAchievement(id) {
  if (achievements.unlock(id)) showStatus('🏆 成就解锁：' + achievements.nameOf(id), 'success');
}
function hideStatus() {
  clearTimeout(statusTimer);
  if (statusEl.classList.contains('hidden')) return;
  statusEl.classList.add('fade-out');
}
// 渐隐过渡结束后再真正 display:none，避免瞬间消失
statusEl.addEventListener('transitionend', (e) => {
  if (e.target === statusEl && e.propertyName === 'opacity' && statusEl.classList.contains('fade-out')) {
    statusEl.classList.add('hidden');
    statusEl.classList.remove('fade-out');
  }
});

// ---- 视距（生成水平边界）----
let viewDistance = 10;
let viewDistanceTimer = null;
let gridResizeTimer = null; // 视距拖动时防抖重建参考网格（new GridHelper 分配较重）
let smoothness = 5; // 全局网格平滑度（细密程度），默认 5

// 参考网格随视距缩放（尺寸 = 2×视距），保持与函数生成范围一致
function setGridSize(H) {
  const size = 2 * H;
  const divs = Math.min(200, Math.max(20, Math.round(size)));
  const ng = new THREE.GridHelper(size, divs, 0xcccccc, 0xe8e8e8);
  ng.position.y = -0.01;
  ng.visible = grid.visible;
  scene.add(ng);
  scene.remove(grid);
  grid.geometry.dispose();
  grid.material.dispose();
  grid = ng;
}

// 根据范围对象解析生成半宽 { Hx, Hy, Vz }：独立范围(follow:false)用自定值，否则跟随视距
function extentsFromRange(r) {
  if (r && r.follow === false) {
    return {
      Hx: typeof r.x === 'number' ? r.x : viewDistance,
      Hy: typeof r.y === 'number' ? r.y : viewDistance,
      Vz: typeof r.z === 'number' ? r.z : viewDistance * 3,
    };
  }
  return { Hx: viewDistance, Hy: viewDistance, Vz: viewDistance * 3 };
}

// 曲面的生成范围（半宽）
function surfaceExtents(s) {
  return extentsFromRange(s && s.range);
}

// 曲面的原点偏移（世界坐标三维平移 [ox, oy, oz]）
function surfaceOrigin(s) {
  return (s && Array.isArray(s.origin) && s.origin.length === 3) ? s.origin : [0, 0, 0];
}

function normalizeOrigin(origin) {
  return (Array.isArray(origin) && origin.length === 3)
    ? [Number(origin[0]) || 0, Number(origin[1]) || 0, Number(origin[2]) || 0]
    : [0, 0, 0];
}

function normalizeRange(range) {
  if (range && range.follow === false) {
    return { follow: false, x: range.x, y: range.y, z: range.z };
  }
  return { follow: true };
}

// 按当前视距 + 平滑度 + 曲面原点/独立范围构建几何（显式/隐式随视距自适应加顶点；参数方程仅受平滑度影响）
function buildGeometry(type, parsed, ranges, origin = [0, 0, 0], extents) {
  const k = smoothness / 5; // 平滑度倍率（默认 5 → 1）
  const e = extents || { Hx: viewDistance, Hy: viewDistance, Vz: viewDistance * 3 };
  if (type === TYPES.EXPLICIT) {
    const res = Math.max(32, Math.min(320, Math.round(120 * k * (viewDistance / 10))));
    return buildExplicit(parsed.fn, res, e.Hx, e.Hy, origin);
  }
  if (type === TYPES.IMPLICIT) {
    // sqrt 缩放抑制立方开销；竖直高度为独立范围 z 或视距 3 倍
    const res = Math.max(24, Math.min(96, Math.round(64 * k * Math.sqrt(viewDistance / 10))));
    return buildImplicit(parsed.fn, res, e.Hx, e.Hy, e.Vz, origin);
  }
  const res = Math.max(32, Math.min(200, Math.round(90 * k)));
  return buildParametric(parsed.fn, res, ranges?.uRange, ranges?.vRange, origin);
}

// ---- 隐式函数后台生成（Worker + 预计算标量场）----
// 隐式分辨率（与 buildGeometry 同步退路一致）
function implicitRes() {
  const k = smoothness / 5;
  return Math.max(24, Math.min(96, Math.round(64 * k * Math.sqrt(viewDistance / 10))));
}

// 当前实时调节变量值（供 Worker 重编译时代入）
function paramValuesOf(parsed) {
  const out = {};
  if (parsed && parsed.params) for (const p of parsed.params) out[p.name] = p.value;
  return out;
}

// paramValuesOf 的反向：把 {name: value}（或关卡参数 {name: {value,...}}）写回参数定义与求值作用域，
// 供 generate 在构建几何前套用关卡初值（D2，避免进入关卡后二次重建）。
function applyParamValues(parsed, paramValues) {
  if (!parsed || !paramValues || typeof paramValues !== 'object') return;
  for (const p of parsed.params) {
    const raw = paramValues[p.name];
    const v = (raw && typeof raw === 'object') ? raw.value : raw;
    if (typeof v === 'number' && Number.isFinite(v)) {
      p.value = v;
      parsed.scope[p.name] = v;
    }
  }
}

// 构建几何：显式/参数同步；隐式走 Worker（异步，失败退回同步）。
// expr 为原始表达式（隐式 Worker 需自行重编译）。
async function buildGeometryAsync(type, expr, parsed, ranges, origin = [0, 0, 0], extents) {
  if (type !== TYPES.IMPLICIT) return buildGeometry(type, parsed, ranges, origin, extents);
  const e = extents || { Hx: viewDistance, Hy: viewDistance, Vz: viewDistance * 3 };
  try {
    const { positions, indices } = await requestImplicitBuild({
      expr,
      paramValues: paramValuesOf(parsed),
      res: implicitRes(),
      Hx: e.Hx, Hy: e.Hy, Vz: e.Vz,
      origin,
    });
    return geometryFromImplicitArrays(positions, indices);
  } catch (err) {
    console.warn('[隐式] Worker 生成失败，退回同步：', err);
    return buildGeometry(TYPES.IMPLICIT, parsed, ranges, origin, extents);
  }
}

// 隐式图像异步重建：发 Worker 生成，genId 丢弃过期结果，失败退回同步
async function rebuildImplicitAsync(s) {
  const myGen = ++s.genId;
  const origin = surfaceOrigin(s);
  const e = surfaceExtents(s);
  try {
    const { positions, indices } = await requestImplicitBuild({
      expr: s.expr,
      paramValues: paramValuesOf(s.parsed),
      res: implicitRes(),
      Hx: e.Hx, Hy: e.Hy, Vz: e.Vz,
      origin,
    });
    if (myGen !== s.genId) return; // 已有更新的重建请求，丢弃过期结果
    applyNewGeometry(s, geometryFromImplicitArrays(positions, indices));
  } catch (err) {
    console.warn('[隐式] Worker 生成失败，退回同步：', err);
    if (myGen !== s.genId) return;
    applyNewGeometry(s, buildGeometry(TYPES.IMPLICIT, s.parsed, s.ranges, origin, e));
  }
}

// 把新几何替换到图像上（保留材质/名称/显隐等属性），返回是否成功
function applyNewGeometry(s, geo) {
  if (!geo.getAttribute('position') || geo.getAttribute('position').count === 0) {
    geo.dispose();
    return false;
  }
  scene.remove(s.mesh);
  s.geometry.dispose();
  s.mesh = new THREE.Mesh(geo, s.material);
  s.mesh.visible = s.visible;
  s.mesh.castShadow = env.params.shadows;
  s.mesh.receiveShadow = env.params.shadows;
  scene.add(s.mesh);
  s.geometry = geo;
  s.colliderData = toColliderData(geo);
  return true;
}

// 用当前视距/平滑度重建单个图像几何（参数方程与视距无关，跳过；隐式走 Worker）
async function rebuildSurfaceGeometry(s) {
  if (s.type === TYPES.PARAMETRIC) return;
  if (s.type === TYPES.IMPLICIT) { await rebuildImplicitAsync(s); return; }
  applyNewGeometry(s, buildGeometry(s.type, s.parsed, s.ranges, surfaceOrigin(s), surfaceExtents(s)));
}

// 实时变量改变后重建（参数方程也受变量影响，故不跳过）
async function rebuildSurfaceForParam(s) {
  if (s.type === TYPES.IMPLICIT) { await rebuildImplicitAsync(s); return; }
  applyNewGeometry(s, buildGeometry(s.type, s.parsed, s.ranges, surfaceOrigin(s), surfaceExtents(s)));
}

function setViewDistance(h) {
  h = Math.min(50, Math.max(5, Math.round(h)));
  if (h === viewDistance) return;
  viewDistance = h;
  env.setSunShadowBounds(h);
  // 参考网格重建较重，拖动视距时防抖，避免每步 new GridHelper 造成分配抖动
  clearTimeout(gridResizeTimer);
  gridResizeTimer = setTimeout(() => setGridSize(viewDistance), 250);
  scheduleRegenerateFollow();
}

function setSmoothness(s) {
  s = Math.min(10, Math.max(1, Math.round(s)));
  if (s === smoothness) return;
  smoothness = s;
  scheduleRegenerateAll();
}

// 视距改变后：只重建「跟随视距」的曲面（独立范围曲面保持自身边界不动）
function scheduleRegenerateFollow() {
  if (surfaces.length === 0) return;
  showStatus('生成中…');
  clearTimeout(viewDistanceTimer);
  viewDistanceTimer = setTimeout(async () => {
    await Promise.all(surfaces.filter(s => !s.range || s.range.follow !== false).map(s => rebuildSurfaceGeometry(s)));
    rebuildColliders();
    hideStatus();
  }, 250);
}

// 平滑度改变后：全部曲面按新分辨率重建
function scheduleRegenerateAll() {
  if (surfaces.length === 0) return;
  showStatus('生成中…');
  clearTimeout(viewDistanceTimer);
  viewDistanceTimer = setTimeout(async () => {
    await Promise.all(surfaces.map(s => rebuildSurfaceGeometry(s)));
    rebuildColliders();
    hideStatus();
  }, 250);
}

// ---- 实时调节变量 ----
let paramRegenTimer = null;
const paramDirty = new Set();

// 改变某图像的调节变量取值：更新 scope 后防抖重建几何（拖动滑杆时合并多次变化）
function setParamValue(id, name, value) {
  const s = getSurface(id);
  if (!s || !s.parsed) return;
  unlockAchievement('tuner');
  s.parsed.scope[name] = value;
  const p = s.parsed.params.find(x => x.name === name);
  if (p) p.value = value;
  scheduleAutosave();
  paramDirty.add(s);
  clearTimeout(paramRegenTimer);
  paramRegenTimer = setTimeout(async () => {
    const dirty = [...paramDirty];
    paramDirty.clear();
    await Promise.all(dirty.map(d => rebuildSurfaceForParam(d)));
    syncCollidersFor(dirty);
  }, 100);
}

// 改变某图像的原点偏移：更新后防抖重建几何与碰撞体（拖动滑杆时合并多次变化）
let originRegenTimer = null;
const ORIGIN_AXIS_INDEX = { x: 0, y: 1, z: 2 };

function setOriginValue(id, axis, value) {
  const s = getSurface(id);
  if (!s) return;
  unlockAchievement('tuner');
  const idx = ORIGIN_AXIS_INDEX[axis];
  if (idx === undefined) return;
  s.origin[idx] = Number(value) || 0;
  scheduleAutosave();
  clearTimeout(originRegenTimer);
  originRegenTimer = setTimeout(async () => {
    await rebuildSurfaceForParam(s); // 隐式走 Worker，其余同步；均重读 surfaceOrigin(s)
    syncCollidersFor([s]); // 物理碰撞体随原点一起平移（只重建这一张）
  }, 100);
}

// 锁定/解锁某图像的调节变量：锁定后取值冻结，关卡模式下该变量不显示
function setParamLocked(id, name, locked) {
  const s = getSurface(id);
  if (!s || !s.parsed) return;
  const p = s.parsed.params.find(x => x.name === name);
  if (p) p.locked = !!locked;
  scheduleAutosave();
}

// ---- 生成 / 增删图像 ----
async function generate(type, expr, ranges, origin, range, paramOverrides, paramValues) {
  let parsed;
  try {
    parsed = parseFunction(type, expr, paramOverrides);
  } catch (err) {
    return { error: '表达式解析失败：' + err.message };
  }
  // 关卡初值：构建几何前写入参数定义与求值作用域（D2）
  applyParamValues(parsed, paramValues);

  showStatus('生成中…');
  await new Promise(r => setTimeout(r, 30));

  try {
    const o = normalizeOrigin(origin);
    const extents = extentsFromRange(range);
    const geo = await buildGeometryAsync(type, expr, parsed, ranges, o, extents);

    if (!geo.getAttribute('position') || geo.getAttribute('position').count === 0) {
      hideStatus();
      return { error: '该函数在当前范围内没有图像' };
    }

    addSurface({ type, expr, ranges, geo, parsed, origin: o, range: normalizeRange(range) });
    hideStatus();
    return { id: selectedId };
  } catch (err) {
    hideStatus();
    return { error: '生成失败：' + err.message };
  }
}

function addSurface({ type, expr, ranges, geo, parsed, origin, range }) {
  const id = ++idCounter;
  const properties = { ...DEFAULT_PROPERTIES(), ...(loadMaterialDefaults() || {}) };
  const material = createSurfaceMaterial(properties);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = env.params.shadows;
  mesh.receiveShadow = env.params.shadows;
  scene.add(mesh);
  surfaces.push({
    id,
    name: `图像 ${id}`,
    type,
    expr,
    ranges,
    parsed,
    geometry: geo,
    mesh,
    material,
    properties,
    visible: true,
    origin: normalizeOrigin(origin),
    range: normalizeRange(range),
    colliderData: toColliderData(geo),
    genId: 0, // 隐式异步重建的请求序号（丢弃过期结果）
  });
  selectSurface(id);
  scheduleAutosave();
  unlockAchievement('builder-first');
  if (surfaces.length >= 5) unlockAchievement('builder-five');
}

function selectSurface(id) {
  selectedId = id;
  const s = getSurface(id);
  if (s) {
    materialPanelApi.setTitle(s.name);
    materialPanelApi.setValues(s.properties);
  }
  if (livePanelApi) livePanelApi.renderParams(s || null);
  editorApi.renderList(surfaces, selectedId);
}

function removeSurface(id) {
  const i = surfaces.findIndex(s => s.id === id);
  if (i === -1) return;
  const s = surfaces[i];
  scene.remove(s.mesh);
  s.geometry.dispose();
  s.material.dispose();
  surfaces.splice(i, 1);
  if (selectedId === id) selectedId = surfaces.length ? surfaces[surfaces.length - 1].id : null;
  rebuildColliders();
  const ns = getSurface(selectedId);
  materialPanelApi.setTitle(ns ? ns.name : null);
  if (ns) materialPanelApi.setValues(ns.properties);
  if (livePanelApi) livePanelApi.renderParams(ns || null);
  editorApi.renderList(surfaces, selectedId);
  scheduleAutosave();
}

function setSurfaceVisible(id, visible) {
  const s = getSurface(id);
  if (!s) return;
  s.visible = visible;
  s.mesh.visible = visible;
  rebuildColliders();
  editorApi.renderList(surfaces, selectedId);
  scheduleAutosave();
}

function renameSurface(id, name) {
  const s = getSurface(id);
  if (!s) return;
  const clean = String(name || '').trim();
  s.name = clean || s.name;
  if (id === selectedId) materialPanelApi.setTitle(s.name);
  editorApi.renderList(surfaces, selectedId);
  scheduleAutosave();
}

function updateProperties(id, props) {
  const s = getSurface(id);
  if (!s) return;
  const frictionChanged = typeof props.friction === 'number' && props.friction !== s.properties.friction;
  Object.assign(s.properties, props);
  applyPropsToMaterial(s.material, s.properties);
  if (frictionChanged) setSurfaceFrictions([{ id: s.id, friction: s.properties.friction }]); // 只改摩擦，不重建 trimesh
  scheduleAutosave();
}

// 修改已有图像的表达式/原点/范围：重建几何，保留材质/名称/显隐等属性
async function updateSurface(id, type, expr, ranges, origin, range, paramOverrides) {
  const s = getSurface(id);
  if (!s) return { error: '未找到该图像' };

  let parsed;
  try {
    parsed = parseFunction(type, expr, paramOverrides);
  } catch (err) {
    return { error: '表达式解析失败：' + err.message };
  }

  showStatus('生成中…');
  await new Promise(r => setTimeout(r, 30));

  try {
    const o = normalizeOrigin(origin);
    const extents = extentsFromRange(range);
    const geo = await buildGeometryAsync(type, expr, parsed, ranges, o, extents);

    if (!geo.getAttribute('position') || geo.getAttribute('position').count === 0) {
      hideStatus();
      return { error: '该函数在当前范围内没有图像' };
    }

    scene.remove(s.mesh);
    s.geometry.dispose();
    s.mesh = new THREE.Mesh(geo, s.material);
    s.mesh.visible = s.visible;
    s.mesh.castShadow = env.params.shadows;
    s.mesh.receiveShadow = env.params.shadows;
    scene.add(s.mesh);

    s.geometry = geo;
    s.type = type;
    s.expr = expr;
    s.ranges = ranges;
    s.parsed = parsed;
    s.origin = o;
    s.range = normalizeRange(range);
    s.colliderData = toColliderData(geo);

    rebuildColliders();
    if (s.id === selectedId && livePanelApi) livePanelApi.renderParams(s);
    editorApi.renderList(surfaces, selectedId);
    scheduleAutosave();
    hideStatus();
    return { id };
  } catch (err) {
    hideStatus();
    return { error: '生成失败：' + err.message };
  }
}

// ---- 关卡道具（编辑模式标记物）----
function createMarkerVisual(kind, symbol, pos) {
  if (kind === 'spawn') return markers.makeSpawnRing(pos);
  if (kind === 'checkpoint') return markers.makeCheckpointRing(pos);
  if (kind === 'treasure') {
    const sp = markers.makeSymbolSprite(symbol);
    sp.position.set(pos[0], pos[1], pos[2]);
    return sp;
  }
  return markers.makeEndpoint(pos).group; // end
}

function placeMarker(kind, symbol) {
  const pos = [flyPos.x, flyPos.y, flyPos.z];
  // 出生点/终点唯一：再次放置时替换旧位置
  if (kind === 'spawn' || kind === 'end') removeMarkersByKind(kind);
  const id = 'm' + (++markerCounter);
  const visual = createMarkerVisual(kind, symbol, pos);
  scene.add(visual);
  levelMarkers.push({ id, kind, symbol: symbol || null, pos, visual });
  levelPropsPanelApi.render(levelMarkers);
  scheduleAutosave();
}

function restoreMarker(data) {
  const kind = data.kind;
  const pos = Array.isArray(data.pos) ? data.pos : [0, 8, 0];
  const id = 'm' + (++markerCounter);
  const visual = createMarkerVisual(kind, data.symbol, pos);
  scene.add(visual);
  levelMarkers.push({ id, kind, symbol: data.symbol || null, pos, visual });
}

function removeMarker(id) {
  const i = levelMarkers.findIndex(m => m.id === id);
  if (i === -1) return;
  const m = levelMarkers[i];
  if (m.visual) { scene.remove(m.visual); markers.disposeMarker(m.visual); }
  levelMarkers.splice(i, 1);
  levelPropsPanelApi.render(levelMarkers);
  scheduleAutosave();
}

function removeMarkersByKind(kind) {
  for (const m of levelMarkers) {
    if (m.kind === kind && m.visual) { scene.remove(m.visual); markers.disposeMarker(m.visual); }
  }
  levelMarkers = levelMarkers.filter(m => m.kind !== kind);
}

function clearMarkers() {
  for (const m of levelMarkers) {
    if (m.visual) { scene.remove(m.visual); markers.disposeMarker(m.visual); }
  }
  levelMarkers = [];
  if (levelPropsPanelApi) levelPropsPanelApi.render(levelMarkers);
}

function focusMarker(m) {
  const p = m.pos;
  flyPos.set(p[0], p[1] + 2, p[2] + 6);
  camera.position.copy(flyPos);
  applyRotation(camera);
}

// ---- 物理碰撞 ----
function colliderFor(s) {
  return {
    id: s.id,
    ...s.colliderData,
    friction: (s.properties && typeof s.properties.friction === 'number') ? s.properties.friction : (s.friction ?? 1),
  };
}

// 全量重建（进探索/进关卡/读档/增删图像/显隐等一次性场景）
function rebuildColliders() {
  setSurfaceColliders(surfaces.filter(s => s.visible).map(colliderFor));
}

// 增量同步指定曲面的碰撞体（拖动滑杆/原点时只重建受影响的刚体，其余保持不动）
function syncCollidersFor(dirty) {
  const toUpdate = [];
  const toRemove = [];
  for (const s of dirty) {
    if (s.visible) toUpdate.push(colliderFor(s));
    else toRemove.push(s.id);
  }
  updateSurfaceColliders(toUpdate, toRemove);
}

// ---- 环境可见性 ----
function updateEnvironmentVisibility() {
  const show = getMode() === MODE.EXPLORE || getMode() === MODE.LEVEL || env.params.preview;
  env.setVisible(show);
  clouds.setVisible(show);
  neutralLight.visible = !show;
}

// ---- 模式切换 ----
function updateModeUI(m) {
  sidebar.classList.toggle('level-mode', m === MODE.LEVEL);
  if (m === MODE.LEVEL) {
    btnMode.textContent = '切换到编辑模式';
    modeHint.textContent = '当前：关卡模式（重力 · 集齐宝物过关）';
    grid.visible = false;
    axes.visible = false;
    envPanel.classList.add('hidden');
    materialPanel.classList.add('hidden');
    levelPropsPanel.classList.add('hidden');
  } else if (m === MODE.EDIT) {
    btnMode.textContent = '切换到探索模式';
    modeHint.textContent = '当前：编辑模式（自由飞行）';
    grid.visible = true;
    axes.visible = true;
    envPanel.classList.remove('hidden');
    materialPanel.classList.remove('hidden');
    levelPropsPanel.classList.remove('hidden');
  } else {
    btnMode.textContent = '切换到编辑模式';
    modeHint.textContent = '当前：探索模式（重力）';
    grid.visible = false;
    axes.visible = false;
    envPanel.classList.add('hidden');
    materialPanel.classList.add('hidden');
    levelPropsPanel.classList.add('hidden');
  }
}

onModeChange((m) => {
  updateEnvironmentVisibility();
  updateModeUI(m);
  if (m === MODE.EXPLORE) unlockAchievement('explorer');
});

async function switchMode() {
  if (getMode() === MODE.LEVEL) return; // 关卡模式内禁止切换编辑/探索
  if (getMode() === MODE.EDIT) {
    await initPhysics();
    spawnPlayer(flyPos.x, Math.max(flyPos.y, 6), flyPos.z);
    rebuildColliders();
    setMode(MODE.EXPLORE);
  } else {
    const p = getPlayerPosition();
    flyPos.set(p.x, p.y + 2, p.z);
    setMode(MODE.EDIT);
  }
  scheduleAutosave(0);
}

btnMode.addEventListener('click', () => switchMode());

// ---- 侧边栏：收起/展开 + 拖动调宽（宽度与收起状态记忆）----
const SIDEBAR_WIDTH_KEY = 'function-hills-sidebar-width';
const SIDEBAR_COLLAPSED_KEY = 'function-hills-sidebar-collapsed';

let sidebarWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
if (!sidebarWidth || sidebarWidth < 240 || sidebarWidth > 480) sidebarWidth = 280;
sidebar.style.width = sidebarWidth + 'px';
sidebar.style.minWidth = '240px';

let sidebarCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
function applySidebarCollapsed() {
  sidebar.classList.toggle('collapsed', sidebarCollapsed);
  // 收起时宽度/最小宽度归零，侧边栏彻底隐藏、视口铺满整窗
  sidebar.style.width = sidebarCollapsed ? '0px' : sidebarWidth + 'px';
  sidebar.style.minWidth = sidebarCollapsed ? '0px' : '240px';
  sidebarResizer.style.display = sidebarCollapsed ? 'none' : '';
  sidebarToggle.textContent = sidebarCollapsed ? '»' : '«';
  sidebarToggle.title = sidebarCollapsed ? '展开侧边栏' : '收起侧边栏';
  sidebarFloatToggle.classList.toggle('hidden', !sidebarCollapsed);
}
function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0');
  applySidebarCollapsed();
}
sidebarToggle.addEventListener('click', toggleSidebar);
sidebarFloatToggle.addEventListener('click', () => {
  sidebarCollapsed = false;
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '0');
  applySidebarCollapsed();
});

sidebarResizer.addEventListener('mousedown', (e) => {
  e.preventDefault();
  sidebar.classList.add('dragging');
  const startX = e.clientX;
  const startW = sidebar.getBoundingClientRect().width;
  const onMove = (ev) => {
    const w = Math.min(480, Math.max(240, startW + ev.clientX - startX));
    sidebar.style.width = w + 'px';
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    sidebar.classList.remove('dragging');
    sidebarWidth = Math.round(sidebar.getBoundingClientRect().width);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});
applySidebarCollapsed();

// ---- 侧边栏面板折叠（手风琴，记忆折叠状态）----
const PANEL_COLLAPSED_KEY = 'function-hills-panel-collapsed';
let collapsedPanels;
try {
  collapsedPanels = new Set(JSON.parse(localStorage.getItem(PANEL_COLLAPSED_KEY) || '[]'));
} catch {
  collapsedPanels = new Set();
}
function saveCollapsedPanels() {
  localStorage.setItem(PANEL_COLLAPSED_KEY, JSON.stringify([...collapsedPanels]));
}
document.querySelectorAll('#sidebar .panel').forEach((panel) => {
  if (panel.id === 'editor-panel') return; // 编辑面板自带关闭按钮，不做折叠
  const h2 = panel.querySelector(':scope > h2');
  if (!h2) return;
  // 标题内容包进 .ph-title，末尾追加折叠箭头
  const titleSpan = document.createElement('span');
  titleSpan.className = 'ph-title';
  while (h2.firstChild) titleSpan.appendChild(h2.firstChild);
  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.textContent = '▾';
  h2.appendChild(titleSpan);
  h2.appendChild(chevron);
  // 其余内容包进 .panel-body，点击标题折叠/展开
  const body = document.createElement('div');
  body.className = 'panel-body';
  Array.from(panel.children).forEach((child) => { if (child !== h2) body.appendChild(child); });
  panel.appendChild(body);
  if (collapsedPanels.has(panel.id)) panel.classList.add('collapsed');
  h2.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    if (panel.classList.contains('collapsed')) collapsedPanels.add(panel.id);
    else collapsedPanels.delete(panel.id);
    saveCollapsedPanels();
  });
});

function toggleHelp() {
  toggleFade(helpPanel);
}

// ---- 按键设置面板 ----
const keybindList = document.getElementById('keybind-list');
const keybindReset = document.getElementById('keybind-reset');

let rebindingAction = null;
let rebindButton = null;
let rebindOriginalText = '';

function renderKeybinds() {
  keybindList.innerHTML = '';
  for (const action of Object.keys(DEFAULT_KEYMAP)) {
    const row = document.createElement('div');
    row.className = 'keybind-row';
    const label = document.createElement('span');
    label.className = 'kb-label';
    label.textContent = ACTION_LABELS[action];
    const key = document.createElement('span');
    key.className = 'keybind-key';
    key.textContent = keyDisplay(keymap[action]);
    const btn = document.createElement('button');
    btn.className = 'keybind-btn';
    btn.textContent = '改';
    btn.addEventListener('click', () => startRebind(action, btn));
    row.append(label, key, btn);
    keybindList.appendChild(row);
  }
}

// 按当前键位动态生成「操作说明」，改键后同步
function renderHelp() {
  const lines = helpPanel.querySelector('.help-lines');
  if (!lines) return;
  const k = (a) => keyDisplay(keymap[a]);
  lines.innerHTML =
    `<p>移动：<b>${k('forward')} ${k('backward')} ${k('left')} ${k('right')}</b>（双击 ${k('forward')} 冲刺）</p>` +
    `<p>编辑：<b>${k('jump')}</b> 上升 · <b>${k('down')}</b> 下降</p>` +
    `<p>探索：<b>${k('jump')}</b> 跳跃 · <b>${k('down')}</b> 下蹲</p>` +
    `<p>视角：<b>鼠标</b> 移动 · <b>Esc</b> 释放</p>` +
    `<p><b>${k('modeToggle')}</b> 切换模式 · <b>${k('help')}</b> 隐藏本说明</p>` +
    `<p><b>${k('toggleSidebar')}</b> 呼出侧边栏 · <b>${k('lockMouse')}</b> 锁定/解锁鼠标</p>`;
}

function startRebind(action, btn) {
  if (rebindingAction) cancelRebind();
  rebindingAction = action;
  rebindButton = btn;
  rebindOriginalText = btn.textContent;
  btn.textContent = '请按新键…';
  btn.classList.add('binding');
}

function cancelRebind() {
  if (!rebindingAction) return;
  rebindingAction = null;
  if (rebindButton) {
    rebindButton.textContent = rebindOriginalText;
    rebindButton.classList.remove('binding');
  }
  rebindButton = null;
}

// 捕获重绑按键（捕获阶段，优先于移动监听）
document.addEventListener('keydown', (e) => {
  if (!rebindingAction) return;
  if (isEditableTarget(e)) { cancelRebind(); return; }
  e.preventDefault();
  e.stopPropagation();
  if (e.code === 'Escape') { cancelRebind(); return; }
  // 冲突检测：新键已被其它动作占用则拒绝并提示
  const conflict = Object.keys(keymap).find(a => a !== rebindingAction && keymap[a] === e.code);
  if (conflict) {
    showStatus('该键已绑定：' + (ACTION_LABELS[conflict] || conflict), 'error');
    return;
  }
  keymap[rebindingAction] = e.code;
  saveKeymap();
  rebindingAction = null;
  renderKeybinds();
  renderHelp();
}, true);

armConfirm(keybindReset, '确认恢复默认?', () => {
  Object.assign(keymap, DEFAULT_KEYMAP);
  saveKeymap();
  cancelRebind();
  renderKeybinds();
  renderHelp();
});

renderKeybinds();
renderHelp();

// ---- 输入 ----
// 焦点在输入框/文本域等可编辑元素内时，键盘事件不应触发移动/跳跃
function isEditableTarget(e) {
  const t = e && e.target;
  if (!t) return false;
  const tag = (t.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

// 清空所有按键与冲刺状态（失焦/切模式/解锁鼠标时防止 keyup 丢失导致方向残留）
function clearMovementKeys() {
  for (const k in keys) delete keys[k];
  sprint = false;
  jumpQueued = false;
}

document.addEventListener('keydown', (e) => {
  if (isEditableTarget(e)) return;
  if (e.code === keymap.toggleSidebar) { toggleSidebar(); return; }
  if (e.code === keymap.lockMouse) { e.preventDefault(); togglePointerLock(); return; }
  if (e.code === keymap.modeToggle) {
    if (getMode() === MODE.LEVEL) return; // 关卡模式内 Tab 不切模式
    e.preventDefault();
    switchMode();
    return;
  }
  if (e.code === keymap.help) {
    toggleHelp();
    return;
  }
  if (e.code === keymap.jump) {
    e.preventDefault();
    if (!e.repeat) jumpQueued = true;
  }
  // 双击 W 触发冲刺：两次按下间隔 < 260ms 且非自动重复
  if (e.code === keymap.forward) {
    const now = performance.now();
    if (!e.repeat && now - lastForwardKeydown < 260) {
      sprint = true;
      showStatus('💨 冲刺', 'success', 800);
    }
    lastForwardKeydown = now;
  }
  keys[e.code] = true;
});
document.addEventListener('keyup', (e) => {
  if (isEditableTarget(e)) return;
  keys[e.code] = false;
  if (e.code === keymap.forward) sprint = false; // 松开 W 即结束冲刺
});
// 焦点进入输入框时清空移动键，避免残留（例如在画面按住 W 后点进输入框）
document.addEventListener('focusin', (e) => {
  if (isEditableTarget(e)) clearMovementKeys();
});
// 窗口失焦 / 页面隐藏时清空按键，避免 Alt+Tab 等丢 keyup 造成移动方向残留
window.addEventListener('blur', clearMovementKeys);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearMovementKeys(); });

renderer.domElement.addEventListener('click', () => {
  if (!pointerLocked) renderer.domElement.requestPointerLock();
});
// E 键：锁定/解锁鼠标（与 Esc 释放作用一致，但可反向重新锁定）
function togglePointerLock() {
  if (pointerLocked) document.exitPointerLock();
  else renderer.domElement.requestPointerLock();
}
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (pointerLocked) hintEl.classList.add('hidden');
  else clearMovementKeys(); // 解锁鼠标时清空残留按键
});
document.addEventListener('mousemove', (e) => {
  if (pointerLocked) rotate(e.movementX, e.movementY);
});

// 滚轮调节飞行速度（编辑模式自由飞行）
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  flySpeed = Math.min(100, Math.max(1, flySpeed * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  flySpeed = Math.round(flySpeed * 10) / 10;
  try { localStorage.setItem(FLY_SPEED_KEY, String(flySpeed)); } catch {}
  if (settingsPanelApi) settingsPanelApi.setFlySpeed(flySpeed);
  showStatus('飞行速度：' + Math.round(flySpeed));
  clearTimeout(flySpeedTimer);
  flySpeedTimer = setTimeout(hideStatus, 1200);
}, { passive: false });

function updateViewportSize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (w <= 0 || h <= 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (post) post.setSize(w, h);
}
window.addEventListener('resize', updateViewportSize);
// 侧边栏收起/展开/拖动会改变视口尺寸，但不触发 window resize；
// 用 ResizeObserver 监听视口尺寸变化，实时更新画布。
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(updateViewportSize).observe(viewport);
}

// ---- UI 初始化 ----
editorApi = initFunctionEditor({
  onAdd: generate,
  onUpdate: updateSurface,
  onSelect: selectSurface,
  onRemove: removeSurface,
  onToggleVisible: setSurfaceVisible,
  onRename: renameSurface,
});
materialPanelApi = initMaterialPanel({
  onChange: (p) => updateProperties(selectedId, p),
});
livePanelApi = initLivePanel({
  onChange: (name, value) => setParamValue(selectedId, name, value),
  onLock: (name, locked) => setParamLocked(selectedId, name, locked),
  onOriginChange: (axis, value) => setOriginValue(selectedId, axis, value),
});
levelPropsPanelApi = initLevelPropsPanel({
  onPlace: (kind, symbol) => placeMarker(kind, symbol),
  onRemove: (id) => removeMarker(id),
  onFocus: (m) => focusMarker(m),
});
levelPropsPanelApi.render(levelMarkers);
const envPanelApi = initEnvironmentPanel({
  onChange: (p) => {
    setViewDistance(p.viewDistance);
    setSmoothness(p.smoothness);
    env.params.preview = p.preview;
    env.params.timeOfDay = p.timeOfDay;
    env.params.autoFlow = p.autoFlow;
    env.params.autoFlowSpeed = p.autoFlowSpeed;
    renderer.toneMappingExposure = p.globalLight;
    env.params.nightLight = p.nightLight;
    env.params.moonlight = p.moonlight;
    env.params.shadows = p.shadows;
    env.params.fogMode = p.fogMode;
    env.params.fogDensity = p.fogDensity;
    env.sun.castShadow = p.shadows;
    for (const s of surfaces) { s.mesh.castShadow = p.shadows; s.mesh.receiveShadow = p.shadows; }
    env.apply();

    clouds.params.enabled = p.clouds;
    clouds.params.flowSpeed = p.cloudSpeed;
    clouds.params.samples = p.cloudSamples;
    // 「云密度」滑杆 0~100（越大越密）→ 覆盖率阈值（越小越密）
    clouds.params.coverage = 0.70 - 0.45 * (p.cloudCoverage / 100);
    clouds.apply();
    cloudShadows.setCoverage(clouds.params.coverage);

    bloom.enabled = p.bloom;
    bloom.strength = p.bloomStrength;
    if (post) post.applyBloom();

    updateEnvironmentVisibility();
    scheduleAutosave();
  },
});

settingsPanelApi = initSettingsPanel({
  onChange: (settings) => applySettings(settings),
});
// 启动时套用持久化设置（FOV / 灵敏度 / 平滑 / 头部晃动 / 飞行速度）
applySettings(loadSettings());
btnSettings.addEventListener('click', () => {
  toggleFade(settingsPanel);
});

// ---- 存档系统：收集/回写世界状态 ----
function collectWorldState() {
  const pp = getPlayerPosition();
  return {
    surfaces: surfaces.map(s => ({
      name: s.name,
      type: s.type,
      expr: s.expr,
      ranges: s.ranges ? { uRange: s.ranges.uRange, vRange: s.ranges.vRange } : null,
      properties: { ...s.properties },
      visible: s.visible,
      origin: s.origin ? s.origin.slice() : [0, 0, 0],
      range: s.range && s.range.follow === false ? { follow: false, x: s.range.x, y: s.range.y, z: s.range.z } : { follow: true },
      params: (s.parsed && s.parsed.params) ? s.parsed.params.map(p => ({ name: p.name, value: p.value, min: p.min, max: p.max, inputMin: p.inputMin, inputMax: p.inputMax, step: p.step, label: p.label, locked: !!p.locked })) : [],
    })),
    selectedIndex: surfaces.findIndex(s => s.id === selectedId),
    env: envPanelApi.collect(),
    mode: getMode(),
    camera: getYawPitch(),
    flyPos: [flyPos.x, flyPos.y, flyPos.z],
    playerPos: [pp.x, pp.y, pp.z],
    markers: levelMarkers.map(m => ({ kind: m.kind, symbol: m.symbol || null, pos: m.pos })),
  };
}

function autosaveNow() {
  if (loadingSave || levelActive) return;
  const id = savesApi.getActiveId();
  if (!id) return;
  savesApi.writeSave(id, collectWorldState());
  if (savePanelApi) savePanelApi.setSaved();
}

// 内容改动防抖自动保存；无存档或读档/关卡期间不保存
function scheduleAutosave(delay = 400) {
  if (loadingSave || levelActive || !savesApi.getActiveId()) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosaveNow, delay);
}

function clearAllSurfaces() {
  for (const s of surfaces) {
    scene.remove(s.mesh);
    s.geometry.dispose();
    s.material.dispose();
  }
  surfaces = [];
  selectedId = null;
  idCounter = 0;
}

// 从存档数据重建整个世界（图像 + 材质 + 实时变量 + 选中项）
async function loadWorldState(data) {
  clearAllSurfaces();
  const saved = Array.isArray(data.surfaces) ? data.surfaces : [];
  for (const ss of saved) {
    try {
      const parsed = parseFunction(ss.type, ss.expr);
      // 先恢复参数值/锁定，再据此构建几何（否则读档后图像仍是默认参数形状）
      for (const pv of (ss.params || [])) {
        const p = parsed.params.find(x => x.name === pv.name);
        if (p) {
          if (typeof pv.value === 'number') p.value = pv.value;
          if (typeof pv.min === 'number') p.min = pv.min;
          if (typeof pv.max === 'number') p.max = pv.max;
          if (typeof pv.inputMin === 'number') p.inputMin = pv.inputMin;
          if (typeof pv.inputMax === 'number') p.inputMax = pv.inputMax;
          if (typeof pv.step === 'number') p.step = pv.step;
          if (pv.label) p.label = pv.label;
          if (typeof pv.locked === 'boolean') p.locked = pv.locked;
          parsed.scope[pv.name] = p.value;
        }
      }
      const origin = normalizeOrigin(ss.origin);
      const range = normalizeRange(ss.range);
      const extents = extentsFromRange(range);
      const geo = await buildGeometryAsync(ss.type, ss.expr, parsed, ss.ranges, origin, extents);
      if (!geo.getAttribute('position') || geo.getAttribute('position').count === 0) {
        geo.dispose();
        continue;
      }
      addSurface({ type: ss.type, expr: ss.expr, ranges: ss.ranges, geo, parsed, origin, range });
      const s = surfaces[surfaces.length - 1];
      if (ss.name) s.name = ss.name;
      s.visible = ss.visible !== false;
      s.mesh.visible = s.visible;
      if (ss.properties) {
        Object.assign(s.properties, ss.properties);
        applyPropsToMaterial(s.material, s.properties);
      }
    } catch (err) {
      console.warn('[存档] 跳过无法重建的图像：', ss.expr, err);
    }
  }
  rebuildColliders();
  // 恢复关卡道具（出生点/存档点/常数/终点标记物）
  clearMarkers();
  const savedMarkers = Array.isArray(data.markers) ? data.markers : [];
  for (const m of savedMarkers) restoreMarker(m);
  if (levelPropsPanelApi) levelPropsPanelApi.render(levelMarkers);
  // 取消 applyValues 触发的「视距改变」待重建（图像已按正确参数重建），避免重复生成
  clearTimeout(viewDistanceTimer);
  hideStatus();

  let idx = data.selectedIndex ?? 0;
  if (idx < 0 || idx >= surfaces.length) idx = surfaces.length - 1;
  if (surfaces.length) {
    selectSurface(surfaces[idx].id);
  } else {
    selectedId = null;
    materialPanelApi.setTitle(null);
    if (livePanelApi) livePanelApi.renderParams(null);
    editorApi.renderList(surfaces, null);
  }
}

// 恢复位置/视角/模式
async function restoreMode(data) {
  if (data.camera && typeof data.camera.yaw === 'number') {
    setYawPitch(data.camera.yaw, data.camera.pitch);
  }
  const fp = Array.isArray(data.flyPos) ? data.flyPos : [0, 10, 0];
  flyPos.set(fp[0] ?? 0, fp[1] ?? 10, fp[2] ?? 0);

  const target = data.mode === MODE.EXPLORE ? MODE.EXPLORE : MODE.EDIT;
  if (target === MODE.EXPLORE) {
    await initPhysics();
    const pp = Array.isArray(data.playerPos) ? data.playerPos : [0, 8, 0];
    spawnPlayer(pp[0] ?? 0, Math.max(pp[1] ?? 8, 1), pp[2] ?? 0);
    rebuildColliders();
    if (getMode() !== MODE.EXPLORE) setMode(MODE.EXPLORE);
  } else {
    if (getMode() !== MODE.EDIT) setMode(MODE.EDIT);
    camera.position.copy(flyPos);
    applyRotation(camera);
  }
}

// 重置为默认世界：默认曲面 + 默认视角/位置/编辑模式（保留当前环境设置）
async function resetToDefaultWorld() {
  clearAllSurfaces();
  clearMarkers();
  await generate(TYPES.EXPLICIT, 'z = sin(x) + cos(y)', null);
  await restoreMode({ mode: MODE.EDIT, camera: { yaw: 0, pitch: -0.5 }, flyPos: [0, 12, 24] });
}

// ---- 存档面板 ----
function refreshSavePanel() {
  if (savePanelApi) savePanelApi.render(savesApi.listSaves(), savesApi.getActiveId());
}

savePanelApi = initSavePanel({
  async onNew() {
    autosaveNow(); // 先保存当前世界到当前存档
    const { id } = savesApi.createSave('存档 ' + (savesApi.listSaves().length + 1));
    savesApi.setActiveId(id);
    await resetToDefaultWorld(); // 新存档进入默认世界（默认曲面 + 保留当前环境）
    savesApi.writeSave(id, collectWorldState());
    refreshSavePanel();
    savePanelApi.setSaved();
  },
  async onSwitch(id) {
    if (id === savesApi.getActiveId()) return;
    autosaveNow(); // 离开前保存当前存档
    savesApi.setActiveId(id);
    const data = savesApi.readSave(id);
    if (data) {
      loadingSave = true;
      try {
        if (data.env) envPanelApi.applyValues(data.env);
        await loadWorldState(data);
        await restoreMode(data);
      } finally {
        loadingSave = false;
      }
    }
    refreshSavePanel();
    savePanelApi.setSaved();
  },
  onRename(id, name) {
    savesApi.renameSave(id, name);
    refreshSavePanel();
  },
  onDelete(id) {
    savesApi.deleteSave(id);
    refreshSavePanel();
  },
  async onExport() {
    try {
      const res = await exportBackup();
      savePanelApi.setStatus(res && res.canceled ? '已取消导出' : '已导出备份');
    } catch (err) {
      savePanelApi.setStatus('导出失败：' + (err && err.message ? err.message : err));
    }
  },
  async onImport() {
    try {
      const res = await importBackup();
      if (res && res.canceled) { savePanelApi.setStatus('已取消导入'); return; }
      refreshSavePanel();
      savePanelApi.setStatus(res && res.count ? `已导入 ${res.count} 个存档` : '导入完成');
    } catch (err) {
      savePanelApi.setStatus('导入失败：' + (err && err.message ? err.message : err));
    }
  },
});

// ---- 关卡模式 ----
const LEVELS_COMPLETE_KEY = 'function-hills-levels-complete';
function completedLevels() {
  try {
    const v = JSON.parse(localStorage.getItem(LEVELS_COMPLETE_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function markLevelComplete(id) {
  const s = new Set(completedLevels());
  if (s.has(id)) return;
  s.add(id);
  try { localStorage.setItem(LEVELS_COMPLETE_KEY, JSON.stringify([...s])); } catch {}
}

// ---- 竞速最快纪录 ----
const LEVEL_TIMES_KEY = 'function-hills-level-times';
function levelTimes() {
  try {
    const v = JSON.parse(localStorage.getItem(LEVEL_TIMES_KEY) || '{}');
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch { return {}; }
}
function bestTimeFor(id) {
  const v = levelTimes()[id];
  return (typeof v === 'number' && v >= 0) ? v : null;
}
// 写入最快纪录：首次或更快时更新并返回 improved:true；更慢/持平不改写
function writeBestTime(id, seconds) {
  const times = levelTimes();
  const prev = times[id];
  if (typeof prev === 'number' && prev <= seconds) return { improved: false, best: prev };
  times[id] = seconds;
  try { localStorage.setItem(LEVEL_TIMES_KEY, JSON.stringify(times)); } catch {}
  return { improved: true, best: seconds };
}
// 秒 → mm:ss.t
function formatTime(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return m + ':' + sec.toFixed(1).padStart(4, '0');
}

// 把关卡数据里的参数覆盖写进曲面的解析结果（初值/范围/中文标签），并同步到求值作用域
function applyLevelParams(s, overrides) {
  if (!s.parsed || !overrides) return;
  for (const p of s.parsed.params) {
    const o = overrides[p.name];
    if (!o) continue;
    if (typeof o.value === 'number') { p.value = o.value; s.parsed.scope[p.name] = o.value; }
    if (typeof o.min === 'number') p.min = o.min;
    if (typeof o.max === 'number') p.max = o.max;
    if (typeof o.inputMin === 'number') p.inputMin = o.inputMin;
    if (typeof o.inputMax === 'number') p.inputMax = o.inputMax;
    if (o.step) p.step = o.step;
    if (o.label) p.label = o.label;
    if (typeof o.locked === 'boolean') p.locked = o.locked;
  }
}

// 关卡内「可调函数」列表：列出 adjustable 曲面，点击选中并在「实时调节」里出滑杆
function renderLevelFnsPanel() {
  levelFnsList.innerHTML = '';
  const adj = surfaces.filter(s => s.adjustable);
  for (const s of adj) {
    const li = document.createElement('li');
    li.className = 'level-fn-item' + (s.id === selectedId ? ' selected' : '');
    const name = document.createElement('div');
    name.className = 'lfn-name';
    name.textContent = s.name;
    const hint = document.createElement('div');
    hint.className = 'lfn-hint';
    hint.textContent = s.hint || '';
    li.append(name, hint);
    li.addEventListener('click', () => { selectSurface(s.id); renderLevelFnsPanel(); });
    levelFnsList.appendChild(li);
  }
}

// 从当前自由世界（函数 + 关卡道具）组装一个自制关卡对象
function buildCustomLevelFromWorld() {
  const spawn = levelMarkers.find(m => m.kind === 'spawn');
  const end = levelMarkers.find(m => m.kind === 'end');
  if (!spawn) return { error: '还没有「出生点」——飞到起点后点「放置出生点」再上传。' };
  if (!end) return { error: '还没有「终点光柱」——飞到终点后点「放置终点光柱」再上传。' };

  const treasures = levelMarkers
    .filter(m => m.kind === 'treasure')
    .map(m => {
      const c = collection.CONSTANTS.find(x => x.symbol === m.symbol) || { symbol: m.symbol, label: m.symbol, desc: '' };
      return { symbol: c.symbol, label: c.label, desc: c.desc, pos: m.pos.slice() };
    });
  const checkpoints = levelMarkers.filter(m => m.kind === 'checkpoint').map(m => m.pos.slice());

  // 序列化函数曲面：含参数的全量定义（含锁定标记）+ 摩擦 + adjustable 标记
  const lsurfaces = surfaces.map(s => {
    const params = {};
    const plist = (s.parsed && s.parsed.params) || [];
    for (const p of plist) {
      params[p.name] = { value: p.value, min: p.min, max: p.max, inputMin: p.inputMin, inputMax: p.inputMax, step: p.step, label: p.label, locked: !!p.locked };
    }
    const hasUnlocked = plist.some(p => !p.locked);
    return {
      type: s.type,
      expr: s.expr,
      name: s.name,
      friction: (s.properties && typeof s.properties.friction === 'number') ? s.properties.friction : (typeof s.friction === 'number' ? s.friction : 1),
      ranges: s.ranges ? { uRange: s.ranges.uRange, vRange: s.ranges.vRange } : null,
      properties: { ...s.properties },
      origin: s.origin ? s.origin.slice() : [0, 0, 0],
      range: s.range && s.range.follow === false ? { follow: false, x: s.range.x, y: s.range.y, z: s.range.z } : { follow: true },
      adjustable: hasUnlocked,
      hint: hasUnlocked ? '选中该函数，在「参数调节」里拖动参数改变图像。' : '',
      params,
    };
  });

  const n = customLevels.listCustomLevels().length + 1;
  return {
    level: {
      id: 'custom-' + Date.now(),
      name: '自制关卡 ' + n,
      desc: '自由世界亲手设计：收集 ' + treasures.length + ' 个常数，前往终点光柱。',
      start: spawn.pos.slice(),
      fallY: -viewDistance * 3,
      surfaces: lsurfaces,
      props: [],
      treasures,
      checkpoints,
      end: end.pos.slice(),
    },
  };
}

function renderPlayPanel() {
  const custom = customLevels.listCustomLevels();
  const all = [...LEVELS, ...custom];
  // 保持当前选中（若仍存在），否则回落到首个内置关
  if (selectedLevel && !all.some(l => l.id === selectedLevel.id)) selectedLevel = null;
  if (!selectedLevel) selectedLevel = LEVELS[0] || custom[0] || null;

  playLevelList.innerHTML = '';
  const addItem = (lv, isCustom) => {
    const li = document.createElement('li');
    li.className = 'level-item' + (selectedLevel && lv.id === selectedLevel.id ? ' selected' : '');
    const name = document.createElement('div');
    name.className = 'level-name';
    name.textContent = lv.name + (completedLevels().includes(lv.id) ? ' ✓' : '');
    li.appendChild(name);
    if (isCustom) {
      const del = document.createElement('button');
      del.className = 'save-del';
      del.textContent = '×';
      del.title = '删除该自制关卡';
      armConfirm(del, '确认删除?', () => {
        customLevels.deleteCustomLevel(lv.id);
        if (selectedLevel && selectedLevel.id === lv.id) selectedLevel = null;
        renderPlayPanel();
      });
      li.appendChild(del);
    }
    li.addEventListener('click', () => { selectedLevel = lv; renderPlayPanel(); });
    playLevelList.appendChild(li);
  };

  for (const lv of LEVELS) addItem(lv, false);
  if (custom.length) {
    const hdr = document.createElement('li');
    hdr.className = 'play-level-section';
    hdr.textContent = '我的关卡';
    playLevelList.appendChild(hdr);
    for (const lv of custom) addItem(lv, true);
  }

  if (selectedLevel) {
    playLevelName.textContent = selectedLevel.name;
    playLevelDesc.textContent = selectedLevel.desc || '';
    const best = bestTimeFor(selectedLevel.id);
    let status = levelActive ? '进行中…' : (completedLevels().includes(selectedLevel.id) ? '已完成 ✓' : '未开始');
    if (best !== null) status += ' · 最快 ' + best.toFixed(1) + ' 秒';
    playLevelStatus.textContent = status;
  } else {
    playLevelName.textContent = '';
    playLevelDesc.textContent = '';
    playLevelStatus.textContent = '未开始';
  }
  playStartBtn.classList.toggle('hidden', levelActive);
  playExitBtn.classList.toggle('hidden', !levelActive);
  playStartBtn.disabled = !selectedLevel;
}

async function enterLevel(level) {
  if (!level || levelActive) return;
  autosaveNow();                     // 先持久化自由世界到当前存档
  freeWorld = collectWorldState();   // 内存快照，退出时恢复
  activeLevel = level;
  levelActive = true;

  clearAllSurfaces();
  clearMarkers();                    // 隐藏编辑模式的关卡道具（数据已存进 freeWorld，退出时恢复）
  for (const s of level.surfaces) {
    try { await generate(s.type, s.expr, s.ranges || null, s.origin, s.range, null, s.params); }
    catch (e) { console.warn('[关卡] 生成失败：', s.expr, e); }
  }
  // 覆写每张曲面的名称/材质/摩擦/可调参数，并用关卡初值重建几何
  for (let i = 0; i < level.surfaces.length; i++) {
    const ls = level.surfaces[i];
    const s = surfaces[i];
    if (!s) continue;
    if (ls.name) s.name = ls.name;
    if (ls.properties) {
      Object.assign(s.properties, ls.properties);
      applyPropsToMaterial(s.material, s.properties);
    }
    if (typeof ls.friction === 'number') s.properties.friction = ls.friction;
    // 应用所有参数初值（含锁定参数）+ 锁定标记，再用初值重建几何；
    // 只有存在「未锁定」参数的曲面才在关卡内可调（锁定参数玩家不可见、不可改）
    if (ls.params && Object.keys(ls.params).length) {
      applyLevelParams(s, ls.params);
      const unlocked = (s.parsed.params || []).some(p => !p.locked);
      s.adjustable = unlocked;
      s.hint = unlocked ? (ls.hint || '') : '';
      // 几何已在上面 generate 时用关卡初值构建，此处仅覆写参数定义/标签，不再二次重建（D2）
    } else {
      s.adjustable = false;
    }
  }
  await initPhysics();
  props.buildProps(scene, level.props || []);
  rebuildColliders();
  spawnPlayer(level.start[0], level.start[1], level.start[2]);
  setMode(MODE.LEVEL);

  // 刷新实时调节滑杆（参数范围/中文标签已在上面覆写），并渲染可调函数列表
  const sel = getSurface(selectedId);
  if (sel && livePanelApi) livePanelApi.renderParams(sel);
  renderLevelFnsPanel();

  playSession.start(scene, level, {
    onCollect: (symbol, label) => {
      collection.collect(symbol);
      showStatus('收集到 ' + symbol + '：' + label);
      unlockAchievement('collector-first');
      if (['π', 'e', 'φ', '√2'].every(s => collection.isCollected(s))) unlockAchievement('collector-four');
    },
    onCheckpoint: () => {
      showStatus('已激活存档点，坠落将回到此处');
    },
    onProgress: (count, total) => {
      playHudProgress.textContent = '已收集 ' + count + ' / ' + total;
    },
    onAllCollected: () => {
      showStatus('终点已开启，前往光柱！');
      playHudGoal.textContent = '全部集齐！前往终点光柱';
    },
    onWin: (stats) => {
      markLevelComplete(level.id);
      const hadPrev = bestTimeFor(level.id) !== null;
      const rec = writeBestTime(level.id, stats.time);
      unlockAchievement('level-first');
      if (rec.improved && hadPrev) unlockAchievement('record-breaker');
      if (LEVELS.every(l => completedLevels().includes(l.id))) unlockAchievement('level-all');
      winTitle.textContent = '过关！' + level.name;
      winStats.textContent = '用时 ' + stats.time.toFixed(1) + ' 秒 · 收集 ' + stats.count + ' / ' + stats.total + (rec.improved ? ' · 🎉 新纪录！' : '');
      winOverlay.classList.remove('hidden');
      renderPlayPanel();
    },
  });

  playHudProgress.textContent = '已收集 0 / ' + level.treasures.length;
  playHudGoal.textContent = level.treasures.length ? '集齐所有数学常数，前往终点光柱' : '前往终点光柱';
  playHud.classList.remove('hidden');
  winOverlay.classList.add('hidden');
  showFade(playPanel);
  showFade(levelFnsPanel);
  renderPlayPanel();
}

async function exitLevel() {
  if (!levelActive) return;
  playSession.clear(scene);
  props.clearProps(scene);
  playHud.classList.add('hidden');
  winOverlay.classList.add('hidden');
  hideFade(levelFnsPanel);
  levelActive = false;
  setMode(MODE.EDIT);

  if (freeWorld) {
    loadingSave = true;
    try {
      if (freeWorld.env) envPanelApi.applyValues(freeWorld.env);
      await loadWorldState(freeWorld);
      await restoreMode(freeWorld);
    } finally {
      loadingSave = false;
    }
  } else {
    await resetToDefaultWorld();
  }
  freeWorld = null;
  activeLevel = null;
  hideFade(playPanel);
  refreshSavePanel();
  renderPlayPanel();
}

btnPlay.addEventListener('click', () => {
  const show = playPanel.classList.contains('hidden');
  toggleFade(playPanel);
  if (show) renderPlayPanel();
});
// 上传为关卡：把当前自由世界（含函数与关卡道具）存成「我的关卡」
levelPropsUploadBtn.addEventListener('click', () => {
  const res = buildCustomLevelFromWorld();
  if (res.error) {
    levelPropsUploadStatus.textContent = '⚠️ ' + res.error;
    return;
  }
  customLevels.saveCustomLevel(res.level);
  levelPropsUploadStatus.textContent = '✅ 已上传为「' + res.level.name + '」，打开玩法模式即可游玩。';
  renderPlayPanel();
});
playStartBtn.addEventListener('click', () => { if (selectedLevel) enterLevel(selectedLevel); });
playExitBtn.addEventListener('click', () => { exitLevel(); });
playCodexBtn.addEventListener('click', () => {
  const show = codexPanel.classList.contains('hidden');
  toggleFade(codexPanel);
  if (show) collection.renderCodex(codexList);
});
playAchievementsBtn.addEventListener('click', () => {
  const show = achievementPanel.classList.contains('hidden');
  toggleFade(achievementPanel);
  if (show) achievements.renderAchievements(achievementList);
});
fnCodexApi = initFnCodexPanel({ onGenerate: generate });
btnFnCodex.addEventListener('click', () => {
  const show = fncodexPanel.classList.contains('hidden');
  toggleFade(fncodexPanel);
  if (show) fnCodexApi.render();
});
winRetry.addEventListener('click', async () => {
  const lv = activeLevel;
  winOverlay.classList.add('hidden');
  await exitLevel();
  enterLevel(lv);
});
winExit.addEventListener('click', () => { exitLevel(); });
collection.renderCodex(codexList);
achievements.renderAchievements(achievementList);
renderPlayPanel();

// ---- 启动：有激活存档则读档，否则用默认环境 + 默认曲面 ----
async function startup() {
  const savedEnv = envPanelApi.loadDefaults();
  let activeId = savesApi.getActiveId();
  // 无激活存档但已有存档（如删除了当前槽）→ 自动激活最近更新的槽，避免「有档却无激活」死角
  if (!activeId) {
    const list = savesApi.listSaves();
    if (list.length) {
      activeId = list.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a)).id;
      savesApi.setActiveId(activeId);
    }
  }
  const activeData = activeId ? savesApi.readSave(activeId) : null;

  if (activeData) {
    loadingSave = true;
    try {
      // 先套用存档环境（设置视距/平滑度等全局量），再用正确参数重建图像
      if (activeData.env) envPanelApi.applyValues(activeData.env);
      else if (savedEnv) envPanelApi.applyValues(savedEnv);
      await loadWorldState(activeData);
      await restoreMode(activeData);
    } finally {
      loadingSave = false;
    }
  } else {
    if (savedEnv) envPanelApi.applyValues(savedEnv);
    await generate(TYPES.EXPLICIT, 'z = sin(x) + cos(y)', null);
    // 真正首次进入（无任何存档）→ 自动创建第一个存档
    if (savesApi.listSaves().length === 0) {
      const { id } = savesApi.createSave('存档 1');
      savesApi.setActiveId(id);
      savesApi.writeSave(id, collectWorldState());
    }
  }
  // 画质档位最后套用：只调像素比与阴影贴图分辨率，不覆盖环境面板的显式开关与云采样
  applyQuality(loadSettings().quality || 'medium');
  refreshSavePanel();
}
startup();

// 关闭/刷新前落盘，避免丢失最后的改动
window.addEventListener('beforeunload', () => autosaveNow());

// ---- 主循环 ----
const clock = new THREE.Clock();
let eyeHeight = 0.7; // 探索模式镜头高度（站立 0.7 / 下蹲 0.25，均在胶囊顶 0.9 内，避免头部穿模）
let posSaveAcc = 0;  // 探索模式玩家位置自动保存节流（约每秒一次）
let maxPlayerY = 0;  // 探索/关卡模式达到的最高高度（登高成就判定）

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  env.update(dt);
  if (env.params.autoFlow) envPanelApi.syncTime(env.params.timeOfDay);
  const { forward, right } = horizontalVectors();

  if (getMode() === MODE.EDIT) {
    const speed = (sprint || keys[keymap.down]) ? flySpeed * 2.4 : flySpeed;
    const move = new THREE.Vector3();
    if (keys[keymap.forward]) move.add(forward);
    if (keys[keymap.backward]) move.sub(forward);
    if (keys[keymap.right]) move.add(right);
    if (keys[keymap.left]) move.sub(right);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);
    if (keys[keymap.jump]) move.y += speed * dt;
    if (keys[keymap.down]) move.y -= speed * dt;
    flyPos.add(move);
    camera.position.copy(flyPos);
    applyRotation(camera, dt);
  } else {
    const dir = new THREE.Vector2();
    if (keys[keymap.forward]) dir.y += 1;
    if (keys[keymap.backward]) dir.y -= 1;
    if (keys[keymap.right]) dir.x += 1;
    if (keys[keymap.left]) dir.x -= 1;
    if (dir.lengthSq() > 0) dir.normalize();
    const moveX = dir.x * right.x + dir.y * forward.x;
    const moveZ = dir.x * right.z + dir.y * forward.z;

    const crouch = keys[keymap.down];
    const speed = sprint ? 8.5 : (crouch ? 2.5 : 5.5);
    const jump = jumpQueued; jumpQueued = false;

    movePlayer(dt, moveX, moveZ, speed, jump);
    stepWorld(dt);

    const pos = getPlayerPosition();
    // 登高成就：记录探索/关卡模式达到的最高高度
    if (pos.y > maxPlayerY) {
      maxPlayerY = pos.y;
      if (maxPlayerY >= 20) unlockAchievement('climber');
    }
    const targetEye = crouch ? 0.25 : 0.7;
    eyeHeight = THREE.MathUtils.lerp(eyeHeight, targetEye, 1 - Math.exp(-dt * 12));
    // 第一人称走路晃动：贴地且有水平速度时上下轻晃 + 轻微侧摇，停下后渐出
    const moving = isGrounded() && getHorizontalSpeed() > 0.5;
    bobAmount = THREE.MathUtils.lerp(bobAmount, moving ? 1 : 0, 1 - Math.exp(-dt * 8));
    if (moving) bobPhase += dt * getHorizontalSpeed() * 1.6;
    let bobY = 0, sway = 0;
    if (bobStrength > 0) { // 头部晃动强度（0=完全关闭）
      const bs = bobStrength / 100;
      bobY = Math.sin(bobPhase) * 0.05 * bobAmount * bs;
      sway = Math.cos(bobPhase * 0.5) * 0.02 * bobAmount * bs;
    }
    camera.position.set(pos.x + right.x * sway, pos.y + eyeHeight + bobY, pos.z + right.z * sway);
    applyRotation(camera, dt);

    // 坠落判定：低于关卡 fallY（或默认 3 倍视距，与隐式曲面竖直范围 Vz=3×视距对齐）则回最近检查点
    const fallY = (activeLevel && typeof activeLevel.fallY === 'number') ? activeLevel.fallY : -viewDistance * 3;
    if (pos.y < fallY) {
      const rp = playSession.respawnPos();
      resetPlayer(rp[0], rp[1], rp[2]);
    }

    // 关卡模式：驱动宝物/终点检测与过关判定
    if (getMode() === MODE.LEVEL) {
      playSession.update(dt, pos);
      playHudTime.textContent = formatTime(playSession.getElapsed());
    }

    // 探索模式下玩家位置约每秒自动保存一次（位置/视角回写）；关卡模式不落盘
    if (!levelActive) {
      posSaveAcc += dt;
      if (posSaveAcc >= 1) { posSaveAcc = 0; scheduleAutosave(0); }
    }
  }

  const envOn = getMode() === MODE.EXPLORE || getMode() === MODE.LEVEL || env.params.preview;
  clouds.update(dt, camera.position, env.sunDirection, env.daylight(), env.sunColor, env.sunset());
  // 真实云影：云开启时渲染俯视透射率纹理，并让曲面材质按世界坐标采样压暗
  const cloudsOn = envOn && clouds.params.enabled;
  cloudShadowUniforms.uCloudShadowEnabled.value = cloudsOn ? 1.0 : 0.0;
  cloudShadows.render(cloudsOn, env.sunDirection, clouds.getTime());
  const volumetric = envOn && env.params.fogMode === 'volumetric';
  const needPost = volumetric || (envOn && bloom.enabled);
  if (needPost) {
    ensurePost();
    post.updateSun(env.sunDirection, env.params.fogDensity, volumetric);
    post.render();
  } else {
    renderer.render(scene, camera);
  }
}

animate();
