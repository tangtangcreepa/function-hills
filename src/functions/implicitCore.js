import * as isosurface from 'isosurface';

// 隐式函数生成共享核心：主线程同步退路与后台 Worker 共用同一套
// 「去等号 → 预计算标量场 → surfaceNets 提取 → 世界映射 → 翻转绕序」逻辑，
// 保证两条路径产出完全一致。核心优化：预先把势函数在每个格点只求值一次，
// 消除 surfaceNets 内部约 8× 的角点冗余求值。

// 处理含 "=" 的隐式方程：把 "左 = 右" 变成 "左 - (右)"，即 f=0 的形式
export function stripEquals(expr) {
  const s = String(expr || '').trim();
  const eq = s.indexOf('=');
  if (eq === -1) return s;
  const lhs = s.slice(0, eq).trim();
  const rhs = s.slice(eq + 1).trim();
  if (rhs === '' || rhs === '0') return lhs;
  return `(${lhs}) - (${rhs})`;
}

// 隐式网格尺寸：水平 nx=ny=res，竖直 nz 随高度等比加高（体素近立方，避免拉长）
export function implicitGridSize(res, Hx, Hy, Vz) {
  const nx = res, ny = res;
  const Href = (Hx + Hy) / 2;
  const nz = Math.max(2, Math.round(res * (Vz / Href)));
  return { nx, ny, nz };
}

// 数学坐标 (mx, my, mz) → 世界坐标 (X, Y向上, Z)；数学的 z 对应世界的竖直方向。
// origin = [ox, oy, oz] 为世界坐标三维平移（oy 为竖直方向）。
export function toWorld(mx, my, mz, origin = [0, 0, 0]) {
  return [mx + origin[0], mz + origin[1], my + origin[2]];
}

// 预计算标量场：每个格点只求值一次，返回 Float32Array（布局 i + j*nx + k*nx*ny）
export function buildField(fn, nx, ny, nz, Hx, Hy, Vz) {
  const field = new Float32Array(nx * ny * nz);
  let idx = 0;
  for (let k = 0; k < nz; k++) {
    const mz = -Vz + (k / (nz - 1)) * (2 * Vz);
    for (let j = 0; j < ny; j++) {
      const my = -Hy + (j / (ny - 1)) * (2 * Hy);
      for (let i = 0; i < nx; i++) {
        const mx = -Hx + (i / (nx - 1)) * (2 * Hx);
        field[idx++] = fn(mx, my, mz);
      }
    }
  }
  return field;
}

// 从标量场提取等值面：surfaceNets → 世界坐标顶点（含 origin 平移）→ 翻转绕序（法线朝外）。
// 返回 { positions: Float32Array, indices: Uint32Array }（可 transferable）。
export function extractImplicitMesh(field, nx, ny, nz, Hx, Hy, Vz, origin = [0, 0, 0]) {
  const mesh = isosurface.surfaceNets([nx, ny, nz], (i, j, k) => field[i + j * nx + k * nx * ny]);

  const positions = new Float32Array(mesh.positions.length * 3);
  for (let i = 0; i < mesh.positions.length; i++) {
    const gp = mesh.positions[i];
    const mx = -Hx + (gp[0] / (nx - 1)) * (2 * Hx);
    const my = -Hy + (gp[1] / (ny - 1)) * (2 * Hy);
    const mz = -Vz + (gp[2] / (nz - 1)) * (2 * Vz);
    const w = toWorld(mx, my, mz, origin);
    positions[i * 3] = w[0]; positions[i * 3 + 1] = w[1]; positions[i * 3 + 2] = w[2];
  }

  const indices = new Uint32Array(mesh.cells.length * 3);
  for (let i = 0; i < mesh.cells.length; i++) {
    const c = mesh.cells[i];
    // surfaceNets 的法线约定指向势函数负值侧（闭合曲面内侧），翻转绕序让法线朝外
    indices[i * 3] = c[2]; indices[i * 3 + 1] = c[1]; indices[i * 3 + 2] = c[0];
  }

  return { positions, indices };
}
