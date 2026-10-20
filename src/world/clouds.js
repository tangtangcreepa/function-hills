import * as THREE from 'three';
import { CLOUD_DENSITY_GLSL, CLOUD_BOTTOM, CLOUD_TOP, getCloudNoiseTexture } from './cloudCommon.js';

// 体积云：覆盖天空的大球（BackSide），用光线步进（raymarching）在水平云带内
// 采样预生成 3D 噪波贴图（2 层），得到有体积感的云朵；随太阳方向/昼夜变化颜色。
// v5（iterationT 风格，帧率优先）：预计算噪波贴图替代程序化 fbm、单次散射 + 2 步自阴影、
// 少迭代层，允许带状条纹/远处模糊等轻微瑕疵。
export function createClouds(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const params = {
    enabled: false,   // 体积云开关（默认关，较重）
    flowSpeed: 0.5,   // 云流速（时间推进倍率，0~2）
    samples: 14,      // 采样步数（8~40，越大越清晰越耗性能）
    coverage: 0.54,   // 云覆盖率阈值（越小云越密），由「云密度」滑杆映射而来
  };

  const uniforms = {
    uCamPos: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.4).normalize() },
    uTime: { value: 0.0 },
    uSteps: { value: params.samples },
    uDensity: { value: 0.6 },
    uCoverage: { value: 0.54 },
    uDaylight: { value: 1.0 },
    uSunColor: { value: new THREE.Color(0xffffff) },
    uSunsetAmount: { value: 0.0 },
    uNoiseTex: { value: getCloudNoiseTexture() },
    uNoiseScale: { value: 0.001 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: CLOUD_DENSITY_GLSL + /* glsl */ `
      uniform vec3 uCamPos;
      uniform vec3 uSunDir;
      uniform float uTime;
      uniform float uSteps;
      uniform float uDensity;
      uniform float uCoverage;
      uniform float uDaylight;
      uniform vec3 uSunColor;
      uniform float uSunsetAmount;
      varying vec3 vWorldPos;

      void main() {
        vec3 ro = uCamPos;
        vec3 rd = normalize(vWorldPos - uCamPos);

        // 只渲染朝上的光线（否则露出天空）
        if (rd.y <= 0.0) discard;

        float bottom = ${CLOUD_BOTTOM}.0;
        float top = ${CLOUD_TOP}.0;
        float thickness = top - bottom;

        float t0 = (bottom - ro.y) / rd.y;
        float t1 = (top - ro.y) / rd.y;
        t0 = max(t0, 0.0);
        t1 = min(t1, 1600.0);
        if (t1 <= t0) discard;

        int steps = int(uSteps);
        float dt = (t1 - t0) / float(steps);

        vec3 wind = vec3(uTime * 0.030, 0.0, uTime * 0.021);

        float acc = 0.0;
        float lightAcc = 0.0;
        vec3 sun = normalize(uSunDir);
        float day = sun.y > 0.02 ? 1.0 : 0.0; // 太阳在地平线以上才做自阴影

        for (int i = 0; i < 64; i++) {
          if (i >= steps) break;
          float t = t0 + (float(i) + 0.5) * dt;
          vec3 p = ro + rd * t;

          float dens = cloudDensity(p, wind, bottom, thickness, uCoverage);

          if (dens > 0.001) {
            acc += dens * dt;
            // 自阴影：向太阳方向 1 次短程采样（原 2 次），省一半采样开销
            float trans = 1.0;
            if (day > 0.5) {
              vec3 sp = p + sun * 12.0;
              float tau = cloudDensity(sp, wind, bottom, thickness, uCoverage) * 12.0;
              trans = exp(-tau * 0.20);
            }
            lightAcc += dens * trans * dt;
            // 已经近不透明就提前结束，不再往云深处多采（省性能）
            if (acc * uDensity * 0.03 > 5.0) break;
          }
        }

        float density = acc * uDensity * 0.03;
        float alpha = 1.0 - exp(-density);
        if (alpha < 0.004) discard;

        vec3 dayCol = vec3(1.5, 1.5, 1.5);
        vec3 nightCol = vec3(0.10, 0.13, 0.20);
        // 白天快速转白（smoothstep，避免早晨/傍晚因 uDaylight 线性下降而发灰）
        float dayF = smoothstep(0.0, 0.2, uDaylight);
        vec3 base = mix(nightCol, dayCol, dayF);
        // 晚霞：低太阳高度角时向太阳暖色过渡
        base = mix(base, uSunColor * 1.6, uSunsetAmount);

        float shade = day > 0.5 ? clamp(lightAcc / max(acc, 1e-4), 0.0, 1.0) : 0.5;
        vec3 col = base * (0.35 + 0.9 * shade);

        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(850, 48, 24), material);
  mesh.frustumCulled = false;
  group.add(mesh);

  function apply() {
    mesh.visible = params.enabled;
    uniforms.uSteps.value = params.samples;
    uniforms.uCoverage.value = params.coverage;
  }

  function setVisible(v) {
    group.visible = v;
  }

  function update(dt, camPos, sunDir, daylight, sunColor, sunsetAmount) {
    if (params.enabled) uniforms.uTime.value += dt * params.flowSpeed;
    uniforms.uCamPos.value.copy(camPos);
    uniforms.uSunDir.value.copy(sunDir);
    uniforms.uDaylight.value = daylight;
    if (sunColor) uniforms.uSunColor.value.copy(sunColor);
    uniforms.uSunsetAmount.value = sunsetAmount || 0.0;
  }

  apply();
  return { params, apply, setVisible, update, getTime: () => uniforms.uTime.value };
}
