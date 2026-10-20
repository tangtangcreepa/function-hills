// 设置面板：鼠标灵敏度 / 视场角 / 视角平滑 / 头部晃动 / 飞行速度，改动即回调并持久化。
// main.js 在启动时用 loadSettings() 直接应用，随后面板改动通过 onChange 实时生效。
const KEYS = {
  sensitivity: 'function-hills-mouse-sensitivity',
  fov: 'function-hills-fov',
  smoothing: 'function-hills-camera-smoothing',
  headBob: 'function-hills-head-bob',
  flySpeed: 'function-hills-fly-speed',
  quality: 'function-hills-quality',
};

const DEFAULTS = { sensitivity: 1, fov: 70, smoothing: false, headBob: 100, flySpeed: 10, quality: 'medium' };
const QUALITY_OPTIONS = ['low', 'medium', 'high'];

// 读取持久化设置（带默认值与范围夹取）
export function loadSettings() {
  const num = (key, def, min, max) => {
    const v = Number(localStorage.getItem(key));
    if (!Number.isFinite(v)) return def;
    return Math.min(max, Math.max(min, v));
  };
  const bool = (key, def) => {
    const v = localStorage.getItem(key);
    if (v === null) return def;
    return v === '1' || v === 'true';
  };
  const str = (key, def, allowed) => {
    const v = localStorage.getItem(key);
    return (v && allowed.includes(v)) ? v : def;
  };
  return {
    sensitivity: num(KEYS.sensitivity, DEFAULTS.sensitivity, 0.2, 3),
    fov: num(KEYS.fov, DEFAULTS.fov, 55, 110),
    smoothing: bool(KEYS.smoothing, DEFAULTS.smoothing),
    headBob: num(KEYS.headBob, DEFAULTS.headBob, 0, 200),
    flySpeed: num(KEYS.flySpeed, DEFAULTS.flySpeed, 1, 100),
    quality: str(KEYS.quality, DEFAULTS.quality, QUALITY_OPTIONS),
  };
}

export function initSettingsPanel({ onChange }) {
  const els = {
    sensitivity: document.getElementById('set-sensitivity'),
    sensitivityLabel: document.getElementById('set-sensitivity-label'),
    fov: document.getElementById('set-fov'),
    fovLabel: document.getElementById('set-fov-label'),
    smoothing: document.getElementById('set-smoothing'),
    headBob: document.getElementById('set-headbob'),
    headBobLabel: document.getElementById('set-headbob-label'),
    flySpeed: document.getElementById('set-flyspeed'),
    flySpeedLabel: document.getElementById('set-flyspeed-label'),
    quality: document.getElementById('set-quality'),
  };

  const s = loadSettings();
  els.sensitivity.value = String(s.sensitivity);
  els.fov.value = String(s.fov);
  els.smoothing.checked = s.smoothing;
  els.headBob.value = String(s.headBob);
  els.flySpeed.value = String(s.flySpeed);
  els.quality.value = s.quality;

  function refreshLabels() {
    els.sensitivityLabel.textContent = Number(els.sensitivity.value).toFixed(2) + '×';
    els.fovLabel.textContent = els.fov.value + '°';
    els.headBobLabel.textContent = els.headBob.value + '%';
    els.flySpeedLabel.textContent = els.flySpeed.value;
  }

  function collect() {
    return {
      sensitivity: Number(els.sensitivity.value),
      fov: Number(els.fov.value),
      smoothing: els.smoothing.checked,
      headBob: Number(els.headBob.value),
      flySpeed: Number(els.flySpeed.value),
      quality: els.quality.value,
    };
  }

  function persist(c) {
    try {
      localStorage.setItem(KEYS.sensitivity, String(c.sensitivity));
      localStorage.setItem(KEYS.fov, String(c.fov));
      localStorage.setItem(KEYS.smoothing, c.smoothing ? '1' : '0');
      localStorage.setItem(KEYS.headBob, String(c.headBob));
      localStorage.setItem(KEYS.flySpeed, String(c.flySpeed));
      localStorage.setItem(KEYS.quality, c.quality);
    } catch {}
  }

  function fire() {
    refreshLabels();
    const c = collect();
    persist(c);
    onChange(c);
  }

  els.sensitivity.addEventListener('input', fire);
  els.fov.addEventListener('input', fire);
  els.smoothing.addEventListener('change', fire);
  els.headBob.addEventListener('input', fire);
  els.flySpeed.addEventListener('input', fire);
  els.quality.addEventListener('change', fire);

  refreshLabels();

  return {
    // 滚轮改飞行速度后同步回面板滑杆
    setFlySpeed(v) { els.flySpeed.value = String(v); refreshLabels(); },
  };
}
