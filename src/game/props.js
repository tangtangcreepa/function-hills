// 关卡静态跑酷元件：platform（平台）/ ridge（窄脊）/ ramp（坡道）的网格与物理碰撞。
// 由 main.js 驱动（enterLevel → buildProps，exitLevel → clearProps）。
// 网格用 BoxGeometry + MeshStandardMaterial；碰撞用 Rapier cuboid（坡道按 tiltZ/tiltX 旋转）。
import * as THREE from 'three';
import { addStaticCuboid, clearStaticProps } from '../physics/physics.js';

let meshes = [];

// 按关卡 props 数组创建网格 + 碰撞体（先清掉上一批）
export function buildProps(scene, props) {
  clearProps(scene);
  for (const prop of props || []) {
    const { pos, size, color = '#cfe3f0', friction = 1, tiltX = 0, tiltZ = 0 } = prop;

    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.72, metalness: 0.05 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, 0, tiltZ));
    mesh.quaternion.copy(quat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);

    addStaticCuboid(
      { x: pos[0], y: pos[1], z: pos[2] },
      { x: size[0] / 2, y: size[1] / 2, z: size[2] / 2 },
      friction,
      { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
    );
  }
}

// 移除所有关卡元件网格，并清空对应静态碰撞体
export function clearProps(scene) {
  for (const m of meshes) {
    scene.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  }
  meshes = [];
  clearStaticProps();
}
