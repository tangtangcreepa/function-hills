// 隐式生成客户端：把预打包的 Worker 源码（.txt 文本内联）用 Blob URL 实例化，
// 封装 requestImplicitBuild(payload) → Promise。Worker 不可用/出错时 reject，
// 由调用方退回同步 buildImplicit（功能不受损）。
import workerSource from '../dist/implicit.worker.txt';

let worker = null;
let failed = false;
let seq = 0;
const pending = new Map(); // requestId → { resolve, reject }

function ensureWorker() {
  if (worker || failed) return worker;
  try {
    const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = (e) => {
      const { genId, positions, indices, error } = e.data || {};
      const p = pending.get(genId);
      if (!p) return;
      pending.delete(genId);
      if (error) p.reject(new Error(error));
      else p.resolve({ positions, indices });
    };
    w.onerror = (e) => {
      failed = true;
      const msg = (e && (e.message || e.error)) || 'worker error';
      for (const [, p] of pending) p.reject(new Error(msg));
      pending.clear();
    };
    worker = w;
  } catch (err) {
    failed = true;
  }
  return worker;
}

// 请求隐式等值面生成。返回 Promise<{ positions, indices }>；不可用时 reject。
export function requestImplicitBuild(payload) {
  const w = ensureWorker();
  if (!w) return Promise.reject(new Error('implicit worker unavailable'));
  const genId = 'g' + (++seq) + '_' + Date.now().toString(36);
  return new Promise((resolve, reject) => {
    pending.set(genId, { resolve, reject });
    try {
      w.postMessage({ ...payload, genId });
    } catch (err) {
      pending.delete(genId);
      reject(err);
    }
  });
}
