import * as THREE from 'three';
import { implicitGridSize, toWorld, buildField, extractImplicitMesh } from './implicitCore.js';

// 默认视距（水平生成半宽）。H = 玩家可调的「视距」，V = 生成高度上下限（= 3H）。
export const DEFAULT_H = 10;

// 通用网格曲面：nu×nv 个顶点，sample(i,j) 返回世界坐标 [x,y,z]
function buildIndexedGrid(nu, nv, sample) {
  const positions = new Float32Array(nu * nv * 3);
  const indices = new Uint32Array((nu - 1) * (nv - 1) * 6);
  let p = 0;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const w = sample(i, j);
      positions[p++] = w[0]; positions[p++] = w[1]; positions[p++] = w[2];
    }
  }
  let k = 0;
  for (let j = 0; j < nv - 1; j++) {
    for (let i = 0; i < nu - 1; i++) {
      const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();
  return g;
}

// 显式 z = f(x, y)：水平范围 x ∈ [-Hx, Hx]、y ∈ [-Hy, Hy]（竖直不裁剪，由函数值决定）
export function buildExplicit(fn, res = 120, Hx = DEFAULT_H, Hy = Hx, origin = [0, 0, 0]) {
  return buildIndexedGrid(res, res, (i, j) => {
    const mx = -Hx + (i / (res - 1)) * (2 * Hx);
    const my = -Hy + (j / (res - 1)) * (2 * Hy);
    return toWorld(mx, my, fn(mx, my), origin);
  });
}

// 从隐式等值面提取的顶点/索引数组组装 BufferGeometry（计算法线）。
// 主线程同步退路与 Worker 结果共用，保证两条路径产出一致。
export function geometryFromImplicitArrays(positions, indices) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();
  return g;
}

// 隐式 f(x, y, z) = 0，用 surfaceNets 提取等值面。
// 水平 x ∈ [-Hx, Hx]、y ∈ [-Hy, Hy]，竖直 z ∈ [-Vz, Vz]。
// z 分辨率随高度等比加高，保持体素近立方，避免竖直方向被拉长。
// 预计算标量场：每个格点只求值一次（消除 surfaceNets 8× 角点冗余求值）。
export function buildImplicit(fn, res = 64, Hx = DEFAULT_H, Hy = Hx, Vz = Hx * 3, origin = [0, 0, 0]) {
  const { nx, ny, nz } = implicitGridSize(res, Hx, Hy, Vz);
  const field = buildField(fn, nx, ny, nz, Hx, Hy, Vz);
  const { positions, indices } = extractImplicitMesh(field, nx, ny, nz, Hx, Hy, Vz, origin);
  return geometryFromImplicitArrays(positions, indices);
}

// 参数方程 (u,v) → (x,y,z)（无空间范围，u/v 即参数域；origin 仅做整体平移）
export function buildParametric(fn, res = 90, uRange, vRange, origin = [0, 0, 0]) {
  const ur = uRange || [0, Math.PI * 2];
  const vr = vRange || [0, Math.PI * 2];
  return buildIndexedGrid(res, res, (i, j) => {
    const u = ur[0] + (i / (res - 1)) * (ur[1] - ur[0]);
    const v = vr[0] + (j / (res - 1)) * (vr[1] - vr[0]);
    const m = fn(u, v);
    return toWorld(m[0], m[1], m[2], origin);
  });
}

// 从 BufferGeometry 提取物理碰撞所需的顶点/索引
export function toColliderData(geometry) {
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  return {
    vertices: new Float32Array(pos.array),
    indices: new Uint32Array(index.array),
  };
}
