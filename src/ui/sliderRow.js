// 通用「滑杆 + 步进按钮 + 数字输入」行组件：范围夹取 + Shift 精调。
// livePanel 的「原点偏移」与「字母调节变量」两处共用，保证交互一致。
//
// - 滑杆拖动：普通按 step 步进；按住 Shift 时步进缩小为 step/10（10× 更精细）。
// - -/+ 步进按钮：普通 ±1 步；按住 Shift 时 ±10 步（快速粗调）。
// - 数字输入：范围取 inputMin~inputMax；滑杆范围取 min~max（超出时滑杆顶格显示）。
//
// 布局为两行式，滑杆独占下行整行（不被按钮挤压、可拖拽），步进/数字/锁定集中在上行右侧：
//   上行  「名称 ……… [−][+][数字输入][锁定]」
//   下行  「================滑杆================」

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// 数字框显示：最多 6 位小数并去尾零，避免 0.30000000000000004 之类长小数
function fmt(v) { return String(Math.round(v * 1e6) / 1e6); }

// Shift 精调：模块级监听一次，动态切换所有本组件滑杆的 step（拖动时生效）
let shiftInit = false;
function initShiftTracking() {
  if (shiftInit) return;
  shiftInit = true;
  const apply = (on) => {
    document.querySelectorAll('input.live-param-range').forEach((r) => {
      r.step = on ? (r.dataset.fineStep || r.dataset.step) : r.dataset.step;
    });
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Shift') apply(true); });
  document.addEventListener('keyup', (e) => { if (e.key === 'Shift') apply(false); });
}

export function makeSliderRow({
  label, labelTitle,
  value = 0, min = -32, max = 32, inputMin = -256, inputMax = 256, step = 0.1,
  onChange,                    // (value) => void（组件内部已做防抖）
  debounce = 80,
  lockable = false, locked = false, onLock,
  stepButtons = true,
  rowClass = '',
}) {
  initShiftTracking();

  const row = document.createElement('div');
  row.className = 'live-param' + (locked ? ' locked' : '') + (rowClass ? ' ' + rowClass : '');

  const labelEl = document.createElement('span');
  labelEl.className = 'live-param-name';
  labelEl.textContent = label;
  if (labelTitle) labelEl.title = labelTitle;

  const btnMinus = document.createElement('button');
  btnMinus.className = 'live-param-step';
  btnMinus.type = 'button';
  btnMinus.textContent = '−';
  btnMinus.title = '减小（按住 Shift 放大步进）';

  const btnPlus = document.createElement('button');
  btnPlus.className = 'live-param-step';
  btnPlus.type = 'button';
  btnPlus.textContent = '+';
  btnPlus.title = '增大（按住 Shift 放大步进）';

  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'live-param-range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.dataset.step = String(step);
  range.dataset.fineStep = String(step / 10);
  range.title = labelTitle || `拖动调整 ${label}`;

  const num = document.createElement('input');
  num.type = 'number';
  num.min = String(inputMin);
  num.max = String(inputMax);
  num.step = String(step);
  num.title = `输入调整 ${label}`;

  // 上行：名称居左，[−][+][数字][锁定] 居右
  const top = document.createElement('div');
  top.className = 'live-param-top';
  const right = document.createElement('span');
  right.className = 'live-param-right';
  if (stepButtons) right.append(btnMinus, btnPlus);
  right.append(num);

  let lock = null;
  if (lockable) {
    lock = document.createElement('button');
    lock.className = 'live-param-lock';
    lock.type = 'button';
    lock.title = locked ? '已锁定：点击解锁' : '点击锁定该值（锁定后不可再改动）';
    lock.textContent = locked ? '🔒' : '🔓';
    right.append(lock);
  }
  top.append(labelEl, right);

  // 下行：滑杆独占整行
  const slider = document.createElement('div');
  slider.className = 'live-param-slider';
  slider.append(range);

  row.append(top, slider);

  let timer = null;
  // 统一写回：num 格式化显示当前值，range 夹在自身范围（超出顶格），防抖后回调
  function apply(v) {
    range.value = String(clamp(v, min, max));
    num.value = fmt(v);
    clearTimeout(timer);
    timer = setTimeout(() => onChange(v), debounce);
  }

  // 初始值：真实值保留（可超出滑杆范围），数字框格式化显示
  let current = Number(value);
  if (!Number.isFinite(current)) current = 0;
  range.value = String(clamp(current, min, max));
  num.value = fmt(current);

  range.addEventListener('input', () => {
    current = clamp(Number(range.value), min, max);
    apply(current);
  });
  num.addEventListener('input', () => {
    const v = Number(num.value);
    if (Number.isFinite(v)) { current = clamp(v, inputMin, inputMax); apply(current); }
  });

  function nudge(e, dir) {
    e.preventDefault();
    const base = step;
    const delta = (e.shiftKey ? base * 10 : base) * dir;
    current = clamp(current + delta, inputMin, inputMax);
    apply(current);
  }
  btnMinus.addEventListener('click', (e) => nudge(e, -1));
  btnPlus.addEventListener('click', (e) => nudge(e, 1));

  if (lockable) {
    lock.addEventListener('click', () => {
      const next = !row.classList.contains('locked');
      row.classList.toggle('locked', next);
      lock.textContent = next ? '🔒' : '🔓';
      lock.title = next ? '已锁定：点击解锁' : '点击锁定该值（锁定后不可再改动）';
      range.disabled = next;
      num.disabled = next;
      btnMinus.disabled = next;
      btnPlus.disabled = next;
      if (onLock) onLock(next);
    });
    if (locked) { range.disabled = true; num.disabled = true; btnMinus.disabled = true; btnPlus.disabled = true; }
  }

  return row;
}
