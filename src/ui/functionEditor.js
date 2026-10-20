import { PRESETS } from '../functions/presets.js';
import { loadHistory, addHistory, removeHistory, clearHistory } from '../functions/history.js';
import { parseFunction, probeEvaluate, translateParseError } from '../functions/parser.js';
import { armConfirm } from './confirm.js';
import { initExpressionEditor } from './expressionEditor.js';
import { showFade, hideFade } from './transitions.js';

const DEFAULT_EXPR = {
  explicit: 'z = sin(x) + cos(y)',
  implicit: 'x^2 + y^2 + z^2 = 16',
  parametric: 'x=(3+cos(v))*cos(u), y=(3+cos(v))*sin(u), z=sin(v)',
};

const TYPE_LABEL = { explicit: '显式', implicit: '隐式', parametric: '参数' };

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 负责「添加/编辑函数」面板 + 「函数列表」两部分
export function initFunctionEditor({ onAdd, onUpdate, onSelect, onRemove, onToggleVisible, onRename }) {
  const panel = document.getElementById('editor-panel');
  const panelTitle = document.getElementById('editor-title');
  const btnAdd = document.getElementById('btn-add');
  const btnClose = document.getElementById('editor-close');
  const typeSel = document.getElementById('editor-type');
  const exprInput = document.getElementById('editor-expr');
  const presetSel = document.getElementById('editor-preset');
  const presetSearch = document.getElementById('editor-preset-search');
  const presetPreview = document.getElementById('editor-preset-preview');
  const paramDefsEl = document.getElementById('editor-param-defs');
  const uvRangeEl = document.getElementById('editor-uv-range');
  const uvMinU = document.getElementById('editor-u-min');
  const uvMaxU = document.getElementById('editor-u-max');
  const uvMinV = document.getElementById('editor-v-min');
  const uvMaxV = document.getElementById('editor-v-max');
  const historyEl = document.getElementById('editor-history');
  const historySearch = document.getElementById('editor-history-search');
  const historyClear = document.getElementById('editor-history-clear');
  const btnDoAdd = document.getElementById('editor-add');
  const errorEl = document.getElementById('editor-error');
  const paramsHintEl = document.getElementById('editor-params');
  const listEl = document.getElementById('function-list');
  const listEmptyEl = document.getElementById('function-list-empty');
  const originX = document.getElementById('editor-origin-x');
  const originY = document.getElementById('editor-origin-y');
  const originZ = document.getElementById('editor-origin-z');
  const rangeFollow = document.getElementById('editor-range-follow');
  const rangeFields = document.getElementById('editor-range-fields');
  const rangeX = document.getElementById('editor-range-x');
  const rangeY = document.getElementById('editor-range-y');
  const rangeZ = document.getElementById('editor-range-z');
  const rangeZLabel = document.getElementById('editor-range-z-label');

  // 当前编辑模式：'add' 新增，'edit' 修改已有图像
  let mode = 'add';
  let editId = null;

  // 表达式编辑器（语法高亮 + mathjs 自动补全 + 括号匹配），输入时防抖校验
  const exprEditor = initExpressionEditor(exprInput, { onInput: scheduleValidate });

  // 最近一次成功解析结果（供参数定义编辑器渲染）
  let currentParsed = null;

  // ---- 错误徽章（非阻塞：小徽章 + 悬停 tooltip 显示完整信息）----
  function showError(msg) {
    errorEl.textContent = '⚠';
    errorEl.title = msg || '表达式有误';
    errorEl.classList.remove('valid', 'hidden');
    errorEl.classList.add('badge-err');
  }
  function showValid() {
    errorEl.textContent = '✓';
    errorEl.title = '表达式有效';
    errorEl.classList.remove('badge-err', 'hidden');
    errorEl.classList.add('valid');
  }
  function hideError() {
    errorEl.classList.add('hidden');
    errorEl.classList.remove('valid', 'badge-err');
    errorEl.title = '';
  }

  // ---- 实时校验（300ms 防抖，不阻塞提交）----
  function setParamsHint(text) { if (paramsHintEl) { paramsHintEl.textContent = text; paramsHintEl.classList.toggle('hidden', !text); } }

  // ---- 参数定义编辑器：按检测到的变量渲染可编辑行（初值/滑杆范围/步长/中文标签）----
  function field(title, cls, value, step) {
    const l = document.createElement('label');
    const s = document.createElement('span');
    s.textContent = title;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.className = cls;
    inp.step = step;
    inp.value = String(value);
    l.append(s, inp);
    return l;
  }

  function renderParamDefs(params, overrides) {
    paramDefsEl.innerHTML = '';
    if (!params || !params.length) return;
    const head = document.createElement('h3');
    head.textContent = '参数定义';
    paramDefsEl.appendChild(head);
    for (const p of params) {
      const o = (overrides && overrides[p.name]) || {};
      const row = document.createElement('div');
      row.className = 'param-def-row';
      row.dataset.name = p.name;

      const headRow = document.createElement('div');
      headRow.className = 'param-def-head';
      const name = document.createElement('b');
      name.textContent = p.name;
      const label = document.createElement('input');
      label.className = 'pd-label';
      label.type = 'text';
      label.placeholder = '中文标签';
      label.value = (o.label != null ? o.label : (p.label || ''));
      headRow.append(name, label);
      row.appendChild(headRow);

      const grid = document.createElement('div');
      grid.className = 'param-def-grid';
      grid.appendChild(field('初值', 'pd-value', (o.value != null ? o.value : p.value), '0.1'));
      grid.appendChild(field('最小', 'pd-min', (o.min != null ? o.min : p.min), '0.1'));
      grid.appendChild(field('最大', 'pd-max', (o.max != null ? o.max : p.max), '0.1'));
      grid.appendChild(field('步长', 'pd-step', (o.step != null ? o.step : p.step), '0.01'));
      row.appendChild(grid);
      paramDefsEl.appendChild(row);
    }
  }

  function collectParamOverrides() {
    const out = {};
    paramDefsEl.querySelectorAll('.param-def-row').forEach((row) => {
      const name = row.dataset.name;
      const num = (sel) => {
        const raw = row.querySelector(sel).value.trim();
        if (raw === '') return undefined;
        const v = Number(raw);
        return Number.isFinite(v) ? v : undefined;
      };
      const label = row.querySelector('.pd-label').value.trim();
      out[name] = {
        value: num('.pd-value'),
        min: num('.pd-min'),
        max: num('.pd-max'),
        step: num('.pd-step'),
        label: label || undefined,
      };
    });
    return out;
  }

  function validateExpression(overrides) {
    const type = typeSel.value;
    const expr = exprInput.value.trim();
    setParamsHint('');
    if (!expr) { hideError(); paramDefsEl.innerHTML = ''; currentParsed = null; return; }
    try {
      const parsed = parseFunction(type, expr);
      probeEvaluate(parsed);
      currentParsed = parsed;
      showValid();
      setParamsHint(parsed.params.length ? '检测到参数：' + parsed.params.map(p => p.name).join('、') : '');
      renderParamDefs(parsed.params, overrides || {});
    } catch (err) {
      currentParsed = null;
      showError(translateParseError(err.message));
      paramDefsEl.innerHTML = '';
    }
  }

  let validateTimer = null;
  function scheduleValidate() { clearTimeout(validateTimer); validateTimer = setTimeout(() => validateExpression(), 300); }

  // ---- 参数方程 u/v 范围 ----
  function setParametricRanges(ranges) {
    const u = (ranges && Array.isArray(ranges.uRange) && ranges.uRange.length === 2) ? ranges.uRange : [0, Math.PI * 2];
    const v = (ranges && Array.isArray(ranges.vRange) && ranges.vRange.length === 2) ? ranges.vRange : [0, Math.PI * 2];
    uvMinU.value = String(u[0]); uvMaxU.value = String(u[1]);
    uvMinV.value = String(v[0]); uvMaxV.value = String(v[1]);
  }

  function collectRanges() {
    if (typeSel.value !== 'parametric') return null;
    const u0 = Number(uvMinU.value), u1 = Number(uvMaxU.value);
    const v0 = Number(uvMinV.value), v1 = Number(uvMaxV.value);
    if (![u0, u1, v0, v1].every(Number.isFinite)) return null;
    if (u1 <= u0 || v1 <= v0) return null; // 非法范围回退默认 [0, 2π]
    return { uRange: [u0, u1], vRange: [v0, v1] };
  }

  // ---- 原点偏移 / 图像范围 ----
  function resetOriginRange() {
    originX.value = '0'; originY.value = '0'; originZ.value = '0';
    rangeFollow.checked = true;
    rangeX.value = '10'; rangeY.value = '10'; rangeZ.value = '30';
  }

  // 依据当前函数类型决定「范围」字段显隐：参数方程用 u/v 参数域，无空间范围
  function updateRangeVisibility() {
    const t = typeSel.value;
    const parametric = t === 'parametric';
    rangeZLabel.classList.toggle('hidden', parametric || t === 'explicit');
    if (parametric) rangeFields.classList.add('hidden');
    else rangeFields.classList.toggle('hidden', rangeFollow.checked);
    uvRangeEl.classList.toggle('hidden', !parametric);
  }

  function collectOrigin() {
    return [Number(originX.value) || 0, Number(originY.value) || 0, Number(originZ.value) || 0];
  }

  function collectRange() {
    if (typeSel.value === 'parametric') return null;
    if (rangeFollow.checked) return { follow: true };
    const r = { follow: false, x: Number(rangeX.value) || undefined, y: Number(rangeY.value) || undefined };
    if (typeSel.value === 'implicit') r.z = Number(rangeZ.value) || undefined;
    return r;
  }

  function applyOriginRange(origin, range) {
    const o = Array.isArray(origin) && origin.length === 3 ? origin : [0, 0, 0];
    originX.value = String(o[0]); originY.value = String(o[1]); originZ.value = String(o[2]);
    if (range && range.follow === false) {
      rangeFollow.checked = false;
      rangeX.value = String(range.x ?? 10);
      rangeY.value = String(range.y ?? 10);
      rangeZ.value = String(range.z ?? 30);
    } else {
      rangeFollow.checked = true;
      rangeX.value = '10'; rangeY.value = '10'; rangeZ.value = '30';
    }
    updateRangeVisibility();
  }

  // ---- 预设：optgroup 分组 + 搜索过滤 + 预览说明 ----
  function renderPresets(filter) {
    presetSel.innerHTML = '<option value="">— 选择预设 —</option>';
    const q = (filter || '').trim().toLowerCase();
    const groups = {};
    for (const p of PRESETS) {
      if (q && !(p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q) || p.expr.toLowerCase().includes(q))) continue;
      (groups[p.category] = groups[p.category] || []).push(p);
    }
    for (const cat of Object.keys(groups)) {
      const og = document.createElement('optgroup');
      og.label = cat;
      for (const p of groups[cat]) {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        og.appendChild(opt);
      }
      presetSel.appendChild(og);
    }
  }

  function showPresetPreview(name) {
    const p = name ? PRESETS.find(x => x.name === name) : null;
    if (p) {
      presetPreview.textContent = p.desc + ' · ' + p.expr;
      presetPreview.classList.remove('hidden');
    } else {
      presetPreview.classList.add('hidden');
    }
  }

  // ---- 历史记录：含参数定义、逐条删除、清空、搜索 ----
  function loadHistoryEntry(i) {
    const entry = loadHistory()[i];
    if (!entry) return;
    typeSel.value = entry.type;
    exprEditor.setValue(entry.expr);
    setParametricRanges(entry.uRange ? { uRange: entry.uRange, vRange: entry.vRange } : null);
    applyOriginRange(entry.origin, entry.range);
    validateExpression(entry.params || {});
  }

  function renderHistory(filter) {
    const h = loadHistory();
    const q = (filter || '').trim().toLowerCase();
    historyEl.innerHTML = '';
    const filtered = q
      ? h.map((e, i) => ({ e, i })).filter(x => x.e.expr.toLowerCase().includes(q) || (TYPE_LABEL[x.e.type] || x.e.type).includes(q))
      : h.map((e, i) => ({ e, i }));
    if (!filtered.length) {
      const li = document.createElement('li');
      li.textContent = q ? '（无匹配历史）' : '（暂无历史记录）';
      li.style.cursor = 'default';
      historyEl.appendChild(li);
      return;
    }
    for (const { e, i } of filtered) {
      const li = document.createElement('li');
      li.className = 'history-item';
      const main = document.createElement('span');
      main.className = 'history-main';
      main.innerHTML = `<span class="t">${TYPE_LABEL[e.type] || e.type}</span> ${escapeHtml(e.expr)}`;
      main.title = '点击载入该历史';
      main.addEventListener('click', () => loadHistoryEntry(i));
      const del = document.createElement('button');
      del.className = 'history-del';
      del.textContent = '×';
      del.title = '删除该条历史';
      armConfirm(del, '确认删除?', () => { removeHistory(i); renderHistory(historySearch.value); });
      li.append(main, del);
      historyEl.appendChild(li);
    }
  }

  function openForAdd() {
    mode = 'add';
    editId = null;
    panelTitle.textContent = '生成函数';
    btnDoAdd.textContent = '添加';
    hideError();
    resetOriginRange();
    setParametricRanges(null);
    updateRangeVisibility();
    showFade(panel);
    validateExpression();
  }

  function openForEdit(s) {
    mode = 'edit';
    editId = s.id;
    typeSel.value = s.type;
    exprEditor.setValue(s.expr);
    setParametricRanges(s.ranges);
    applyOriginRange(s.origin, s.range);
    const overrides = {};
    for (const p of (s.parsed && s.parsed.params) || []) {
      overrides[p.name] = { value: p.value, min: p.min, max: p.max, inputMin: p.inputMin, inputMax: p.inputMax, step: p.step, label: p.label, locked: p.locked };
    }
    panelTitle.textContent = '编辑函数';
    btnDoAdd.textContent = '保存';
    hideError();
    showFade(panel);
    validateExpression(overrides);
  }

  // 切换类型时保留用户已输入的内容；只有空输入或仍是默认模板时才换成新类型模板
  typeSel.addEventListener('change', () => {
    const prev = exprInput.value.trim();
    const untouched = prev === '' || Object.values(DEFAULT_EXPR).includes(prev);
    if (untouched) exprEditor.setValue(DEFAULT_EXPR[typeSel.value]);
    setParametricRanges(null);
    resetOriginRange();
    updateRangeVisibility();
    validateExpression();
  });

  presetSel.addEventListener('change', () => {
    const name = presetSel.value;
    showPresetPreview(name);
    if (!name) return;
    const p = PRESETS.find(x => x.name === name);
    if (!p) return;
    typeSel.value = p.type;
    exprEditor.setValue(p.expr);
    setParametricRanges(p.uRange ? { uRange: p.uRange, vRange: p.vRange } : null);
    resetOriginRange();
    updateRangeVisibility();
    validateExpression();
  });

  presetSearch.addEventListener('input', () => renderPresets(presetSearch.value));
  rangeFollow.addEventListener('change', updateRangeVisibility);
  historySearch.addEventListener('input', () => renderHistory(historySearch.value));
  armConfirm(historyClear, '确认清空?', () => { clearHistory(); renderHistory(historySearch.value); });

  btnAdd.addEventListener('click', openForAdd);
  btnClose.addEventListener('click', () => hideFade(panel));

  btnDoAdd.addEventListener('click', async () => {
    const type = typeSel.value;
    const expr = exprInput.value.trim();
    if (!expr) { showError('请输入表达式'); return; }
    const origin = collectOrigin();
    const range = collectRange();
    const ranges = collectRanges();
    const paramOverrides = collectParamOverrides();
    const result = mode === 'edit'
      ? await onUpdate(editId, type, expr, ranges, origin, range, paramOverrides)
      : await onAdd(type, expr, ranges, origin, range, paramOverrides);
    if (result && result.error) {
      showError(result.error);
    } else {
      addHistory(type, expr, ranges?.uRange, ranges?.vRange, origin, range, paramOverrides);
      renderHistory(historySearch.value);
      hideFade(panel);
    }
  });

  renderPresets('');
  renderHistory('');

  // ---- 函数列表 ----
  function renderList(surfaces, selectedId) {
    listEl.innerHTML = '';
    if (!surfaces.length) {
      listEmptyEl.classList.remove('hidden');
      return;
    }
    listEmptyEl.classList.add('hidden');
    for (const s of surfaces) listEl.appendChild(buildItem(s, selectedId));
  }

  function buildItem(s, selectedId) {
    const li = document.createElement('li');
    li.className = 'fn-item' + (s.id === selectedId ? ' selected' : '');

    const swatch = document.createElement('span');
    swatch.className = 'fn-swatch';
    swatch.style.background = s.properties.color;
    swatch.title = s.expr;
    li.appendChild(swatch);

    const name = document.createElement('span');
    name.className = 'fn-name';
    name.textContent = s.name;
    name.title = '点击选中 · 双击重命名';
    // 单击延迟选中：若立即选中会触发 onSelect→重建列表，导致双击时 DOM 已换、
    // 浏览器不再把它识别为同一元素上的双击，dblclick 永远不触发（重命名失效）。
    let clickTimer = null;
    name.addEventListener('click', (e) => {
      e.stopPropagation();
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => onSelect(s.id), 220);
    });
    name.addEventListener('dblclick', () => {
      clearTimeout(clickTimer);
      renameInline(name, s);
    });
    li.appendChild(name);

    const edit = document.createElement('button');
    edit.className = 'fn-edit';
    edit.textContent = '✎';
    edit.title = '编辑该函数表达式';
    edit.addEventListener('click', (e) => { e.stopPropagation(); openForEdit(s); });
    li.appendChild(edit);

    const vis = document.createElement('button');
    vis.className = 'fn-vis';
    vis.textContent = s.visible ? '👁' : '╱';
    vis.title = s.visible ? '点击隐藏该图像' : '点击显示该图像';
    vis.addEventListener('click', (e) => { e.stopPropagation(); onToggleVisible(s.id, !s.visible); });
    li.appendChild(vis);

    const del = document.createElement('button');
    del.className = 'fn-del';
    del.textContent = '×';
    del.title = '删除该图像';
    armConfirm(del, '确认删除?', () => onRemove(s.id));
    li.appendChild(del);

    li.addEventListener('click', () => onSelect(s.id));
    return li;
  }

  function renameInline(nameEl, s) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fn-rename';
    input.value = s.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const commit = () => { if (done) return; done = true; onRename(s.id, input.value); };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') { done = true; onRename(s.id, s.name); }
    });
  }

  return { renderList };
}
