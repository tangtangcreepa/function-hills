// 内置预设关卡：关卡模式的数据源。
// 每个关卡 = 一组函数曲面 + 静态跑酷元件(props) + 出生点 + 散落的数学宝物 + 终点。
// 宝物/终点 pos 为 3 元素显式世界坐标 [x, y, z]（世界 Y 为高度），不再依赖 heightAt 回填。
// 可调曲面 adjustable:true 时，关卡内玩家可选中它并实时调节 params 里的变量来改变赛道。
import { parseFunction, TYPES } from '../functions/parser.js';

export const LEVELS = [
  {
    id: 'l1',
    name: '寻宝·丘陵',
    desc: '集齐 π/e/φ/√2 四个常数，再把「桥」调到终点平台高度，登上终点光柱。',
    start: [0, 8, 0],
    fallY: -2, // 掉到该高度以下判定坠落（回最近检查点）；地形最低约 -2
    surfaces: [
      // 地面丘陵（固定）
      { type: TYPES.EXPLICIT, expr: 'z = sin(x) + cos(y)', name: '丘陵', friction: 1 },
      // 桥（可调参数 a）：一端锚定在地面，远端高度随 a 升高，用来够到终点平台
      {
        type: TYPES.PARAMETRIC,
        expr: 'x = u, y = v, z = 1 + a * (u + 6) / 12',
        name: '桥',
        ranges: { uRange: [-6, 6], vRange: [-1.4, 1.4] },
        friction: 1,
        adjustable: true,
        hint: '桥的远端太低，够不到终点平台：把「桥的高度」调到 6.5 左右，让桥的远端接上终点平台。',
        params: { a: { value: 1, min: 0, max: 8, label: '桥的高度' } },
      },
    ],
    props: [
      // 赛道一：悬浮平台跳 → e（Z = 6.3 一侧，逐级升高）
      { kind: 'platform', pos: [2.5, 2.8, 6.3], size: [2.2, 0.5, 2.2], friction: 1, color: '#cfe3f0' },
      { kind: 'platform', pos: [4.5, 4.2, 6.3], size: [2.2, 0.5, 2.2], friction: 1, color: '#cfe3f0' },
      { kind: 'platform', pos: [6.5, 5.6, 6.3], size: [2.4, 0.5, 2.4], friction: 1, color: '#cfe3f0' },
      { kind: 'platform', pos: [8.5, 7.0, 6.3], size: [2.4, 0.5, 2.4], friction: 1, color: '#cfe3f0' },
      // 赛道二：冰面窄脊 → φ（Z = -6.3，-X 一侧，低摩擦滑）
      { kind: 'platform', pos: [-2.0, 1.6, -6.3], size: [1.6, 0.5, 1.6], friction: 1, color: '#dce8f0' },
      { kind: 'platform', pos: [-4.0, 3.0, -6.3], size: [1.6, 0.5, 1.6], friction: 1, color: '#dce8f0' },
      { kind: 'ridge', pos: [-6.5, 4.4, -6.3], size: [5.0, 0.5, 0.9], friction: 0.15, color: '#d8ecf8' },
      // 赛道三：坡道跳台 → √2（Z = -6.3，+X 一侧，粗面抓地）
      { kind: 'ramp', pos: [3.5, 2.6, -6.3], size: [3.6, 0.4, 2.2], tiltZ: 0.32, friction: 1.3, color: '#e8dccf' },
      { kind: 'platform', pos: [6.5, 4.2, -6.3], size: [2.4, 0.5, 2.4], friction: 1, color: '#cfe3f0' },
      // 终点平台（桥的远端上方，终点光柱底座）
      { kind: 'platform', pos: [6.5, 7.2, 0], size: [3.0, 0.6, 3.0], friction: 1, color: '#f0e6c8' },
    ],
    treasures: [
      { symbol: 'π', label: '圆周率', desc: '圆周长与直径之比 ≈ 3.14159', pos: [0, 0.5, -3] },
      { symbol: 'e', label: '自然常数', desc: '指数增长的底 ≈ 2.71828', pos: [8.5, 8.8, 6.3] },
      { symbol: 'φ', label: '黄金比例', desc: '(1+√5)/2 ≈ 1.61803', pos: [-6.5, 6.1, -6.3] },
      { symbol: '√2', label: '根号二', desc: '边长为 1 的正方形对角线 ≈ 1.41421', pos: [6.5, 5.9, -6.3] },
    ],
    end: [6.5, 7.2, 0],
  },
  {
    id: 'l2',
    name: '球面·登顶',
    desc: '沿球面外侧的阶梯平台向上跳跃，登上球面帽盖，收集 √2 后抵达球顶光柱。',
    start: [5.6, -1.0, -1.2],
    fallY: -2.7,
    surfaces: [
      // 隐式球 x²+y²+z²=25，半径 5；顶部帽盖（坡 <45°）可走，用阶梯平台爬上去
      { type: TYPES.IMPLICIT, expr: 'x^2 + y^2 + z^2 = 25', name: '球面', friction: 1, range: { follow: false, x: 8, y: 8, z: 8 } },
    ],
    props: [
      // 阶梯：+X 一侧、Z 向左右错开的 5 块平台，逐级升高 1.4m，顶台跳到球面帽盖
      { kind: 'platform', pos: [5.6, -1.6, -1.2], size: [2.4, 0.4, 2.4], friction: 1, color: '#cfe3f0' },
      { kind: 'platform', pos: [5.6, -0.2, 1.2], size: [2.4, 0.4, 2.4], friction: 1, color: '#cfe3f0' },
      { kind: 'platform', pos: [5.6, 1.2, -1.2], size: [2.4, 0.4, 2.4], friction: 1, color: '#cfe3f0' },
      { kind: 'platform', pos: [5.6, 2.6, 1.2], size: [2.4, 0.4, 2.4], friction: 1, color: '#cfe3f0' },
      { kind: 'platform', pos: [5.6, 4.0, -1.2], size: [2.4, 0.4, 2.4], friction: 1, color: '#cfe3f0' },
    ],
    treasures: [
      { symbol: 'π', label: '圆周率', desc: '圆周长与直径之比 ≈ 3.14159', pos: [5.6, 0.4, 1.2] },
      { symbol: 'e', label: '自然常数', desc: '指数增长的底 ≈ 2.71828', pos: [5.6, 3.2, 1.2] },
      { symbol: 'φ', label: '黄金比例', desc: '(1+√5)/2 ≈ 1.61803', pos: [5.6, 4.6, -1.2] },
      { symbol: '√2', label: '根号二', desc: '边长为 1 的正方形对角线 ≈ 1.41421', pos: [1.5, 4.8, 0] },
    ],
    end: [0, 5.0, 0],
  },
  {
    id: 'l3',
    name: '马鞍·翻越',
    desc: '翻越双曲抛物面：沿山脊与谷底收集 4 个常数，最后登上东侧山脊的终点光柱。',
    start: [0, 3, 0],
    fallY: -6.7,
    surfaces: [
      // 双曲抛物面 z=0.15(x²−y²)：+X 山脊、−X 山脊、±Y 谷底，坡 <45° 可走
      { type: TYPES.EXPLICIT, expr: 'z = 0.15*(x^2 - y^2)', name: '马鞍面', friction: 1 },
    ],
    props: [],
    treasures: [
      { symbol: 'π', label: '圆周率', desc: '圆周长与直径之比 ≈ 3.14159', pos: [2.5, 1.6, 0] },
      { symbol: 'e', label: '自然常数', desc: '指数增长的底 ≈ 2.71828', pos: [-2.5, 1.6, 0] },
      { symbol: 'φ', label: '黄金比例', desc: '(1+√5)/2 ≈ 1.61803', pos: [0, -0.4, 2.5] },
      { symbol: '√2', label: '根号二', desc: '边长为 1 的正方形对角线 ≈ 1.41421', pos: [0, -0.4, -2.5] },
    ],
    end: [3, 1.4, 0],
  },
  {
    id: 'l4',
    name: '环面·环游',
    desc: '沿平躺环面的顶部绕行一圈，收集 4 个常数，抵达对侧的终点光柱。',
    start: [6, 3, 0],
    fallY: -2,
    surfaces: [
      // 平躺环面 (√(x²+y²)−6)²+z²=4：环半径 6、管半径 2，顶部 y=2 一圈是可走的「环脊」
      { type: TYPES.IMPLICIT, expr: '(sqrt(x^2 + y^2) - 6)^2 + z^2 = 4', name: '环面', friction: 1, range: { follow: false, x: 10, y: 10, z: 6 } },
    ],
    props: [],
    treasures: [
      { symbol: 'π', label: '圆周率', desc: '圆周长与直径之比 ≈ 3.14159', pos: [6, 2.7, 0] },
      { symbol: 'e', label: '自然常数', desc: '指数增长的底 ≈ 2.71828', pos: [0, 2.7, 6] },
      { symbol: 'φ', label: '黄金比例', desc: '(1+√5)/2 ≈ 1.61803', pos: [-6, 2.7, 0] },
      { symbol: '√2', label: '根号二', desc: '边长为 1 的正方形对角线 ≈ 1.41421', pos: [0, 2.7, -6] },
    ],
    end: [-6, 2.2, 0],
  },
];

// 兼容旧代码：预编译首张显式曲面的高度函数 fn(x,z)=世界高度
// （新关卡宝物/终点已改用显式 3D 坐标，此函数仅作回退，不再参与回填）
for (const lv of LEVELS) {
  const s = lv.surfaces && lv.surfaces[0];
  lv.heightFn = s && s.type === TYPES.EXPLICIT ? parseFunction(TYPES.EXPLICIT, s.expr).fn : null;
}

// 世界 XZ 处的高度；无显式高度函数时回退 0
export function heightAt(level, x, z) {
  if (level.heightFn) return level.heightFn(x, z);
  return 0;
}
