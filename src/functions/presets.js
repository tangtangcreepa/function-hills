import { TYPES } from './parser.js';

// 预设：type 决定求值方式，expr 为输入表达式；
// 参数方程可选 uRange / vRange，缺省为 [0, 2π]；
// desc 为中文说明，category 为函数图鉴的分组。
export const PRESETS = [
  // —— 起伏曲面 ——
  { name: '起伏丘陵', type: TYPES.EXPLICIT, expr: 'z = sin(x) + cos(y)', category: '起伏曲面', desc: '正弦波叠加的连绵丘陵，最经典的入门曲面。' },
  { name: '涟漪波纹', type: TYPES.EXPLICIT, expr: 'z = sin(sqrt(x^2 + y^2))', category: '起伏曲面', desc: '以原点为中心的同心圆环波纹，像水面涟漪。' },
  { name: '高斯峰', type: TYPES.EXPLICIT, expr: 'z = 6 * exp(-(x^2 + y^2) / 8)', category: '起伏曲面', desc: '中心高耸、四周平缓的高斯钟形山峰。' },
  { name: '波浪面', type: TYPES.EXPLICIT, expr: 'z = 2*sin(x)*cos(y)', category: '起伏曲面', desc: '纵横两个方向正弦叠加的连绵波浪。' },
  { name: '棋盘格', type: TYPES.EXPLICIT, expr: 'z = sin(x)*sin(y)', category: '起伏曲面', desc: '正负交替的棋盘状起伏，山谷与丘陵错落。' },
  { name: '墨西哥帽', type: TYPES.EXPLICIT, expr: 'z = 3*sin(sqrt(x^2+y^2))/(sqrt(x^2+y^2)+0.5)', category: '起伏曲面', desc: '中心凸起、外圈下陷的宽边草帽形状。' },

  // —— 二次曲面 ——
  { name: '抛物面', type: TYPES.EXPLICIT, expr: 'z = 8 - (x^2 + y^2) / 6', category: '二次曲面', desc: '开口向下的旋转抛物面，像一口大碗。' },
  { name: '球面', type: TYPES.IMPLICIT, expr: 'x^2 + y^2 + z^2 = 16', category: '二次曲面', desc: '半径 4 的标准球面。' },
  { name: '圆锥', type: TYPES.IMPLICIT, expr: 'x^2 + y^2 - z^2 = 0', category: '二次曲面', desc: '顶点在原点、上下对称展开的圆锥。' },
  { name: '单叶双曲面', type: TYPES.IMPLICIT, expr: 'x^2 + y^2 - z^2 = 4', category: '二次曲面', desc: '腰部收紧、向两端张开，像冷却塔。' },
  { name: '马鞍面', type: TYPES.EXPLICIT, expr: 'z = 0.15*(x^2 - y^2)', category: '二次曲面', desc: '一个方向向上、另一方向向下，像马鞍。' },
  { name: '椭球面', type: TYPES.IMPLICIT, expr: 'x^2/9 + y^2/4 + z^2 = 1', category: '二次曲面', desc: '三个方向半径不同的椭球（3、2、1）。' },
  { name: '双叶双曲面', type: TYPES.IMPLICIT, expr: 'x^2 + y^2 - z^2 = -4', category: '二次曲面', desc: '上下两片彼此分离的双曲面。' },
  { name: '圆柱面', type: TYPES.IMPLICIT, expr: 'x^2 + y^2 = 9', category: '二次曲面', desc: '沿竖直方向延伸、半径 3 的圆柱面。' },

  // —— 经典曲面 ——
  { name: '圆环面', type: TYPES.IMPLICIT, expr: '(sqrt(x^2 + y^2) - 3)^2 + z^2 = 1', category: '经典曲面', desc: '甜甜圈形状的圆环面（隐式）。' },
  { name: '球面（参数）', type: TYPES.PARAMETRIC, expr: 'x=4*cos(u)*cos(v), y=4*sin(u)*cos(v), z=4*sin(v)', uRange: [0, Math.PI * 2], vRange: [-Math.PI / 2, Math.PI / 2], category: '经典曲面', desc: '用经纬参数方程绘制的球面。' },
  { name: '圆环面（参数）', type: TYPES.PARAMETRIC, expr: 'x=(3+cos(v))*cos(u), y=(3+cos(v))*sin(u), z=sin(v)', uRange: [0, Math.PI * 2], vRange: [0, Math.PI * 2], category: '经典曲面', desc: '用参数方程绘制的甜甜圈圆环面。' },
  { name: '枕头曲面', type: TYPES.IMPLICIT, expr: 'x^4 + y^4 + z^4 = 16', category: '经典曲面', desc: '四次方「超级椭圆」，四角鼓起像枕头。' },
  { name: '螺旋面', type: TYPES.PARAMETRIC, expr: 'x=u*cos(v), y=u*sin(v), z=v', uRange: [0, 3], vRange: [-6, 6], category: '经典曲面', desc: '绕竖直轴螺旋上升的旋转楼梯曲面。' },
  { name: '悬链面', type: TYPES.PARAMETRIC, expr: 'x=cosh(v)*cos(u), y=cosh(v)*sin(u), z=v', uRange: [0, Math.PI * 2], vRange: [-2, 2], category: '经典曲面', desc: '肥皂膜拉出的双曲余弦悬链曲面。' },

  // —— 拓扑曲面 ——
  { name: '莫比乌斯带', type: TYPES.PARAMETRIC, expr: 'x=(2+v*cos(u/2))*cos(u), y=(2+v*cos(u/2))*sin(u), z=v*sin(u/2)', uRange: [0, Math.PI * 2], vRange: [-1, 1], category: '拓扑曲面', desc: '只有一面的莫比乌斯带。' },
  { name: '克莱因瓶', type: TYPES.PARAMETRIC, expr: 'x=(3+cos(u/2)*sin(v)-sin(u/2)*sin(2*v))*cos(u), y=(3+cos(u/2)*sin(v)-sin(u/2)*sin(2*v))*sin(u), z=sin(u/2)*sin(v)+cos(u/2)*sin(2*v)', uRange: [0, Math.PI * 2], vRange: [0, Math.PI * 2], category: '拓扑曲面', desc: '没有内外之分的克莱因瓶（自交浸入）。' },
];
