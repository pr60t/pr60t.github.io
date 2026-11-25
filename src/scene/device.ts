export interface NetworkInfo {
  readonly effectiveType?: string;
  readonly saveData?: boolean;
}

export interface BatteryManagerLike {
  readonly level: number;
  readonly charging: boolean;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

export interface DeviceSnapshot {
  readonly hasWebGL2: boolean;
  readonly deviceMemory: number;
  readonly hardwareConcurrency: number;
  readonly saveData: boolean;
  readonly effectiveType: string;
  readonly reducedMotion: boolean;
  readonly reducedData: boolean;
  readonly isPortrait: boolean;
  readonly isLandscapeCompact: boolean;
  readonly isFoldableDualPane: boolean;
}

export function checkWebGL2(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

export function getNetworkInfo(): NetworkInfo {
  if (typeof navigator === 'undefined') return {};
  const nav = navigator as Navigator & { connection?: NetworkInfo };
  return nav.connection ?? {};
}

export function isPortraitViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerHeight > window.innerWidth;
}

export function isLandscapeCompactViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth > window.innerHeight && window.innerHeight < 500;
}

export function isFoldableDualPane(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(horizontal-viewport-segments: 2)').matches;
}

export function getDeviceSnapshot(): DeviceSnapshot {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
  const conn = getNetworkInfo();
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reducedData =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-data: reduce)').matches;

  return {
    hasWebGL2: checkWebGL2(),
    deviceMemory: nav?.deviceMemory ?? 4,
    hardwareConcurrency: nav?.hardwareConcurrency ?? 4,
    saveData: Boolean(conn.saveData),
    effectiveType: conn.effectiveType ?? '4g',
    reducedMotion,
    reducedData,
    isPortrait: isPortraitViewport(),
    isLandscapeCompact: isLandscapeCompactViewport(),
    isFoldableDualPane: isFoldableDualPane(),
  };
}

export async function getBatteryState(): Promise<{ lowBattery: boolean; manager: BatteryManagerLike | null }> {
  if (typeof navigator === 'undefined') return { lowBattery: false, manager: null };
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
  if (typeof nav.getBattery !== 'function') return { lowBattery: false, manager: null };
  try {
    const manager = await nav.getBattery();
    return {
      lowBattery: !manager.charging && manager.level < 0.2,
      manager,
    };
  } catch {
    return { lowBattery: false, manager: null };
  }
}
