// UI 显隐过渡（克制）：入场靠 style.css 的 @keyframes 在 display 切换时自动播放，
// 退场则先加 .fade-out 淡出，transitionend 后再加 .hidden 收尾（display:none）。
// 与「面板/HUD/toast」的灵动化配套，避免纯 display:none 的硬切。

const HIDE_MS = 200; // 与 style.css 中 .panel 的过渡时长保持一致

// 显示元素：移除 .hidden（触发 CSS 入场动画）并清除退场残留
export function showFade(el) {
  if (!el) return;
  el.classList.remove('hidden', 'fade-out');
}

// 隐藏元素：先淡出，transitionend 后再 display:none 收尾（带兜底定时器）
export function hideFade(el) {
  if (!el || el.classList.contains('hidden') || el.classList.contains('fade-out')) return;
  el.classList.add('fade-out');
  const done = (e) => {
    if (e.target !== el || e.propertyName !== 'opacity') return;
    el.removeEventListener('transitionend', done);
    el.classList.add('hidden');
    el.classList.remove('fade-out');
  };
  el.addEventListener('transitionend', done);
  // 兜底：无过渡（reduced-motion）或提前被隐藏时，保证最终仍隐藏
  setTimeout(() => {
    el.removeEventListener('transitionend', done);
    if (!el.classList.contains('hidden') && el.classList.contains('fade-out')) {
      el.classList.add('hidden');
      el.classList.remove('fade-out');
    }
  }, HIDE_MS + 60);
}

// 切换：处于隐藏/退场中则显示，否则隐藏
export function toggleFade(el) {
  if (!el) return;
  if (el.classList.contains('hidden') || el.classList.contains('fade-out')) showFade(el);
  else hideFade(el);
}

// 重放某元素的 CSS 入场动画（用于 toast 连续显示时重新触发）
export function replayIn(el) {
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetWidth; // 强制重排，让下一次赋值重新触发动画
  el.style.animation = '';
}
