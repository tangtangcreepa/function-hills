import RAPIER from '@dimforge/rapier3d-compat';

const GRAVITY = -9.81;
const G = 9.81; // 重力大小（坡面分量用）
const JUMP_SPEED = 6.0;

// 摩擦手感（Rapier 角色控制器本身不应用碰撞体摩擦，需手动读取脚下表面摩擦后生效）
// 冰面(f≈0)：加速度小(拖拽感)、几乎不减速(持续滑行)、很缓的坡就往下滑
// 地面(f≈1+)：加速度大(干脆)、快速刹停、只在陡坡下滑
const ACCEL_ICE = 3, ACCEL_GROUND = 20;
const DECAY_ICE = 0.25, DECAY_GROUND = 8;
const SLIDE_ICE = 0.12, SLIDE_GROUND = 0.785; // 滑坡角度阈值（弧度，地面≈45°）

// 空中操控加速度（贴地用摩擦决定的 accel，空中用固定值，保留一定空中转向能力）
const AIR_ACCEL = 10;
// 水平速度上限（约 3.6× 走路速度；只有下坡滑动会触及，输入最高 8.5）
const MAX_HORIZ_SPEED = 20;
// 支撑面判定：法线 y 分量大于此值才视为「脚下有表面」
const GROUND_NY_MIN = 0.05;
// 落地迟滞窗口（秒）：离地瞬间短暂保留「贴地」状态，吸收帧间翻转导致的抖动
const GROUND_GRACE = 0.12;

let world = null;
let surfaceBodies = [];
let surfaceMap = new Map(); // surfaceId -> { body, collider }（增量更新用）
let propBodies = [];
let characterBody = null;
let characterCollider = null;
let controller = null;
let verticalVel = 0;
let horizVel = { x: 0, z: 0 };
let grounded = false;

// 脚下表面接触信息（上一帧探测结果，供本帧移动使用）
let groundFrictionVal = 1;
let groundNormal = { x: 0, y: 1, z: 0 };
let hasGroundContact = false;
let slideAngle = SLIDE_GROUND;
let groundGrace = 0;

// 首次进入探索模式时初始化（异步加载 WASM）
export async function initPhysics() {
  if (!world) {
    await RAPIER.init();
    world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  }
}

// 新建单个曲面刚体并登记到 surfaceMap（供增量更新）
function addSurfaceBody(id, c) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const collider = world.createCollider(
    RAPIER.ColliderDesc.trimesh(new Float32Array(c.vertices), new Uint32Array(c.indices)),
    body,
  );
  collider.setFriction(typeof c.friction === 'number' ? c.friction : 1.0);
  surfaceBodies.push(body);
  surfaceMap.set(id, { body, collider });
}

function removeSurfaceBody(id) {
  const entry = surfaceMap.get(id);
  if (!entry) return;
  world.removeRigidBody(entry.body);
  const i = surfaceBodies.indexOf(entry.body);
  if (i !== -1) surfaceBodies.splice(i, 1);
  surfaceMap.delete(id);
}

function clearSurfaceBodies() {
  for (const b of surfaceBodies) world.removeRigidBody(b);
  surfaceBodies = [];
  surfaceMap.clear();
}

// 用所有函数图像的几何体重建静态 trimesh 刚体（可承载角色）——全量重建
export function setSurfaceColliders(colliders) {
  if (!world) return;
  clearSurfaceBodies();
  for (const c of colliders) {
    if (!c || !c.indices || c.indices.length === 0) continue;
    addSurfaceBody(c.id, c);
  }
}

// 增量更新：只重建 id 命中的曲面刚体，其余保持不动（拖动滑杆/原点时合并重建，避免全量 trimesh 重建）
export function updateSurfaceColliders(updates, removeIds) {
  if (!world) return;
  for (const id of (removeIds || [])) removeSurfaceBody(id);
  for (const u of (updates || [])) {
    removeSurfaceBody(u.id);
    if (u && u.indices && u.indices.length > 0) addSurfaceBody(u.id, u);
  }
}

// 仅改摩擦（不重建 trimesh，远比全量重建便宜）
export function setSurfaceFrictions(updates) {
  if (!world) return;
  for (const u of updates) {
    const entry = surfaceMap.get(u.id);
    if (entry) entry.collider.setFriction(typeof u.friction === 'number' ? u.friction : 1.0);
  }
}

// 静态跑酷元件：固定刚体 + 长方体碰撞体（可带摩擦/旋转）
export function addStaticCuboid(pos, halfExtents, friction = 1.0, rotQuat = null) {
  if (!world) return;
  const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z);
  if (rotQuat) desc.setRotation({ x: rotQuat.x, y: rotQuat.y, z: rotQuat.z, w: rotQuat.w });
  const body = world.createRigidBody(desc);
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z),
    body,
  );
  collider.setFriction(friction);
  propBodies.push(body);
}

export function clearStaticProps() {
  if (!world) return;
  for (const b of propBodies) world.removeRigidBody(b);
  propBodies = [];
}

// 生成角色（运动学位置刚体 + 胶囊 + 角色控制器）
export function spawnPlayer(x = 0, y = 8, z = 0) {
  if (!world) return;
  if (characterBody) { world.removeRigidBody(characterBody); characterBody = null; }
  characterBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z),
  );
  characterCollider = world.createCollider(
    RAPIER.ColliderDesc.capsule(0.55, 0.35),
    characterBody,
  );
  controller = world.createCharacterController(0.01);
  controller.enableAutostep(0.6, 0.3, true);
  controller.enableSnapToGround(0.3);
  controller.setSlideEnabled(true);
  controller.setUp({ x: 0, y: 1, z: 0 });
  // 关闭控制器自动下滑：滑动完全由下面的坡面重力驱动（否则与手动滑动叠加、且无法限速）
  controller.setMinSlopeSlideAngle(Math.PI / 2);
  verticalVel = 0;
  horizVel = { x: 0, z: 0 };
  grounded = false;
  groundFrictionVal = 1;
  groundNormal = { x: 0, y: 1, z: 0 };
  hasGroundContact = false;
  slideAngle = SLIDE_GROUND;
  groundGrace = 0;
}

// 每帧移动：dirX/dirZ 为世界水平方向（已归一化），speed 为水平速率
export function movePlayer(dt, dirX, dirZ, speed, jump) {
  if (!world || !controller) return;

  // 1. 由脚下摩擦归一化出本帧手感参数（摩擦来自上一帧接触）
  const f = groundFrictionVal;
  const g = 1 - Math.exp(-f * 3);
  const accel = ACCEL_ICE + (ACCEL_GROUND - ACCEL_ICE) * g;
  const decay = DECAY_ICE + (DECAY_GROUND - DECAY_ICE) * g;
  const gs = 1 - Math.exp(-f * 4);
  slideAngle = SLIDE_ICE + (SLIDE_GROUND - SLIDE_ICE) * gs;

  // 2. 输入 / 摩擦对水平速度的作用
  const hasInput = dirX !== 0 || dirZ !== 0;
  if (hasInput) {
    // 有输入：向目标速度平滑逼近（贴地用摩擦决定的 accel，空中用固定 AIR_ACCEL）
    const a = hasGroundContact ? accel : AIR_ACCEL;
    const k = 1 - Math.exp(-a * dt);
    horizVel.x += (dirX * speed - horizVel.x) * k;
    horizVel.z += (dirZ * speed - horizVel.z) * k;
  } else if (hasGroundContact) {
    // 无输入且贴地：按摩擦减速（冰面持续滑行、拖拽感；地面快速刹停）
    const fric = Math.exp(-decay * dt);
    horizVel.x *= fric;
    horizVel.z *= fric;
  }
  // 无输入且空中：保持惯性，水平速度不动（修复「松 W 瞬间停」）

  // 3. 重力坡面分量（贴地且坡够陡时：上坡减速、下坡加速）
  if (hasGroundContact) {
    const ny = groundNormal.y;
    const slope = Math.acos(Math.min(1, Math.max(0, ny))); // 坡角（与水平面夹角）
    if (slope > slideAngle) {
      horizVel.x += G * ny * groundNormal.x * dt;
      horizVel.z += G * ny * groundNormal.z * dt;
    }
  }

  // 4. 水平速度上限（防下坡无限加速）
  const hsp = Math.hypot(horizVel.x, horizVel.z);
  if (hsp > MAX_HORIZ_SPEED) {
    const s = MAX_HORIZ_SPEED / hsp;
    horizVel.x *= s;
    horizVel.z *= s;
  }

  // 5. 垂直重力 + 跳跃（粘滞贴地：离地瞬间保留短暂窗口，避免帧间抖动）
  if (jump && (grounded || groundGrace > 0)) {
    verticalVel = JUMP_SPEED;
    groundGrace = 0; // 起跳后不再享受迟滞，正常受重力
  } else {
    verticalVel += GRAVITY * dt;
  }

  // 6. 组装期望位移，交给控制器解算（只做碰撞/贴地，不做额外加减速）
  const desired = { x: horizVel.x * dt, y: verticalVel * dt, z: horizVel.z * dt };
  controller.computeColliderMovement(characterCollider, desired);
  grounded = controller.computedGrounded();
  if (grounded) {
    verticalVel = 0;
    groundGrace = GROUND_GRACE;
  } else if (groundGrace > 0) {
    // 迟滞期内不累计下落速度：吸收贴地/离地的单帧翻转，消除微抖
    groundGrace -= dt;
    verticalVel = 0;
  }

  // 7. 记录本帧脚下接触（供下一帧使用）
  updateGroundContact();

  // 8. 写入位置
  const m = controller.computedMovement();
  const pos = characterBody.translation();
  characterBody.setNextKinematicTranslation({
    x: pos.x + m.x, y: pos.y + m.y, z: pos.z + m.z,
  });
}

// 探测脚下支撑面：优先用角色控制器的碰撞（能正确处理陡坡），向下射线兜底
function updateGroundContact() {
  if (!world || !controller || !characterBody) { hasGroundContact = false; return; }

  // 主：控制器报告的碰撞里，取法线最朝上的那条（支撑面）
  let bestNy = -Infinity;
  let bestCollider = null;
  let bestNormal = null;
  const count = controller.numComputedCollisions();
  for (let i = 0; i < count; i++) {
    const col = controller.computedCollision(i);
    if (!col || !col.collider) continue;
    const ny = col.normal1.y;
    if (ny > bestNy) { bestNy = ny; bestCollider = col.collider; bestNormal = col.normal1; }
  }
  if (bestNormal && bestNy > GROUND_NY_MIN) {
    applyGroundContact(bestCollider, bestNormal);
    return;
  }

  // 备：向下多点射线（中心 + 半径 0.3 内 4 个偏移点），可靠找到小/边缘表面
  const pos = characterBody.translation();
  const origin = { x: pos.x, y: pos.y - 0.2, z: pos.z };
  const dir = { x: 0, y: -1, z: 0 };
  const offsets = [
    { x: 0, z: 0 },
    { x: 0.3, z: 0 }, { x: -0.3, z: 0 },
    { x: 0, z: 0.3 }, { x: 0, z: -0.3 },
  ];
  let rayBest = null;
  let rayBestNy = -Infinity;
  for (const o of offsets) {
    const ray = new RAPIER.Ray(
      { x: origin.x + o.x, y: origin.y, z: origin.z + o.z },
      dir,
    );
    const hit = world.castRayAndGetNormal(ray, 1.2, true, undefined, undefined, characterCollider);
    if (hit && hit.collider && hit.normal && hit.normal.y > rayBestNy) {
      rayBestNy = hit.normal.y;
      rayBest = hit;
    }
  }
  if (rayBest && rayBestNy > GROUND_NY_MIN) {
    applyGroundContact(rayBest.collider, rayBest.normal);
    return;
  }

  // 无支撑面：仍处于贴地/迟滞则保留上一帧接触，避免单帧探测落空把模型切到「空中」
  if (grounded || groundGrace > 0) return;
  hasGroundContact = false;
}

function applyGroundContact(collider, normal) {
  const f = collider.friction();
  groundFrictionVal = (typeof f === 'number' && f >= 0) ? f : 1;
  const len = Math.hypot(normal.x, normal.y, normal.z) || 1;
  groundNormal = { x: normal.x / len, y: normal.y / len, z: normal.z / len };
  hasGroundContact = true;
}

export function stepWorld(dt) {
  if (world) { world.timestep = dt; world.step(); }
}

export function getPlayerPosition() {
  if (!characterBody) return { x: 0, y: 0, z: 0 };
  const p = characterBody.translation();
  return { x: p.x, y: p.y, z: p.z };
}

export function isGrounded() { return grounded || groundGrace > 0; }

// 当前水平速率（供主循环判定「正在行走」，驱动第一人称相机晃动）
export function getHorizontalSpeed() { return Math.hypot(horizVel.x, horizVel.z); }

export function resetPlayer(x = 0, y = 8, z = 0) {
  if (!characterBody) return;
  characterBody.setTranslation({ x, y, z }, true);
  verticalVel = 0;
  horizVel = { x: 0, z: 0 };
  groundGrace = 0;
}
