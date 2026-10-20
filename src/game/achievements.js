// 成就系统：记录并展示玩家的里程碑，localStorage 持久化（复用 collection.js 模式）。
const KEY = 'function-hills-achievements';

export const ACHIEVEMENTS = [
  { id: 'explorer', name: '初探世界', desc: '首次进入探索模式，亲身走进函数世界', icon: '🧭' },
  { id: 'builder-first', name: '第一幅图', desc: '首次生成一个函数图像', icon: '📈' },
  { id: 'builder-five', name: '图像收藏家', desc: '同时生成 5 个函数图像', icon: '🗂️' },
  { id: 'collector-first', name: '初次寻宝', desc: '首次收集一个数学常数', icon: '💎' },
  { id: 'collector-four', name: '常数大师', desc: '集齐 π/e/φ/√2 四个经典常数', icon: '🔢' },
  { id: 'level-first', name: '首战告捷', desc: '首次通过任一关卡', icon: '🎉' },
  { id: 'level-all', name: '通关达人', desc: '通过全部 4 个内置关卡', icon: '🏁' },
  { id: 'record-breaker', name: '打破纪录', desc: '刷新任一关卡的最快用时纪录', icon: '⚡' },
  { id: 'climber', name: '登高望远', desc: '在探索或关卡模式到达高度 20 以上', icon: '⛰️' },
  { id: 'tuner', name: '参数魔法师', desc: '首次调节函数参数或原点', icon: '🎚️' },
];

export function getUnlocked() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function isUnlocked(id) {
  return getUnlocked().includes(id);
}

// 解锁成就：首次解锁返回 true 并落盘；已解锁返回 false（幂等）
export function unlock(id) {
  const set = new Set(getUnlocked());
  if (set.has(id)) return false;
  set.add(id);
  try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch {}
  return true;
}

export function nameOf(id) {
  const a = ACHIEVEMENTS.find(x => x.id === id);
  return a ? a.name : id;
}

// 渲染成就面板；已解锁高亮（图标彩色），未解锁置灰
export function renderAchievements(containerEl) {
  const unlocked = new Set(getUnlocked());
  containerEl.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const row = document.createElement('div');
    row.className = 'achievement-item' + (unlocked.has(a.id) ? ' unlocked' : '');
    const icon = document.createElement('div');
    icon.className = 'ach-icon';
    icon.textContent = a.icon;
    const info = document.createElement('div');
    info.className = 'ach-info';
    const name = document.createElement('div');
    name.className = 'ach-name';
    name.textContent = a.name + (unlocked.has(a.id) ? '' : '（未解锁）');
    const desc = document.createElement('div');
    desc.className = 'ach-desc';
    desc.textContent = a.desc;
    info.append(name, desc);
    row.append(icon, info);
    containerEl.appendChild(row);
  }
}
