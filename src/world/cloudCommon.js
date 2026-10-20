import * as THREE from 'three';

// 体积云共享的着色器片段与常量（可见云与云影共用，保证两者对齐）
// v5：噪波改为预生成 3D 噪波贴图（Data3DTexture），片元里 2 层采样，去掉程序化 fbm。
export const CLOUD_BOTTOM = 220;
export const CLOUD_TOP = 430;
export const CLOUD_THICKNESS = CLOUD_TOP - CLOUD_BOTTOM;

// 云密度：采样预生成 3D 噪波贴图，用「天气图（低频）→ 云团（中低频）→ 高频侵蚀」三层
// 结构得到团状、不均匀分布的云。可见云、云影共用同一张贴图与同一函数保证对齐。
// 注意 uNoiseScale 决定「1 个纹素 = 1/(64·scale) 世界单位」，值噪声团块约 1~2 纹素，
// 因此 scale 必须足够小（约 0.001），团块才有 15~30 世界单位、在远处也看得见。
export const CLOUD_DENSITY_GLSL = /* glsl */ `
  uniform sampler3D uNoiseTex;
  uniform float uNoiseScale;
  float cloudDensity(vec3 p, vec3 wind, float bottom, float thickness, float coverage) {
    float h = clamp((p.y - bottom) / thickness, 0.0, 1.0);

    vec3 q = p * uNoiseScale + vec3(wind.x, 0.0, wind.z);

    // 天气图（大尺度）：让天空分出「多云区」与「晴空区」
    float weather = texture(uNoiseTex, q * 0.22 + vec3(2.3, 6.1, 4.7)).r;

    // 团块外形 fbm（2 层）：大团 + 中团叠加，多尺度结构打破单一均匀感
    float n1 = texture(uNoiseTex, q).r;
    float n2 = texture(uNoiseTex, q * 2.4 + vec3(7.1, 2.9, 5.3)).r;
    float shape = n1 * 0.62 + n2 * 0.38;

    // 覆盖率随天气图大幅浮动：晴空区几乎无云、多云区成片成团
    float thr = mix(coverage + 0.30, coverage - 0.22, weather);
    float cloud = smoothstep(thr, thr + 0.08, shape);

    // 晴空区直接返回 0，省掉后面 puff/detail 两次采样（大范围天空命中，省性能）
    if (cloud < 0.002) return 0.0;

    // 团块顶（低频）：决定每朵云顶的高低，形成鼓起的圆顶（积云感）
    float puff = texture(uNoiseTex, q * 1.6 + vec3(5.4, 1.2, 8.9)).r;

    // 细节（高频）：侵蚀边缘出絮状，也让云身内部有疏密
    float detail = texture(uNoiseTex, q * 3.2 + vec3(9.7, 3.3, 7.1)).r;

    // 高度轮廓：底部收口快（云底平）、顶部随 puff 鼓起成圆顶，各朵高低错落
    float top = 0.45 + (puff - 0.5) * 0.75;   // 云顶约 0.08~0.83
    float heightProfile = smoothstep(0.0, 0.08, h) * smoothstep(top + 0.14, top, h);

    // 内部蓬松：细节噪声让云身内部有疏密，而非实心均匀块
    float billow = smoothstep(0.30, 0.80, detail);

    return cloud * heightProfile * (0.3 + 0.7 * billow);
  }
`;

// 预生成 3D 值噪声贴图（64³，单通道随机值，硬件三线性插值即平滑值噪声）。
// 单例缓存：可见云与云影共用同一张，保证两者形状对齐。
let _noiseTex = null;
export function getCloudNoiseTexture() {
  if (_noiseTex) return _noiseTex;
  const size = 64;
  const data = new Uint8Array(size * size * size * 4);
  for (let i = 0; i < size * size * size; i++) {
    const v = (Math.random() * 255) | 0;
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = v;
  }
  _noiseTex = new THREE.Data3DTexture(data, size, size, size);
  _noiseTex.format = THREE.RGBAFormat;
  _noiseTex.type = THREE.UnsignedByteType;
  _noiseTex.minFilter = THREE.LinearFilter;
  _noiseTex.magFilter = THREE.LinearFilter;
  _noiseTex.wrapS = THREE.RepeatWrapping;
  _noiseTex.wrapT = THREE.RepeatWrapping;
  _noiseTex.wrapR = THREE.RepeatWrapping;
  _noiseTex.needsUpdate = true;
  return _noiseTex;
}
