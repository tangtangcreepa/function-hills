// 实时调节面板：显示当前选中图像的表达式、原点平移滑杆与字母调节变量。
// 拖动时只做轻量防抖（~80ms），实际几何重建由 main.js 里的回调负责。
// 每个变量可「锁定」：锁定后取值冻结不可改（除非手动解锁），关卡模式下锁定变量不显示。
// 滑杆行统一由 sliderRow.js 提供（Shift 精调 + 步进按钮 + 数字输入联动）。
import { MODE, getMode } from '../mode.js';
import { makeSliderRow } from './sliderRow.js';

const ORIGIN_MIN = -10, ORIGIN_MAX = 10, ORIGIN_STEP = 0.1;
const ORIGIN_INPUT_MIN = -500, ORIGIN_INPUT_MAX = 500;
const ORIGIN_AXES = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y(竖直)' },
  { key: 'z', label: 'Z' },
];

export function initLivePanel({ onChange, onLock, onOriginChange }) {
  const container = document.getElementById('live-params');
  const empty = document.getElementById('live-empty');

  // 原点平移滑杆的一行（X/Y/Z）
  function makeOriginRow(origin, i) {
    const axis = ORIGIN_AXES[i];
    return makeSliderRow({
      label: axis.label,
      labelTitle: `原点 ${axis.label} 方向平移`,
      value: Number(origin[i]) || 0,
      min: ORIGIN_MIN, max: ORIGIN_MAX,
      inputMin: ORIGIN_INPUT_MIN, inputMax: ORIGIN_INPUT_MAX,
      step: ORIGIN_STEP,
      onChange: (v) => onOriginChange(axis.key, v),
    });
  }

  // 传入当前选中的曲面对象（含 parsed / origin / expr），没有则显示提示
  function renderParams(surface) {
    container.innerHTML = '';
    if (!surface) {
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    const inLevel = getMode() === MODE.LEVEL;

    // 顶部：当前函数表达式（只读）
    if (typeof surface.expr === 'string') {
      const expr = document.createElement('div');
      expr.className = 'live-expr';
      expr.textContent = surface.expr;
      expr.title = surface.name ? `${surface.name} · ${surface.expr}` : surface.expr;
      container.appendChild(expr);
    }

    // 原点平移滑杆（关卡模式下隐藏：玩家不应移动关卡几何）
    if (!inLevel && Array.isArray(surface.origin) && surface.origin.length === 3) {
      const group = document.createElement('div');
      group.className = 'live-origin';
      const title = document.createElement('div');
      title.className = 'live-origin-title';
      title.textContent = '原点偏移';
      group.appendChild(title);
      for (let i = 0; i < ORIGIN_AXES.length; i++) {
        group.appendChild(makeOriginRow(surface.origin, i));
      }
      container.appendChild(group);
    }

    // 字母调节变量（关卡模式下隐藏已锁定的）
    const all = (surface.parsed && surface.parsed.params) || [];
    const params = inLevel ? all.filter(p => !p.locked) : all;
    for (const p of params) {
      const displayName = p.label || p.name;
      const inputMin = p.inputMin ?? p.min;
      const inputMax = p.inputMax ?? p.max;
      const row = makeSliderRow({
        label: displayName,
        labelTitle: `变量 ${p.name}（滑杆 ${p.min} ~ ${p.max} · 输入 ${inputMin} ~ ${inputMax}）`,
        value: p.value,
        min: p.min, max: p.max,
        inputMin, inputMax,
        step: p.step,
        onChange: (v) => onChange(p.name, v),
        lockable: !inLevel, // 关卡模式下锁定变量已被过滤，不再显示锁定按钮
        locked: p.locked,
        onLock: (next) => onLock(p.name, next),
        rowClass: p.locked ? 'locked' : '',
      });
      container.appendChild(row);
    }
  }

  return { renderParams };
}
