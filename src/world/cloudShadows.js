import * as THREE from 'three';
import { CLOUD_DENSITY_GLSL, CLOUD_BOTTOM, CLOUD_TOP, CLOUD_THICKNESS, getCloudNoiseTexture } from './cloudCommon.js';

// 真实地面云影：把「沿太阳方向穿透云层的透射率」渲染进一张低分辨率俯视纹理，
// 再由曲面材质按世界坐标 xz 采样，得到随风移动、随太阳方向偏移的云影。
// 顶点着色器直接把平面几何的局部 x/y 映射为世界 x/z 与 NDC，绕开相机朝向，保证采样方向一致。
export function createCloudShadows(renderer) {
  const BOUNDS = 80;   // 覆盖世界水平 ±BOUNDS
  const SIZE = 128;    // 纹理分辨率（128² 已足够柔和云影，显著降本）

  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
  });

  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.4).normalize() },
    uTime: { value: 0.0 },
    uCoverage: { value: 0.54 },
    uNoiseTex: { value: getCloudNoiseTexture() },
    uNoiseScale: { value: 0.001 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        // 平面局部 x∈[-B,B]→世界 x，局部 y∈[-B,B]→世界 z（平面平放，未旋转）
        vWorldPos = vec3(position.x, 0.0, position.y);
        gl_Position = vec4(position.x / ${BOUNDS}.0, position.y / ${BOUNDS}.0, 0.0, 1.0);
      }`,
    fragmentShader: CLOUD_DENSITY_GLSL + /* glsl */ `
      uniform vec3 uSunDir;
      uniform float uTime;
      uniform float uCoverage;
      varying vec3 vWorldPos;

      void main() {
        vec3 rd = normalize(uSunDir);
        float trans = 1.0;
        // 太阳在地平线以上时，沿太阳方向穿透云层积分透射率
        if (rd.y > 0.02) {
          vec3 wind = vec3(uTime * 0.030, 0.0, uTime * 0.021);
          vec3 ro = vWorldPos; // 地面点 (x,0,z)
          float bottom = ${CLOUD_BOTTOM}.0;
          float thickness = ${CLOUD_THICKNESS}.0;
          float dy = thickness / 12.0;
          float tau = 0.0;
          for (int i = 0; i < 12; i++) {
            float y = bottom + (float(i) + 0.5) * dy;
            float t = (y - ro.y) / rd.y;
            vec3 p = ro + rd * t;
            tau += cloudDensity(p, wind, bottom, thickness, uCoverage) * (dy / rd.y);
          }
          trans = exp(-tau * 0.06);
        }
        gl_FragColor = vec4(vec3(trans), 1.0);
      }`,
    depthWrite: false,
    depthTest: false,
  });

  const plane = new THREE.Mesh(new THREE.PlaneGeometry(BOUNDS * 2, BOUNDS * 2), material);
  plane.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(plane);

  // 只用这个相机触发一次渲染；顶点着色器自行写 gl_Position，忽略其矩阵
  const dummyCamera = new THREE.PerspectiveCamera();

  function render(active, sunDir, time) {
    if (!active) return;
    uniforms.uSunDir.value.copy(sunDir);
    uniforms.uTime.value = time;
    renderer.setRenderTarget(rt);
    renderer.render(scene, dummyCamera);
    renderer.setRenderTarget(null);
  }

  function setCoverage(c) { uniforms.uCoverage.value = c; }

  return { texture: rt.texture, bounds: BOUNDS, render, setCoverage };
}
