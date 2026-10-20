import * as THREE from 'three';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;
  renderer.setPixelRatio(1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  return scene;
}

export function createCamera(container) {
  const camera = new THREE.PerspectiveCamera(
    70,
    container.clientWidth / container.clientHeight,
    0.1,
    2000,
  );
  camera.position.set(0, 12, 24);
  return camera;
}

// 地面参考网格与坐标轴（编辑模式可见）
export function createGrid(scene) {
  const grid = new THREE.GridHelper(40, 40, 0xcccccc, 0xe8e8e8);
  grid.position.y = -0.01;
  const axes = new THREE.AxesHelper(4);
  scene.add(grid, axes);
  return { grid, axes };
}
