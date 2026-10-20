// 关卡标记物可视化：出生点/存档点光环、常数发光 Sprite、终点光柱。
// 供编辑模式「关卡道具」与 playSession（宝物/终点）共用。
import * as THREE from 'three';

// 发光符号精灵（canvas 画光晕 + 常数符号）
export function makeSymbolSprite(symbol) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.42, 'rgba(120,205,255,0.60)');
  g.addColorStop(1, 'rgba(120,205,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#0b3d66';
  ctx.font = 'bold 58px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, size / 2, size / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.4, 1.4, 1);
  return sprite;
}

// 终点光柱：竖直半透明柱 + 顶部光球（开局暗淡锁定，集齐后点亮）
export function makeEndpoint(pos) {
  const group = new THREE.Group();
  const pillarGeo = new THREE.CylinderGeometry(0.6, 0.6, 30, 24, 1, true);
  const pillarMat = new THREE.MeshBasicMaterial({ color: 0x9aa7b0, transparent: true, opacity: 0.22, depthWrite: false });
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  pillar.position.y = 15;
  group.add(pillar);

  const orbGeo = new THREE.SphereGeometry(1.1, 24, 16);
  const orbMat = new THREE.MeshBasicMaterial({ color: 0x9aa7b0 });
  const orb = new THREE.Mesh(orbGeo, orbMat);
  orb.position.y = 30;
  group.add(orb);

  group.position.set(pos[0], pos[1], pos[2]);
  return { group, pillar, pillarMat, orb, orbMat };
}

// 出生点光环：金色平放圆环
export function makeSpawnRing(pos) {
  const geo = new THREE.TorusGeometry(0.85, 0.07, 16, 48);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffc24d, transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos[0], pos[1], pos[2]);
  return ring;
}

// 存档点光环：蓝色平放圆环
export function makeCheckpointRing(pos) {
  const geo = new THREE.TorusGeometry(0.7, 0.06, 16, 48);
  const mat = new THREE.MeshBasicMaterial({ color: 0x4db8ff, transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos[0], pos[1], pos[2]);
  return ring;
}

// 释放标记物占用的几何/材质（精灵/圆环/光柱均可，遍历即可）
export function disposeMarker(visual) {
  if (!visual) return;
  visual.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  });
}
