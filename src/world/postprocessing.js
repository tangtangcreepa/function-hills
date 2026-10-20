import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// 体积雾「光束」：向太阳方向做屏幕空间径向累积，产生柔和光柱/光晕。
// 修复：宽高比校正（光晕呈正圆）+ 边缘淡出 + 软上限 + 减采样（防条纹、防卡顿）。
const LightShaftShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.8) },
    uWeight: { value: 0.08 },
    uFalloff: { value: 3.5 },
    uAspect: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSun;
    uniform float uWeight;
    uniform float uFalloff;
    uniform float uAspect;
    varying vec2 vUv;

    void main() {
      // 宽高比校正后的距离，保证光晕在屏幕上呈正圆
      vec2 d = vec2(vUv.x * uAspect, vUv.y) - vec2(uSun.x * uAspect, uSun.y);
      float dist = length(d);

      // 柔和的高斯光晕（解析式，天然平滑，无环、无条纹）
      float glow = exp(-dist * dist * uFalloff) * uWeight;

      // 屏幕边缘淡出
      vec2 edge = smoothstep(0.0, 0.15, vUv) * smoothstep(0.0, 0.15, 1.0 - vUv);
      glow *= edge.x * edge.y;

      vec4 color = texture2D(tDiffuse, vUv);
      color.rgb += vec3(glow);

      gl_FragColor = vec4(color.rgb, 1.0);
    }`,
};

export function createPostprocessing(renderer, scene, camera, bloomState) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.8, 0.4, 0.85);
  bloomPass.enabled = false;
  composer.addPass(bloomPass);

  const shaftPass = new ShaderPass(LightShaftShader);
  shaftPass.enabled = false;
  composer.addPass(shaftPass);

  composer.addPass(new OutputPass());

  // 外部可传入纯数据对象作为 bloom 状态源（懒初始化时供 needPost 判定用）
  const bloom = bloomState || { enabled: false, strength: 0.8, threshold: 0.85, radius: 0.4 };

  function applyBloom() {
    bloomPass.enabled = bloom.enabled;
    bloomPass.strength = bloom.strength;
    bloomPass.threshold = bloom.threshold;
    bloomPass.radius = bloom.radius;
  }

  const camForward = new THREE.Vector3();
  const sunWorld = new THREE.Vector3();
  const sp = new THREE.Vector3();

  // active = 是否处于体积雾模式；每帧更新太阳屏幕位置与光束强度
  function updateSun(direction, fogDensity, active) {
    shaftPass.enabled = !!active;
    if (!active) return;
    // 太阳接近地平线时，光束平滑淡出（高度角 y 从 0 降到 -0.06 期间 1→0）
    const fade = THREE.MathUtils.clamp(direction.y / 0.06 + 1.0, 0.0, 1.0);
    if (fade <= 0.0) {
      shaftPass.uniforms.uWeight.value = 0.0;
      return;
    }
    camera.getWorldDirection(camForward);
    if (camForward.dot(direction) > 0.05) {
      sunWorld.copy(camera.position).addScaledVector(direction, 1000);
      sp.copy(sunWorld).project(camera);
      shaftPass.uniforms.uSun.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
      shaftPass.uniforms.uWeight.value = (0.05 + (fogDensity / 100) * 0.25) * fade;
      shaftPass.uniforms.uFalloff.value = 3.5;
    } else {
      shaftPass.uniforms.uWeight.value = 0.0;
    }
  }

  function setSize(w, h) {
    composer.setSize(w, h);
    shaftPass.uniforms.uAspect.value = w / h;
  }

  function render() { composer.render(); }

  const size = new THREE.Vector2();
  renderer.getSize(size);
  setSize(size.x, size.y);
  applyBloom();

  return { updateSun, setSize, render, bloom, applyBloom };
}
