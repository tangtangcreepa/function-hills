// 隐式函数后台生成 Worker：主线程发来 { genId, expr, paramValues, res, Hx, Hy, Vz, origin }，
// 这里用 mathjs 重编译表达式 → 预计算标量场 → surfaceNets 提取等值面 → 世界映射，
// 再以 transferable 把顶点/索引传回，避免在界面线程做大量求值造成卡顿。
import { create, all } from 'mathjs';
import { stripEquals, implicitGridSize, buildField, extractImplicitMesh } from '../functions/implicitCore.js';

const math = create(all, {});

self.onmessage = (e) => {
  const { genId, expr, paramValues, res, Hx, Hy, Vz, origin } = e.data || {};
  try {
    // 重编译（与主线程 parseFunction 同一套 mathjs，结果一致）
    const f = math.compile(stripEquals(expr));
    const scope = { x: 0, y: 0, z: 0 };
    if (paramValues) for (const k in paramValues) scope[k] = paramValues[k];
    const fn = (x, y, z) => { scope.x = x; scope.y = y; scope.z = z; return f.evaluate(scope); };

    const { nx, ny, nz } = implicitGridSize(res, Hx, Hy, Vz);
    const field = buildField(fn, nx, ny, nz, Hx, Hy, Vz);
    const { positions, indices } = extractImplicitMesh(field, nx, ny, nz, Hx, Hy, Vz, origin);

    self.postMessage({ genId, positions, indices }, [positions.buffer, indices.buffer]);
  } catch (err) {
    self.postMessage({ genId, error: err && err.message ? err.message : String(err) });
  }
};
