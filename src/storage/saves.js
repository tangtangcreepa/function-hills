// 存档持久化：localStorage 存槽位列表 + 每个槽位的完整世界 JSON。
// 键约定：
//   function-hills-save-index   → [{ id, name, updatedAt }]（槽位列表）
//   function-hills-save-<id>    → 单槽完整世界内容
//   function-hills-active-save  → 当前激活槽 id
const INDEX_KEY = 'function-hills-save-index';
const ACTIVE_KEY = 'function-hills-active-save';
const PREFIX = 'function-hills-save-';

function safeParse(raw) {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function listSaves() {
  return safeParse(localStorage.getItem(INDEX_KEY)) || [];
}

function writeIndex(list) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(list)); } catch {}
}

// 生成槽位唯一 id（时间戳 + 随机），不与已有槽冲突
export function genId() {
  let id;
  do {
    id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  } while (listSaves().some(e => e.id === id));
  return id;
}

export function createSave(name) {
  const id = genId();
  const nm = name || '新存档';
  const list = listSaves();
  list.push({ id, name: nm, updatedAt: Date.now() });
  writeIndex(list);
  return { id, name: nm };
}

export function renameSave(id, name) {
  const list = listSaves();
  const e = list.find(x => x.id === id);
  if (!e) return;
  e.name = name || e.name;
  e.updatedAt = Date.now();
  writeIndex(list);
}

export function deleteSave(id) {
  writeIndex(listSaves().filter(x => x.id !== id));
  try { localStorage.removeItem(PREFIX + id); } catch {}
  if (getActiveId() === id) setActiveId(null);
}

export function writeSave(id, data) {
  try { localStorage.setItem(PREFIX + id, JSON.stringify(data)); } catch {}
  const list = listSaves();
  const e = list.find(x => x.id === id);
  if (e) { e.updatedAt = Date.now(); writeIndex(list); }
}

export function readSave(id) {
  return safeParse(localStorage.getItem(PREFIX + id));
}

export function getActiveId() {
  try { return localStorage.getItem(ACTIVE_KEY) || null; } catch { return null; }
}

export function setActiveId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, String(id));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {}
}
