import { create, all } from 'mathjs';
import { stripEquals } from './implicitCore.js';

const math = create(all, {});

export const TYPES = { EXPLICIT: 'explicit', IMPLICIT: 'implicit', PARAMETRIC: 'parametric' };

// 按顶层逗号切分（忽略括号内的逗号），用于参数方程的三个分量
function splitTopLevel(s) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// 去掉分量前的 x= / y= / z= 前缀
function stripVarPrefix(part, vars) {
  let p = part.trim();
  for (const v of vars) {
    if (p.startsWith(v + '=') || p.startsWith(v + ' =')) {
      p = p.slice(p.indexOf('=') + 1).trim();
    }
  }
  return p;
}

// 显式表达式去掉开头的 "z="
function normalizeExplicit(expr) {
  let s = expr.trim();
  if (/^z\s*=/.test(s)) s = s.replace(/^z\s*=/, '').trim();
  return s;
}

// 是否为 mathjs 内置（函数或常量）：sin/pi/e 等都不是用户调节变量
function isBuiltin(name) { return name in math; }

// 表达式编辑器自动补全用的 mathjs 内置函数/常量名（字母开头，排除内部符号）
let _symbols = null;
export function mathSymbols() {
  if (_symbols) return _symbols;
  _symbols = Object.keys(math).filter(k => /^[A-Za-z][A-Za-z0-9]*$/.test(k)).sort();
  return _symbols;
}

// 自动识别表达式里的「字母调节变量」：除坐标变量与 mathjs 内置外的所有符号。
// 显式/隐式坐标 {x,y,z}；参数方程坐标 {u,v}（输出分量前的 x=/y=/z= 前缀已剥离）。
export function detectParams(expr, type) {
  const coordVars = type === TYPES.PARAMETRIC ? ['u', 'v'] : ['x', 'y', 'z'];
  const parts = type === TYPES.PARAMETRIC
    ? splitTopLevel(expr).map(p => stripVarPrefix(p, ['x', 'y', 'z']))
    : [(type === TYPES.IMPLICIT ? stripEquals(expr) : normalizeExplicit(expr))];

  const names = new Set();
  for (const s of parts) {
    let node;
    try { node = math.parse(s); } catch { continue; }
    node.traverse((n) => {
      if (n.isSymbolNode && n.name) names.add(n.name);
    });
  }

  const params = [];
  for (const name of names) {
    if (coordVars.includes(name)) continue;
    if (isBuiltin(name)) continue;
    params.push(name);
  }
  return params;
}

// 参数定义：可被「参数定义编辑器」逐项覆盖（初值/滑杆范围/输入范围/步长/标签/锁定）。
// 默认滑杆范围 -32~32，手动输入范围 -256~256（两者独立，由 livePanel 区分）。
function paramDefs(names, overrides = {}) {
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v)) ? v : d;
  return names.map(name => {
    const o = (overrides && overrides[name]) || {};
    return {
      name,
      value: num(o.value, 1),
      min: num(o.min, -32),
      max: num(o.max, 32),
      inputMin: num(o.inputMin, -256),
      inputMax: num(o.inputMax, 256),
      step: num(o.step, 0.1),
      label: (typeof o.label === 'string' && o.label) ? o.label : undefined,
      locked: !!o.locked,
    };
  });
}

// 编译并返回可复用求值函数 + 调节变量作用域；编译失败会抛错。
// paramOverrides：参数定义覆盖（name → {value,min,max,inputMin,inputMax,step,label,locked}），
// 由「参数定义编辑器」收集，用于自定义初值/范围/步长/标签。
export function parseFunction(type, expr, paramOverrides) {
  if (type === TYPES.EXPLICIT) {
    const s = normalizeExplicit(expr);
    const f = math.compile(s);
    const names = detectParams(expr, type);
    const defs = paramDefs(names, paramOverrides);
    const scope = { x: 0, y: 0 };
    for (const p of defs) scope[p.name] = p.value;
    return { type, params: defs, scope, fn: (x, y) => { scope.x = x; scope.y = y; return f.evaluate(scope); } };
  }

  if (type === TYPES.IMPLICIT) {
    const s = stripEquals(expr);
    const f = math.compile(s);
    const names = detectParams(expr, type);
    const defs = paramDefs(names, paramOverrides);
    const scope = { x: 0, y: 0, z: 0 };
    for (const p of defs) scope[p.name] = p.value;
    return { type, params: defs, scope, fn: (x, y, z) => { scope.x = x; scope.y = y; scope.z = z; return f.evaluate(scope); } };
  }

  if (type === TYPES.PARAMETRIC) {
    const parts = splitTopLevel(expr).map(p => stripVarPrefix(p, ['x', 'y', 'z']));
    if (parts.length < 3) throw new Error('参数方程需要 3 个分量：x=…, y=…, z=…');
    const fx = math.compile(parts[0]);
    const fy = math.compile(parts[1]);
    const fz = math.compile(parts[2]);
    const names = detectParams(expr, type);
    const defs = paramDefs(names, paramOverrides);
    const scope = { u: 0, v: 0 };
    for (const p of defs) scope[p.name] = p.value;
    return {
      type,
      params: defs,
      scope,
      fn: (u, v) => {
        scope.u = u; scope.v = v;
        return [fx.evaluate(scope), fy.evaluate(scope), fz.evaluate(scope)];
      },
    };
  }

  throw new Error('未知的函数类型');
}

// ---- 实时校验辅助 ----

// 把 mathjs 原始英文报错映射为中文提示（实时校验展示用）
export function translateParseError(message) {
  const m = String(message || '');
  if (/[一-龥]/.test(m)) return m; // 已是中文（如「参数方程需要 3 个分量…」）
  if (/end of expression/i.test(m)) return '表达式不完整：结尾缺少内容';
  if (/parenthes/i.test(m)) return '括号不匹配：请检查括号是否成对';
  if (/value expected/i.test(m)) return '表达式缺少数值或变量';
  if (/undefined function|missing in namespace|not found in namespace|is not a function/i.test(m)) return '未知函数：请检查函数名是否拼写正确';
  if (/undefined symbol/i.test(m)) return '未知符号：请检查变量或常量名';
  if (/unexpected type|typeerror/i.test(m)) return '表达式类型错误';
  if (/maximum call stack|too (many|complex)|rangeerror/i.test(m)) return '表达式太复杂，请简化后重试';
  return m;
}

// 轻量试算：parseFunction 只做编译，未知函数等错误要到实际求值才暴露；
// 用一组样本点求值一次，把这类运行时错误提前抓出来（复数/Infinity 视为合法，不误报）。
export function probeEvaluate(parsed) {
  let v;
  try {
    v = parsed.fn(0.13, 0.29, 0.41);
  } catch (err) {
    throw new Error(translateParseError(err.message));
  }
  if (parsed.type === TYPES.PARAMETRIC) {
    if (!Array.isArray(v) || v.length < 3) throw new Error('参数方程分量数量不足');
  } else if (typeof v === 'number' && Number.isNaN(v)) {
    throw new Error('表达式在该点结果不是数值（可能除零或无定义）');
  }
  return v;
}
