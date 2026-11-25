import { createStore } from 'zustand/vanilla';
import type { QualityTier } from './quality';

export type PageMode = 'home' | 'blog' | 'post';

export interface SceneState {
  // Scroll & beat state (0..9)
  scrollProgress: number;
  activeBeat: number;
  beatLabel: string;
  pageMode: PageMode;

  // Interactive & event states
  pointerX: number;
  pointerY: number;
  gyroX: number;
  gyroY: number;
  leakPulse: number; // 0..1 decays over 150ms
  hoverTarget: 'none' | 'firedamp' | 'chrona';
  hoverPulse: number;
  tapTenantBurst: number; // -1 none, 0..2 tenant index

  // Telemetry values (direct textContent writes only)
  tenant: 'A' | 'B' | 'C' | 'A -> B';
  chunkCount: number;
  topK: number;
  cosine: number;
  leaks: number;
  channels: {
    answer: boolean;
    citations: boolean;
    rawApi: boolean;
  };
  sarifVisible: boolean;

  // Runtime & quality tier
  tier: QualityTier;
  manualOptIn: boolean;
  motionPaused: boolean;
  hapticsEnabled: boolean;
  hudPinned: boolean;
  reducedMotion: boolean;
  ready: boolean;
  contextLost: boolean;
  dpr: number;
  isHidden: boolean;
  stageVisible: boolean;
  avgFps: number;
  isPortrait: boolean;
  isLandscapeCompact: boolean;
}

export const sceneStore = createStore<SceneState>(() => ({
  scrollProgress: 0,
  activeBeat: 0,
  beatLabel: 'IDLE LATTICE',
  pageMode: 'home',

  pointerX: 0,
  pointerY: 0,
  gyroX: 0,
  gyroY: 0,
  leakPulse: 0,
  hoverTarget: 'none',
  hoverPulse: 0,
  tapTenantBurst: -1,

  tenant: 'A',
  chunkCount: 1800,
  topK: 5,
  cosine: 0.83,
  leaks: 0,
  channels: {
    answer: false,
    citations: false,
    rawApi: false,
  },
  sarifVisible: false,

  tier: 'mid',
  manualOptIn: false,
  motionPaused: false,
  hapticsEnabled: true,
  hudPinned: false,
  reducedMotion: false,
  ready: false,
  contextLost: false,
  dpr: 1.5,
  isHidden: false,
  stageVisible: true,
  avgFps: 60,
  isPortrait: false,
  isLandscapeCompact: false,
}));

export function getSceneState(): SceneState {
  return sceneStore.getState();
}

export function setSceneState(partial: Partial<SceneState>): void {
  sceneStore.setState(partial);
}
