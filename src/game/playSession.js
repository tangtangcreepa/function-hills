// 关卡局内运行时：宝物/终点光柱的创建、动画、收集检测、过关判定。
// 由 main.js 驱动（enterLevel → start，animate 内 update，exitLevel → clear）。
import * as THREE from 'three';
import { makeSymbolSprite, makeEndpoint, makeCheckpointRing } from './markers.js';

const COLLECT_RADIUS = 1.8;
const END_RADIUS = 2.5;
const CHECKPOINT_RADIUS = 1.5; // 存档点激活的平面（水平）距离
const CHECKPOINT_DY = 3;       // 存档点激活的垂直容差（玩家胶囊中心与光环的高度差）

let session = null; // { scene, level, callbacks, treasures[], endpoint, startedAt, collected, won, respawn }

export function start(scene, level, callbacks) {
  clear(scene);
  session = {
    scene, level, callbacks, treasures: [], checkpoints: [],
    startedAt: performance.now(), collected: 0, won: false,
    respawn: [level.start[0], level.start[1], level.start[2]],
  };

  for (const t of level.treasures) {
    const [x, y, z] = t.pos;
    const sprite = makeSymbolSprite(t.symbol);
    sprite.position.set(x, y, z);
    scene.add(sprite);
    session.treasures.push({
      symbol: t.symbol, label: t.label, desc: t.desc,
      baseY: y, sprite, collected: false, removed: false, outT: 0, phase: Math.random() * Math.PI * 2,
    });
  }

  for (const cp of (level.checkpoints || [])) {
    const [cx, cy, cz] = cp;
    const ring = makeCheckpointRing([cx, cy, cz]);
    scene.add(ring);
    session.checkpoints.push({ pos: [cx, cy, cz], active: false, ring, mat: ring.material });
  }

  const [ex, ey, ez] = level.end;
  const ep = makeEndpoint([ex, ey, ez]);
  scene.add(ep.group);
  session.endpoint = { ...ep, pos: [ex, ey, ez], active: false };

  // 没有常数可收集的关卡（只放出生点+终点）：终点直接开启
  if (session.treasures.length === 0) {
    session.endpoint.active = true;
    if (callbacks.onAllCollected) callbacks.onAllCollected();
  }

  if (callbacks.onProgress) callbacks.onProgress(0, session.treasures.length);
}

export function update(dt, playerPos) {
  if (!session || session.won) return;
  const t = performance.now() / 1000;

  // 存档点（检查点）：走近即激活，此后坠落回最近激活的存档点
  for (const cp of session.checkpoints) {
    if (cp.active) continue;
    const dx = playerPos.x - cp.pos[0];
    const dy = playerPos.y - cp.pos[1];
    const dz = playerPos.z - cp.pos[2];
    if (dx * dx + dz * dz < CHECKPOINT_RADIUS * CHECKPOINT_RADIUS && Math.abs(dy) < CHECKPOINT_DY) {
      cp.active = true;
      session.respawn = [cp.pos[0], cp.pos[1] + 0.5, cp.pos[2]];
      cp.mat.color.set(0x7fe3ff);
      cp.ring.scale.setScalar(1.35);
      if (session.callbacks.onCheckpoint) session.callbacks.onCheckpoint(cp.pos);
    }
  }

  for (const tr of session.treasures) {
    if (tr.removed) continue;
    if (tr.collected) {
      // 淡出缩放特效后移除
      tr.outT += dt;
      const k = Math.max(0, 1 - tr.outT / 0.35);
      tr.sprite.material.opacity = k;
      tr.sprite.scale.setScalar(1.4 + (1 - k) * 0.8);
      if (tr.outT >= 0.35) {
        session.scene.remove(tr.sprite);
        tr.sprite.material.map.dispose();
        tr.sprite.material.dispose();
        tr.removed = true;
      }
      continue;
    }
    tr.sprite.position.y = tr.baseY + Math.sin(t * 1.6 + tr.phase) * 0.3;
    const dx = playerPos.x - tr.sprite.position.x;
    const dy = playerPos.y - tr.sprite.position.y;
    const dz = playerPos.z - tr.sprite.position.z;
    if (dx * dx + dy * dy + dz * dz < COLLECT_RADIUS * COLLECT_RADIUS) collectOne(tr);
  }

  const ep = session.endpoint;
  if (ep.active) {
    ep.pillarMat.color.set(0x66ccff);
    ep.pillarMat.opacity = 0.3 + Math.sin(t * 3) * 0.12;
    ep.orbMat.color.setHSL(0.5, 0.9, 0.6);
    const dx = playerPos.x - ep.pos[0];
    const dz = playerPos.z - ep.pos[2];
    if (dx * dx + dz * dz < END_RADIUS * END_RADIUS) win();
  }
}

function collectOne(tr) {
  tr.collected = true;
  tr.outT = 0;
  session.collected++;
  // 收集成功即更新最近检查点（略抬高，避免重生时卡进地面）
  session.respawn = [tr.sprite.position.x, tr.baseY, tr.sprite.position.z];
  if (session.callbacks.onCollect) session.callbacks.onCollect(tr.symbol, tr.label);
  if (session.callbacks.onProgress) session.callbacks.onProgress(session.collected, session.treasures.length);
  if (session.collected >= session.treasures.length) {
    session.endpoint.active = true;
    if (session.callbacks.onAllCollected) session.callbacks.onAllCollected();
  }
}

function win() {
  session.won = true;
  session.elapsed = (performance.now() - session.startedAt) / 1000; // 保留小数秒，供竞速计时
  if (session.callbacks.onWin) {
    session.callbacks.onWin({ time: session.elapsed, count: session.collected, total: session.treasures.length });
  }
}

export function clear(scene) {
  if (!session) return;
  for (const tr of session.treasures) {
    if (!tr.removed) {
      scene.remove(tr.sprite);
      if (tr.sprite.material.map) tr.sprite.material.map.dispose();
      tr.sprite.material.dispose();
    }
  }
  if (session.endpoint) {
    scene.remove(session.endpoint.group);
    session.endpoint.pillar.geometry.dispose();
    session.endpoint.orb.geometry.dispose();
    session.endpoint.pillarMat.dispose();
    session.endpoint.orbMat.dispose();
  }
  for (const cp of session.checkpoints) {
    scene.remove(cp.ring);
    cp.ring.geometry.dispose();
    cp.mat.dispose();
  }
  session = null;
}

export function isActive() { return !!session && !session.won; }
export function collectedCount() { return session ? session.collected : 0; }

// 当前关卡已进行秒数（过关后冻结为最终用时）；未开局返回 0
export function getElapsed() {
  if (!session) return 0;
  if (typeof session.elapsed === 'number') return session.elapsed;
  return (performance.now() - session.startedAt) / 1000;
}

// 最近检查点（未收集任何宝物时为出生点，收集后为该宝物位置）
export function respawnPos() {
  if (!session) return [0, 8, 0];
  return session.respawn;
}
