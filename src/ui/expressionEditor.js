// 表达式编辑器：在原生 textarea 上叠加 <pre> 做语法高亮，附 mathjs 自动补全与括号匹配。
// 通过包装原 textarea 保持「外部仍读写 textarea.value / input 事件」的既有语义不变。
import { mathSymbols } from '../functions/parser.js';

const SYMBOLS = mathSymbols();
const COORD_VARS = ['x', 'y', 'z', 'u', 'v'];
const BRACKETS = '()[]{}';
const PAIR = { '(': ')', '[': ']', '{': '}' };

// 返回与 index 处括号配对的括号下标；不匹配/不是括号返回 -1
function matchBracket(src, index) {
  const ch = src[index];
  if (PAIR[ch]) {
    const close = PAIR[ch];
    let depth = 0;
    for (let i = index; i < src.length; i++) {
      if (src[i] === ch) depth++;
      else if (src[i] === close) { depth--; if (depth === 0) return i; }
    }
    return -1;
  }
  const open = Object.keys(PAIR).find(k => PAIR[k] === ch);
  if (open) {
    let depth = 0;
    for (let i = index; i >= 0; i--) {
      if (src[i] === ch) depth++;
      else if (src[i] === open) { depth--; if (depth === 0) return i; }
    }
    return -1;
  }
  return -1;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 高亮表达式；marks 为需要特殊标记的下标集合（括号匹配），badBracket 为未配对括号下标
function highlight(src, marks, badBracket) {
  let out = '';
  const re = /(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([\s]+)|([^\sA-Za-z0-9_])/g;
  let m;
  while ((m = re.exec(src))) {
    const idx = m.index;
    const text = m[0];
    let cls = '';
    if (m[1] != null) cls = 'tk-num';
    else if (m[2] != null) {
      const name = m[2];
      if (SYMBOLS.includes(name)) cls = 'tk-fn';
      else if (COORD_VARS.includes(name)) cls = 'tk-var';
      else cls = 'tk-param';
    } else if (m[4] != null) {
      cls = 'tk-op';
    }
    if (cls) {
      const extra = marks.has(idx) ? ' tk-match' : (idx === badBracket ? ' tk-unmatch' : '');
      out += `<span class="${cls}${extra}">${escapeHtml(text)}</span>`;
    } else {
      out += escapeHtml(text);
    }
  }
  return out;
}

export function initExpressionEditor(textarea, { onInput } = {}) {
  const wrap = textarea.closest('.expr-wrap');
  const backdrop = wrap ? wrap.querySelector('.expr-backdrop') : null;
  const dropdown = wrap ? wrap.querySelector('.expr-autocomplete') : null;

  let activeIdx = 0; // 下拉当前高亮项

  function hideDropdown() {
    if (dropdown) dropdown.classList.add('hidden');
    activeIdx = 0;
  }

  function refresh() {
    const src = textarea.value;
    const pos = textarea.selectionStart;
    if (backdrop) {
      // 括号匹配：光标处或前一字符
      let bracketIdx = -1;
      if (BRACKETS.includes(src[pos])) bracketIdx = pos;
      else if (pos > 0 && BRACKETS.includes(src[pos - 1])) bracketIdx = pos - 1;
      const mate = bracketIdx >= 0 ? matchBracket(src, bracketIdx) : -1;
      const marks = new Set();
      let bad = -1;
      if (bracketIdx >= 0) {
        if (mate >= 0) { marks.add(bracketIdx); marks.add(mate); }
        else bad = bracketIdx;
      }
      backdrop.innerHTML = highlight(src, marks, bad);
      backdrop.scrollTop = textarea.scrollTop;
      backdrop.scrollLeft = textarea.scrollLeft;
    }
    updateAutocomplete(src, pos);
  }

  function updateAutocomplete(src, pos) {
    if (!dropdown) return;
    const before = src.slice(0, pos);
    const m = /[A-Za-z_][A-Za-z0-9_]*$/.exec(before);
    const token = m ? m[0] : '';
    const matches = token ? SYMBOLS.filter(s => s.startsWith(token) && s !== token) : [];
    if (!matches.length || document.activeElement !== textarea) {
      hideDropdown();
      return;
    }
    const shown = matches.slice(0, 8);
    dropdown.innerHTML = '';
    shown.forEach((s, i) => {
      const item = document.createElement('div');
      item.className = 'ac-item' + (i === activeIdx ? ' active' : '');
      item.textContent = s;
      item.addEventListener('mousedown', (e) => { e.preventDefault(); insert(s); });
      item.addEventListener('mouseenter', () => { activeIdx = i; paintActive(); });
      dropdown.appendChild(item);
    });
    dropdown.classList.remove('hidden');
  }

  function paintActive() {
    if (!dropdown) return;
    Array.from(dropdown.children).forEach((c, i) => c.classList.toggle('active', i === activeIdx));
  }

  function insert(sym) {
    const pos = textarea.selectionStart;
    const before = textarea.value.slice(0, pos);
    const m = /[A-Za-z_][A-Za-z0-9_]*$/.exec(before);
    const start = m ? pos - m[0].length : pos;
    const after = textarea.value.slice(pos);
    setValue(textarea.value.slice(0, start) + sym + after);
    const np = start + sym.length;
    textarea.setSelectionRange(np, np);
    textarea.focus();
    hideDropdown();
    refresh();
  }

  function setValue(v) {
    textarea.value = v;
    refresh();
  }

  textarea.addEventListener('input', () => { refresh(); if (onInput) onInput(); });
  textarea.addEventListener('click', refresh);
  textarea.addEventListener('keyup', refresh);
  textarea.addEventListener('scroll', () => {
    if (backdrop) { backdrop.scrollTop = textarea.scrollTop; backdrop.scrollLeft = textarea.scrollLeft; }
  });
  textarea.addEventListener('blur', () => setTimeout(hideDropdown, 150));

  textarea.addEventListener('keydown', (e) => {
    if (!dropdown || dropdown.classList.contains('hidden')) return;
    const items = dropdown.children;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = (activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      paintActive();
    } else if (e.key === 'Enter') {
      const target = items[activeIdx];
      if (target) { e.preventDefault(); insert(target.textContent); }
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  });

  // 初始化高亮
  refresh();

  return { setValue, refresh, hideDropdown };
}
