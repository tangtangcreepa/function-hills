import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

// 月亮圆盘纹理：程序化生成的发光圆（中心亮、边缘淡出），避免依赖外部图片
function makeMoonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(232,240,255,0.95)');
  g.addColorStop(0.6, 'rgba(196,218,255,0.45)');
  g.addColorStop(1, 'rgba(180,205,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// 环境系统：真实天空(Sky)+太阳、昼夜、阴影、雾。
// 编辑模式默认隐藏、可开预览；探索模式始终显示。
export function createEnvironment(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // ---- 真实天空（程序化大气散射 + 太阳圆盘）----
  const sky = new Sky();
  sky.scale.setScalar(900);
  sky.frustumCulled = false;
  group.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 8;
  su.rayleigh.value = 2;
  su.mieCoefficient.value = 0.005;
  su.mieDirectionalG.value = 0.8;

  // ---- 太阳（平行光，可投射阴影）----
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.castShadow = false;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 500;
  const sc = sun.shadow.camera;
  sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.target.position.set(0, 0, 0);
  group.add(sun, sun.target);

  // ---- 月亮（平行光，夜晚投射月光阴影）+ 月亮圆盘 ----
  const moon = new THREE.DirectionalLight(0xbdd4ff, 0.8);
  moon.castShadow = false;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 500;
  const mc = moon.shadow.camera;
  mc.left = -60; mc.right = 60; mc.top = 60; mc.bottom = -60;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.02;
  moon.target.position.set(0, 0, 0);
  group.add(moon, moon.target);

  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeMoonTexture(),
    color: 0xd6e4ff,
    transparent: true,
    depthWrite: false,
  }));
  moonSprite.scale.setScalar(120);
  group.add(moonSprite);

  // ---- 环境光（昼夜变化）----
  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4a52, 0.4);
  group.add(ambient, hemi);

  // ---- 自然雾（指数雾，距离越远越浓）----
  const fog = new THREE.FogExp2(0xcfe0f5, 0.005);

  const params = {
    preview: false,
    timeOfDay: 10,      // 0~24（小时）
    autoFlow: false,    // 昼夜自动流转
    autoFlowSpeed: 0.6, // 小时/秒
    nightLight: 2.0,    // 夜晚亮度（0~3，月光级环境光下限）
    moonlight: 2.0,     // 月光强度（0~3，月亮平行光）
    shadows: false,     // 阴影（性能较重，默认关）
    fogMode: 'none',    // 'none' | 'natural' | 'volumetric'
    fogDensity: 30,     // 0~100
  };

  const sunDirection = new THREE.Vector3();
  const moonDirection = new THREE.Vector3();
  const c1 = new THREE.Color();
  const c2 = new THREE.Color();
  let sunset = 0; // 晚霞强度（太阳接近地平线时最大）

  function daylight() {
    return Math.max(0, Math.sin(Math.PI * (params.timeOfDay - 6) / 12));
  }

  function updateSun() {
    const t = params.timeOfDay;
    // 太阳高度角：6 点升起、12 点最高（约 63°）、18 点落下，夜间为负
    const elev = Math.sin(Math.PI * (t - 6) / 12) * 1.1;
    // 方位角：绕 Y 轴自东向西转一圈
    const az = (t / 24) * Math.PI * 2 - Math.PI / 2;
    sunDirection.set(
      Math.cos(elev) * Math.cos(az),
      Math.sin(elev),
      Math.cos(elev) * Math.sin(az),
    ).normalize();
    sun.position.copy(sunDirection).multiplyScalar(150);
    // 太阳盘与天空散射随太阳高度角自然平滑衰减（Sky 内置曙光余晖），
    // 黄昏/黎明平滑过渡，不再硬切瞬间变黑。
    su.sunPosition.value.copy(sunDirection);

    const d = daylight();
    sun.intensity = d * 1.5;
    // 日出日落偏暖、正午偏白
    sun.color.copy(c1.set(0xffb366).lerp(c2.set(0xffffff), Math.min(1, d * 2.2)));
    // 晚霞强度：太阳仍在地平线上方时随高度角下降先增强、临近落山时平滑退去，
    // 到太阳消失（elev=0）时恰为 0 —— 云恰好过渡到夜晚灰蓝，既不突变也不过晚。
    sunset = Math.max(0, 4 * (elev / 0.3) * (1 - elev / 0.3));
    ambient.intensity = 0.12 * params.nightLight + d * 0.34;
    hemi.intensity = 0.16 * params.nightLight + d * 0.37;
    hemi.color.copy(c1.set(0x1b2a4a).lerp(c2.set(0xbfd8ff), d));

    // 月亮：与太阳相对（太阳落山月亮升起），夜晚发光
    const moonAz = az + Math.PI;
    const moonElev = -elev;
    moonDirection.set(
      Math.cos(moonElev) * Math.cos(moonAz),
      Math.sin(moonElev),
      Math.cos(moonElev) * Math.sin(moonAz),
    ).normalize();
    moon.position.copy(moonDirection).multiplyScalar(150);
    moonSprite.position.copy(moonDirection).multiplyScalar(780);

    const moonD = Math.max(0, Math.sin(moonElev)); // 月亮高度角正弦，0~1
    moon.intensity = params.moonlight * moonD * 0.4;
    moon.castShadow = params.shadows && moonD > 0.001;
    moonSprite.visible = moonD > 0.02;
    moonSprite.material.opacity = Math.min(1, moonD * 4);
  }

  function fogColor() {
    return c1.set(0xcfe0f5).lerp(c2.set(0x22304a), 1 - daylight());
  }

  function updateFog() {
    const on = params.fogMode === 'natural' || params.fogMode === 'volumetric';
    if (on) {
      fog.density = (params.fogDensity / 100) * 0.03;
      fog.color.copy(fogColor());
      scene.fog = fog;
    } else {
      scene.fog = null;
    }
  }

  function apply() {
    updateSun();
    updateFog();
  }

  function setVisible(v) {
    group.visible = v;
    if (v) updateFog();
    else scene.fog = null;
  }

  // 太阳阴影覆盖范围随视距调整（至少 ±50，保证大视距时阴影仍能覆盖整个函数）
  function setSunShadowBounds(half) {
    const h = Math.max(50, half);
    sc.left = -h; sc.right = h; sc.top = h; sc.bottom = -h;
    sc.updateProjectionMatrix();
  }

  // 画质档位：调整太阳/月亮阴影贴图分辨率（low=true 低配 1024/512，false 中/高 2048/1024）
  function setShadowQuality(low) {
    sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
    moon.shadow.mapSize.set(low ? 512 : 1024, low ? 512 : 1024);
    // 阴影已开启时释放旧贴图，强制按新尺寸重建
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
  }

  // 每帧调用：推进自动流转
  function update(dt) {
    if (params.autoFlow) {
      params.timeOfDay = (params.timeOfDay + dt * params.autoFlowSpeed) % 24;
      apply();
    }
  }

  apply();
  return { params, apply, setVisible, update, sun, sunDirection, daylight, sunColor: sun.color, sunset: () => sunset, setSunShadowBounds, setShadowQuality };
}
