// 关卡道具面板：编辑模式下把出生点/存档点/常数/终点光柱放在玩家当前位置，管理已放置列表。
import { CONSTANTS } from '../game/collection.js';
import { armConfirm } from './confirm.js';

const KIND_LABEL = { spawn: '出生点', checkpoint: '存档点', treasure: '常数', end: '终点' };

export function initLevelPropsPanel({ onPlace, onRemove, onFocus }) {
  const symbolSel = document.getElementById('level-props-symbol');
  const btnSpawn = document.getElementById('level-props-spawn');
  const btnCheckpoint = document.getElementById('level-props-checkpoint');
  const btnTreasure = document.getElementById('level-props-treasure');
  const btnEnd = document.getElementById('level-props-end');
  const listEl = document.getElementById('level-props-list');

  // 常数符号下拉（图鉴里的 π/e/φ/√2/i）
  for (const c of CONSTANTS) {
    const opt = document.createElement('option');
    opt.value = c.symbol;
    opt.textContent = c.symbol + ' ' + c.label;
    symbolSel.appendChild(opt);
  }

  btnSpawn.addEventListener('click', () => onPlace('spawn'));
  btnCheckpoint.addEventListener('click', () => onPlace('checkpoint'));
  btnTreasure.addEventListener('click', () => onPlace('treasure', symbolSel.value));
  btnEnd.addEventListener('click', () => onPlace('end'));

  function render(markers) {
    listEl.innerHTML = '';
    if (!markers.length) {
      const li = document.createElement('li');
      li.className = 'save-empty';
      li.textContent = '还没有道具，飞到目标位置后点上方按钮放置。';
      listEl.appendChild(li);
      return;
    }
    for (const m of markers) {
      const li = document.createElement('li');
      li.className = 'save-item';
      li.title = '点击聚焦视角到该道具';

      const name = document.createElement('span');
      name.className = 'save-name';
      name.textContent = KIND_LABEL[m.kind] + (m.kind === 'treasure' ? ' ' + (m.symbol || '') : '');
      li.appendChild(name);

      const coord = document.createElement('span');
      coord.className = 'save-time';
      coord.textContent = `${m.pos[0].toFixed(1)},${m.pos[1].toFixed(1)},${m.pos[2].toFixed(1)}`;
      li.appendChild(coord);

      const del = document.createElement('button');
      del.className = 'save-del';
      del.textContent = '×';
      del.title = '删除该道具';
      armConfirm(del, '确认删除?', () => onRemove(m.id));
      li.appendChild(del);

      li.addEventListener('click', () => onFocus(m));
      listEl.appendChild(li);
    }
  }

  return { render };
}
