const KEY = 'function-hills-history';

export function loadHistory() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// 新增一条历史（去重、置顶、最多保留 30 条）。
// params：参数定义覆盖（name → {value,min,max,inputMin,inputMax,step,label,locked}），点击历史时一并恢复。
export function addHistory(type, expr, uRange, vRange, origin, range, params) {
  const h = loadHistory();
  const clean = h.filter(e => !(e.type === type && e.expr === expr));
  clean.unshift({
    type, expr,
    uRange: uRange || null, vRange: vRange || null,
    origin: Array.isArray(origin) ? origin : null,
    range: (range && range.follow === false) ? range : null,
    params: (params && typeof params === 'object') ? params : null,
    time: Date.now(),
  });
  const capped = clean.slice(0, 30);
  try { localStorage.setItem(KEY, JSON.stringify(capped)); } catch {}
  return capped;
}

// 删除单条历史（按下标）
export function removeHistory(index) {
  const h = loadHistory();
  h.splice(index, 1);
  try { localStorage.setItem(KEY, JSON.stringify(h)); } catch {}
  return h;
}

// 清空全部历史
export function clearHistory() {
  try { localStorage.setItem(KEY, '[]'); } catch {}
  return [];
}
