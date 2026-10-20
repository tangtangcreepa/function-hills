// 环境参数面板：预览/时刻/昼夜/光照/云/雾/光晕/月光，改动即回调
// 支持「保存为默认」：把当前设置持久化到 localStorage，下次启动自动套用
const KEY = 'function-hills-env-defaults';

export function initEnvironmentPanel({ onChange }) {
  const preview = document.getElementById('env-preview');
  const time = document.getElementById('env-time');
  const timeLabel = document.getElementById('env-time-label');
  const autoflow = document.getElementById('env-autoflow');
  const autospeed = document.getElementById('env-autospeed');
  const viewdistance = document.getElementById('env-viewdistance');
  const smoothness = document.getElementById('env-smoothness');
  const globallight = document.getElementById('env-globallight');
  const nightlight = document.getElementById('env-nightlight');
  const moonlight = document.getElementById('env-moonlight');
  const shadows = document.getElementById('env-shadows');
  const clouds = document.getElementById('env-clouds');
  const cloudspeed = document.getElementById('env-cloudspeed');
  const cloudsamples = document.getElementById('env-cloudsamples');
  const cloudcoverage = document.getElementById('env-cloudcoverage');
  const fogmode = document.getElementById('env-fogmode');
  const fog = document.getElementById('env-fog');
  const bloom = document.getElementById('env-bloom');
  const bloomstrength = document.getElementById('env-bloomstrength');
  const saveDefault = document.getElementById('env-save-default');

  function timeText(t) {
    const h = Math.floor(t);
    const m = Math.floor((t - h) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  // 汇总当前所有控件值
  function collect() {
    return {
      preview: preview.checked,
      timeOfDay: Number(time.value),
      autoFlow: autoflow.checked,
      autoFlowSpeed: Number(autospeed.value) / 50,
      viewDistance: Number(viewdistance.value),
      smoothness: Number(smoothness.value),
      globalLight: Number(globallight.value) / 100,
      nightLight: Number(nightlight.value) / 100,
      moonlight: Number(moonlight.value) / 100,
      shadows: shadows.checked,
      clouds: clouds.checked,
      cloudSpeed: Number(cloudspeed.value) / 100,
      cloudSamples: Number(cloudsamples.value),
      cloudCoverage: Number(cloudcoverage.value),
      fogMode: fogmode.value,
      fogDensity: Number(fog.value),
      bloom: bloom.checked,
      bloomStrength: Number(bloomstrength.value) / 100,
    };
  }

  function fire() { onChange(collect()); }

  // 把一组值写回各控件并触发 onChange（启动时套用默认设置用）
  function applyValues(v) {
    if (!v) return;
    preview.checked = !!v.preview;
    time.value = String(v.timeOfDay ?? 10);
    autoflow.checked = !!v.autoFlow;
    autospeed.value = String(Math.round((v.autoFlowSpeed ?? 0.6) * 50));
    viewdistance.value = String(v.viewDistance ?? 10);
    smoothness.value = String(v.smoothness ?? 5);
    globallight.value = String(Math.round((v.globalLight ?? 0.75) * 100));
    nightlight.value = String(Math.round((v.nightLight ?? 2) * 100));
    moonlight.value = String(Math.round((v.moonlight ?? 2) * 100));
    shadows.checked = !!v.shadows;
    clouds.checked = !!v.clouds;
    cloudspeed.value = String(Math.round((v.cloudSpeed ?? 0.5) * 100));
    cloudsamples.value = String(v.cloudSamples ?? 14);
    cloudcoverage.value = String(v.cloudCoverage ?? 35);
    fogmode.value = v.fogMode ?? 'none';
    fog.value = String(v.fogDensity ?? 30);
    bloom.checked = !!v.bloom;
    bloomstrength.value = String(Math.round((v.bloomStrength ?? 0.8) * 100));
    refreshTimeLabel();
    fire();
  }

  function loadDefaults() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveDefaults() {
    try {
      localStorage.setItem(KEY, JSON.stringify(collect()));
      saveDefault.textContent = '已保存 ✓';
      setTimeout(() => { saveDefault.textContent = '保存为默认'; }, 1500);
    } catch {
      saveDefault.textContent = '保存失败';
    }
  }

  function refreshTimeLabel() { timeLabel.textContent = timeText(Number(time.value)); }

  preview.addEventListener('change', fire);
  autoflow.addEventListener('change', fire);
  shadows.addEventListener('change', fire);
  clouds.addEventListener('change', fire);
  fogmode.addEventListener('change', fire);
  bloom.addEventListener('change', fire);
  [time, autospeed, viewdistance, smoothness, globallight, nightlight, moonlight, cloudspeed, cloudsamples, cloudcoverage, fog, bloomstrength].forEach(el => {
    el.addEventListener('input', () => { refreshTimeLabel(); fire(); });
  });
  saveDefault.addEventListener('click', saveDefaults);

  refreshTimeLabel();

  // 自动流转时把时刻回写到滑杆与标签
  return {
    syncTime(t) {
      time.value = String(t);
      refreshTimeLabel();
    },
    applyValues,
    loadDefaults,
    collect,
  };
}
