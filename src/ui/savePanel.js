// 存档面板：显示当前槽、自动保存状态、槽位列表（切换/重命名/删除）、新建槽。
// 所有操作通过回调交给 main.js（它负责真正的读写与读档重建）。
import { armConfirm } from './confirm.js';

export function initSavePanel({ onNew, onSwitch, onRename, onDelete, onExport, onImport }) {
  const currentEl = document.getElementById('save-current');
  const statusEl = document.getElementById('save-status');
  const newBtn = document.getElementById('save-new');
  const exportBtn = document.getElementById('save-export');
  const importBtn = document.getElementById('save-import');
  const listEl = document.getElementById('save-list');

  newBtn.addEventListener('click', () => onNew());
  exportBtn.addEventListener('click', () => onExport());
  armConfirm(importBtn, '确认导入覆盖?', () => onImport());

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function render(list, activeId) {
    listEl.innerHTML = '';
    const cur = activeId ? list.find(x => x.id === activeId) : null;
    currentEl.textContent = cur ? ('当前：' + cur.name) : '当前：无存档';

    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'save-empty';
      li.textContent = '还没有存档，点「新建存档」把当前世界存下来。';
      listEl.appendChild(li);
      return;
    }

    for (const e of list) {
      const li = document.createElement('li');
      li.className = 'save-item' + (e.id === activeId ? ' selected' : '');

      const name = document.createElement('span');
      name.className = 'save-name';
      name.textContent = e.name;
      name.title = '点击切换到该存档 · 双击重命名';
      // 单击延迟切换：避免与双击重命名冲突（同函数列表的做法）
      let clickTimer = null;
      name.addEventListener('click', (ev) => {
        ev.stopPropagation();
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => onSwitch(e.id), 220);
      });
      name.addEventListener('dblclick', () => {
        clearTimeout(clickTimer);
        renameInline(name, e);
      });
      li.appendChild(name);

      const time = document.createElement('span');
      time.className = 'save-time';
      time.textContent = formatTime(e.updatedAt);
      li.appendChild(time);

      const del = document.createElement('button');
      del.className = 'save-del';
      del.textContent = '×';
      del.title = '删除该存档';
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (del.dataset.confirm !== '1') {
          del.dataset.confirm = '1';
          del.textContent = '确认?';
          setTimeout(() => {
            if (del.dataset.confirm === '1') { del.dataset.confirm = ''; del.textContent = '×'; }
          }, 1600);
          return;
        }
        onDelete(e.id);
      });
      li.appendChild(del);

      li.addEventListener('click', () => onSwitch(e.id));
      listEl.appendChild(li);
    }
  }

  function renameInline(nameEl, e) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'save-rename';
    input.value = e.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const commit = () => { if (done) return; done = true; onRename(e.id, input.value); };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') commit();
      else if (ev.key === 'Escape') { done = true; onRename(e.id, e.name); }
    });
  }

  return {
    render,
    setStatus(text) { statusEl.textContent = text; },
    setSaved() {
      const p = n => String(n).padStart(2, '0');
      const d = new Date();
      statusEl.textContent = `已自动保存 ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    },
  };
}
