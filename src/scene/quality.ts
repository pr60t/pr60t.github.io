import { getGPUTier } from 'detect-gpu';
import { getBatteryState, getDeviceSnapshot } from './device';

export type QualityTier = 'high' | 'mid' | 'low' | 'static';
export type PostMode = 'bloom-vignette' | 'fake-bloom' | 'none';
export type FragmentPrecision = 'highp' | 'mediump';

export interface QualitySpec {
  readonly tier: QualityTier;
  readonly points: number;
  readonly dprCap: number;
  readonly postprocessing: PostMode;
  readonly antialias: boolean;
  readonly fragmentPrecision: FragmentPrecision;
  readonly frameCap: number;
  readonly pointScale: number;
}

export const QUALITY_SPECS: Record<QualityTier, QualitySpec> = {
  high: {
    tier: 'high',
    points: 3500,
    dprCap: 2,
    postprocessing: 'bloom-vignette',
    antialias: true,
    fragmentPrecision: 'highp',
    frameCap: 60,
    pointScale: 1.0,
  },
  mid: {
    tier: 'mid',
    points: 1800,
    dprCap: 1.5,
    postprocessing: 'fake-bloom',
    antialias: false,
    fragmentPrecision: 'mediump',
    frameCap: 60,
    pointScale: 0.9,
  },
  low: {
    tier: 'low',
    points: 900,
    dprCap: 1,
    postprocessing: 'none',
    antialias: false,
    fragmentPrecision: 'mediump',
    frameCap: 45,
    pointScale: 0.72,
  },
  static: {
    tier: 'static',
    points: 0,
    dprCap: 1,
    postprocessing: 'none',
    antialias: false,
    fragmentPrecision: 'mediump',
    frameCap: 0,
    pointScale: 0,
  },
};

export function stepDownTier(tier: QualityTier): QualityTier {
  if (tier === 'high') return 'mid';
  if (tier === 'mid') return 'low';
  return 'low';
}

export function stepUpTier(tier: QualityTier): QualityTier {
  if (tier === 'low') return 'mid';
  if (tier === 'mid') return 'high';
  return tier;
}

export async function detectInitialTier(forceOptIn = false): Promise<{
  tier: QualityTier;
  spec: QualitySpec;
  reason: string;
}> {
  const snap = getDeviceSnapshot();

  if (!snap.hasWebGL2) {
    return { tier: 'static', spec: QUALITY_SPECS.static, reason: 'no-webgl2' };
  }

  if (!forceOptIn) {
    const slowNet = snap.effectiveType === '2g' || snap.effectiveType === '3g' || snap.effectiveType === 'slow-2g';
    if (snap.saveData || snap.reducedData || slowNet) {
      return { tier: 'static', spec: QUALITY_SPECS.static, reason: 'metered-or-savedata' };
    }
    if (snap.reducedMotion) {
      return { tier: 'static', spec: QUALITY_SPECS.static, reason: 'reduced-motion' };
    }
  }

  let gpuTierNum = 2;
  try {
    const gpu = await getGPUTier();
    gpuTierNum = gpu.tier;
  } catch {
    gpuTierNum = 1;
  }

  if (gpuTierNum === 0 && !forceOptIn) {
    return { tier: 'static', spec: QUALITY_SPECS.static, reason: 'gpu-tier-0' };
  }

  let tier: QualityTier = 'mid';
  if (gpuTierNum >= 3 && snap.deviceMemory >= 6 && snap.hardwareConcurrency >= 6) {
    tier = 'high';
  } else if (gpuTierNum <= 1 || snap.deviceMemory <= 4 || snap.hardwareConcurrency <= 4) {
    tier = 'low';
  }

  const { lowBattery } = await getBatteryState();
  if (lowBattery) {
    tier = stepDownTier(tier);
  }

  return {
    tier,
    spec: QUALITY_SPECS[tier],
    reason: lowBattery ? 'battery-saver' : `gpu-${gpuTierNum}`,
  };
}

/**
 * Adaptive frame-time governor using a fixed-length ring buffer.
 * - Drops one tier if avg FPS < 45 for 2s (DPR -> points -> effects via tier spec).
 * - Steps up only after 10s of stable headroom, max once per 30s.
 * - Caps at 30fps after 6s idle on hero, wakes on input.
 */
export class FrameGovernor {
  private readonly samples = new Float32Array(120);
  private sampleIdx = 0;
  private sampleCount = 0;
  private belowThresholdMs = 0;
  private aboveHeadroomMs = 0;
  private lastStepChangeAt = 0;
  private lastInputAt = performance.now();
  private currentTier: QualityTier;
  private dprReduced = false;

  constructor(initialTier: QualityTier) {
    this.currentTier = initialTier;
  }

  public setTier(tier: QualityTier): void {
    this.currentTier = tier;
    this.belowThresholdMs = 0;
    this.aboveHeadroomMs = 0;
    this.dprReduced = false;
  }

  public notifyInput(now = performance.now()): void {
    this.lastInputAt = now;
  }

  public getTargetFps(now = performance.now(), isHero = true): number {
    const baseCap = QUALITY_SPECS[this.currentTier].frameCap;
    if (baseCap === 0) return 0;
    if (isHero && now - this.lastInputAt > 6000) {
      return Math.min(baseCap, 30);
    }
    return baseCap;
  }

  public recordFrame(
    deltaMs: number,
    now = performance.now()
  ): { nextTier: QualityTier; nextDprCap: number; avgFps: number; changed: boolean } {
    if (this.currentTier === 'static') {
      return { nextTier: 'static', nextDprCap: 1, avgFps: 0, changed: false };
    }

    const clamped = Math.min(200, Math.max(4, deltaMs));
    this.samples[this.sampleIdx] = clamped;
    this.sampleIdx = (this.sampleIdx + 1) % this.samples.length;
    if (this.sampleCount < this.samples.length) this.sampleCount += 1;

    let sum = 0;
    for (let i = 0; i < this.sampleCount; i += 1) {
      sum += this.samples[i]!;
    }
    const avgMs = sum / Math.max(1, this.sampleCount);
    const avgFps = 1000 / avgMs;

    let changed = false;

    if (avgFps < 45) {
      this.belowThresholdMs += clamped;
      this.aboveHeadroomMs = 0;

      if (this.belowThresholdMs >= 2000) {
        this.belowThresholdMs = 0;
        if (!this.dprReduced && QUALITY_SPECS[this.currentTier].dprCap > 1) {
          // Step 1: lower DPR first before dropping point count/effects
          this.dprReduced = true;
          this.lastStepChangeAt = now;
          changed = true;
        } else if (this.currentTier !== 'low') {
          this.currentTier = stepDownTier(this.currentTier);
          this.dprReduced = false;
          this.lastStepChangeAt = now;
          changed = true;
        }
      }
    } else if (avgFps >= 55) {
      this.belowThresholdMs = 0;
      this.aboveHeadroomMs += clamped;

      if (
        this.aboveHeadroomMs >= 10000 &&
        now - this.lastStepChangeAt >= 30000
      ) {
        this.aboveHeadroomMs = 0;
        if (this.dprReduced) {
          this.dprReduced = false;
          this.lastStepChangeAt = now;
          changed = true;
        } else if (this.currentTier !== 'high') {
          this.currentTier = stepUpTier(this.currentTier);
          this.lastStepChangeAt = now;
          changed = true;
        }
      }
    } else {
      this.belowThresholdMs = Math.max(0, this.belowThresholdMs - clamped * 0.5);
      this.aboveHeadroomMs = 0;
    }

    const baseDpr = QUALITY_SPECS[this.currentTier].dprCap;
    const nextDprCap = this.dprReduced ? Math.max(1, baseDpr - 0.5) : baseDpr;

    return {
      nextTier: this.currentTier,
      nextDprCap,
      avgFps: Math.round(avgFps),
      changed,
    };
  }
}
