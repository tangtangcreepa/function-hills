import * as THREE from 'three';

const euler = new THREE.Euler(0, 0, 0, 'YXZ');
let yaw = 0;
let pitch = -0.5;
let sensitivity = 1;      // 鼠标灵敏度倍率（设置面板可调）
let smoothing = false;    // 视角平滑开关（防晕）
let curYaw = yaw;         // 平滑后的当前朝向
let curPitch = pitch;

export function resetView() { setYawPitch(0, -0.5); }

// 鼠标增量（指针锁定下）旋转视角
export function rotate(dx, dy) {
  yaw -= dx * 0.0022 * sensitivity;
  pitch -= dy * 0.0022 * sensitivity;
  const lim = Math.PI / 2 - 0.05;
  pitch = Math.max(-lim, Math.min(lim, pitch));
}

export function getYawPitch() { return { yaw, pitch }; }
export function setYawPitch(y, p) {
  yaw = y; pitch = p;
  curYaw = y; curPitch = p; // 同步 snap，避免切换/读档时画面突跳
}

export function setSensitivity(v) { sensitivity = Number(v) || 1; }
export function setSmoothing(v) { smoothing = !!v; }

// 把 yaw/pitch 写入相机朝向。传入 dt 且开启平滑时，朝向以指数趋近目标（减少骤转眩晕）；
// 未传 dt（读档/聚焦等瞬移场景）则直接 snap。
export function applyRotation(camera, dt) {
  if (smoothing && dt !== undefined && dt > 0) {
    const k = 1 - Math.exp(-dt * 10);
    curYaw += (yaw - curYaw) * k;
    curPitch += (pitch - curPitch) * k;
  } else {
    curYaw = yaw;
    curPitch = pitch;
  }
  euler.set(curPitch, curYaw, 0, 'YXZ');
  camera.quaternion.setFromEuler(euler);
}

// 水平面（XZ）上的前后/左右方向，基于即时 yaw（移动方向不滞后，仅视角平滑）
export function horizontalVectors() {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return {
    forward: new THREE.Vector3(fx, 0, fz),
    right: new THREE.Vector3(rx, 0, rz),
  };
}
