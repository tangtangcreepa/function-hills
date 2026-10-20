// 图像材质面板：颜色/金属/糙度/荧光/折射/不透明度，改动即回调
// 返回 setValues / setTitle，用于选中不同图像时同步面板
export function initMaterialPanel({ onChange }) {
  const titleEl = document.getElementById('mat-title');
  const saveDefaultBtn = document.getElementById('mat-save-default');
  const els = {
    color: document.getElementById('mat-color'),
    metalness: document.getElementById('mat-metalness'),
    roughness: document.getElementById('mat-roughness'),
    emissiveIntensity: document.getElementById('mat-emissive'),
    emissiveColor: document.getElementById('mat-emissive-color'),
    transmission: document.getElementById('mat-transmission'),
    ior: document.getElementById('mat-ior'),
    opacity: document.getElementById('mat-opacity'),
    friction: document.getElementById('mat-friction'),
  };

  function collect() {
    return {
      color: els.color.value,
      metalness: Number(els.metalness.value) / 100,
      roughness: Number(els.roughness.value) / 100,
      emissiveIntensity: Number(els.emissiveIntensity.value) / 100,
      emissiveColor: els.emissiveColor.value,
      transmission: Number(els.transmission.value) / 100,
      ior: Number(els.ior.value) / 100,
      opacity: Number(els.opacity.value) / 100,
      friction: Math.tan((Number(els.friction.value) / 100) * 1.5237),
    };
  }

  const fire = () => onChange(collect());

  Object.values(els).forEach(el => el.addEventListener('input', fire));

  // 把当前材质存为默认，之后新增图像自动套用（main.js 的 addSurface 读取）
  function saveDefaults() {
    try {
      localStorage.setItem('function-hills-mat-defaults', JSON.stringify(collect()));
      saveDefaultBtn.textContent = '已保存 ✓';
      setTimeout(() => { saveDefaultBtn.textContent = '保存为默认材质'; }, 1500);
    } catch {
      saveDefaultBtn.textContent = '保存失败';
    }
  }
  saveDefaultBtn.addEventListener('click', saveDefaults);

  function setValues(p) {
    els.color.value = p.color;
    els.metalness.value = String(Math.round(p.metalness * 100));
    els.roughness.value = String(Math.round(p.roughness * 100));
    els.emissiveIntensity.value = String(Math.round(p.emissiveIntensity * 100));
    els.emissiveColor.value = p.emissiveColor;
    els.transmission.value = String(Math.round(p.transmission * 100));
    els.ior.value = String(Math.round(p.ior * 100));
    els.opacity.value = String(Math.round(p.opacity * 100));
    els.friction.value = String(Math.round(Math.atan((p.friction ?? 1)) / 1.5237 * 100));
  }

  function setTitle(name) {
    titleEl.textContent = name || '—';
  }

  return { setValues, setTitle };
}
