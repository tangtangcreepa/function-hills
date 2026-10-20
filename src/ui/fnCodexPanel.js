// 函数图鉴：按类别分组列出全部预设，点「生成」把该函数加入世界。
// 由 main.js 驱动（initFnCodexPanel → render，onGenerate 即 main.js 的 generate）。
import { PRESETS } from '../functions/presets.js';

const TYPE_LABEL = { explicit: '显式', implicit: '隐式', parametric: '参数' };

export function initFnCodexPanel({ onGenerate }) {
  const listEl = document.getElementById('fncodex-list');
  const statusEl = document.getElementById('fncodex-status');

  function render() {
    listEl.innerHTML = '';
    statusEl.textContent = '';
    // 按 category 分组（保持预设声明顺序）
    const groups = new Map();
    for (const p of PRESETS) {
      const cat = p.category || '其他';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(p);
    }
    for (const [cat, items] of groups) {
      const h3 = document.createElement('h3');
      h3.className = 'fncodex-cat';
      h3.textContent = cat + '（' + items.length + '）';
      listEl.appendChild(h3);
      for (const p of items) listEl.appendChild(buildItem(p));
    }
  }

  function buildItem(p) {
    const item = document.createElement('div');
    item.className = 'fncodex-item';

    const head = document.createElement('div');
    head.className = 'fncodex-head';
    const name = document.createElement('span');
    name.className = 'fncodex-name';
    name.textContent = p.name;
    const tag = document.createElement('span');
    tag.className = 'fncodex-tag fncodex-tag-' + p.type;
    tag.textContent = TYPE_LABEL[p.type] || p.type;
    const btn = document.createElement('button');
    btn.className = 'fncodex-gen';
    btn.textContent = '生成';
    head.append(name, tag, btn);

    const desc = document.createElement('div');
    desc.className = 'fncodex-desc';
    desc.textContent = p.desc || '';
    const expr = document.createElement('div');
    expr.className = 'fncodex-expr';
    expr.textContent = p.expr;

    item.append(head, desc, expr);

    btn.addEventListener('click', async () => {
      const ranges = p.uRange ? { uRange: p.uRange, vRange: p.vRange } : null;
      btn.disabled = true;
      statusEl.textContent = '生成中：' + p.name + ' …';
      try {
        const res = await onGenerate(p.type, p.expr, ranges, [0, 0, 0], null);
        if (res && res.error) statusEl.textContent = '⚠️ ' + p.name + '：' + res.error;
        else statusEl.textContent = '✅ 已生成：' + p.name;
      } catch (err) {
        statusEl.textContent = '⚠️ ' + p.name + '：' + (err && err.message ? err.message : err);
      } finally {
        btn.disabled = false;
      }
    });

    return item;
  }

  render();
  return { render };
}
