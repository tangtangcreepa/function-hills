export const MODE = { EDIT: 'edit', EXPLORE: 'explore', LEVEL: 'level' };

let mode = MODE.EDIT;
const listeners = [];

export function getMode() { return mode; }

export function setMode(m) {
  if (m === mode) return;
  mode = m;
  listeners.forEach(fn => fn(m));
}

export function onModeChange(fn) { listeners.push(fn); }
