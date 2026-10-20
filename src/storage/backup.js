// 存档备份：把 localStorage 里的全部存档导出为 .json 文件，或从 .json 导入回存档。
// 文件读写经 preload 暴露的 window.backup（Electron 主进程原生对话框），非浏览器环境回退报错。
import * as savesApi from './saves.js';

// 汇总全部存档为一个可落盘的备份对象
export function buildBackup() {
  return {
    app: 'function-hills',
    type: 'backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    activeId: savesApi.getActiveId(),
    saves: savesApi.listSaves().map(e => ({
      id: e.id,
      name: e.name,
      updatedAt: e.updatedAt,
      data: savesApi.readSave(e.id),
    })),
  };
}

// 导出：把备份 JSON 交给主进程写盘
export async function exportBackup() {
  if (!window.backup) throw new Error('当前环境不支持文件导出');
  const json = JSON.stringify(buildBackup(), null, 2);
  const res = await window.backup.save(json);
  if (res && res.error) throw new Error(res.error);
  return res;
}

// 导入：读取备份文件，逐个作为新槽位合并（非破坏性，不覆盖现有存档）
export async function importBackup() {
  if (!window.backup) throw new Error('当前环境不支持文件导入');
  const res = await window.backup.open();
  if (!res || res.canceled) return { canceled: true };
  if (res.error) throw new Error(res.error);
  let backup;
  try {
    backup = JSON.parse(res.content);
  } catch {
    throw new Error('备份文件不是有效的 JSON');
  }
  if (!backup || !Array.isArray(backup.saves)) throw new Error('备份文件格式不正确');
  let count = 0;
  for (const item of backup.saves) {
    if (!item || typeof item !== 'object') continue;
    const { id } = savesApi.createSave(item.name || '导入存档');
    savesApi.writeSave(id, item.data || {});
    count++;
  }
  return { ok: true, count };
}
