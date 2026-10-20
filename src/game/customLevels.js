// 自制关卡存储：「我的关卡」列表，localStorage 持久化，可反复游玩/删除、重启仍在。
// 关卡对象与内置 LEVELS 元素同构（id/name/desc/start/fallY/surfaces/props/treasures/checkpoints/end）。
const KEY = 'function-hills-custom-levels';

export function listCustomLevels() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// 按 id 去重保存（不存在则追加，存在则覆盖）
export function saveCustomLevel(level) {
  const list = listCustomLevels();
  const i = list.findIndex(l => l.id === level.id);
  if (i >= 0) list[i] = level;
  else list.push(level);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
  return level;
}

export function deleteCustomLevel(id) {
  const list = listCustomLevels().filter(l => l.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}
