import { getSceneState } from './store';

export function triggerBeatHaptic(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const s = getSceneState();
  if (!s.hapticsEnabled || s.reducedMotion) return;
  navigator.vibrate(8);
}

export function triggerLeakHaptic(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const s = getSceneState();
  if (!s.hapticsEnabled || s.reducedMotion) return;
  navigator.vibrate([12, 40, 12]);
}
