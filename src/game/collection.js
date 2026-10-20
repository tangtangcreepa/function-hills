// 常数图鉴：记录并展示已收集的数学常数（π/e/φ/√2/i…），localStorage 持久化。
const KEY = 'function-hills-collection';

export const CONSTANTS = [
  { symbol: 'π', label: '圆周率', desc: '圆周长与直径之比 ≈ 3.14159' },
  { symbol: 'e', label: '自然常数', desc: '指数增长的底 ≈ 2.71828' },
  { symbol: 'φ', label: '黄金比例', desc: '(1+√5)/2 ≈ 1.61803' },
  { symbol: '√2', label: '根号二', desc: '边长为 1 的正方形对角线 ≈ 1.41421' },
  { symbol: 'i', label: '虚数单位', desc: 'i² = −1 的平方根' },
];

export function getCollected() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function isCollected(symbol) {
  return getCollected().includes(symbol);
}

export function collect(symbol) {
  const set = new Set(getCollected());
  if (set.has(symbol)) return false;
  set.add(symbol);
  try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch {}
  return true;
}

// 渲染图鉴面板；已收集高亮 + 释义，未收集置灰
export function renderCodex(containerEl) {
  const collected = new Set(getCollected());
  containerEl.innerHTML = '';
  for (const c of CONSTANTS) {
    const row = document.createElement('div');
    row.className = 'codex-item' + (collected.has(c.symbol) ? ' collected' : '');
    const sym = document.createElement('div');
    sym.className = 'codex-symbol';
    sym.textContent = c.symbol;
    const info = document.createElement('div');
    info.className = 'codex-info';
    const name = document.createElement('div');
    name.className = 'codex-name';
    name.textContent = c.label + (collected.has(c.symbol) ? '' : '（未收集）');
    const desc = document.createElement('div');
    desc.className = 'codex-desc';
    desc.textContent = c.desc;
    info.append(name, desc);
    row.append(sym, info);
    containerEl.appendChild(row);
  }
}
