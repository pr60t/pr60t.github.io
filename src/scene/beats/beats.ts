import * as THREE from 'three';

export interface BeatMeta {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly label: string;
}

export const BEATS: readonly BeatMeta[] = [
  { index: 0, start: 0.0, end: 0.12, label: 'IDLE LATTICE' },
  { index: 1, start: 0.12, end: 0.22, label: '01 / INGEST' },
  { index: 2, start: 0.22, end: 0.34, label: '02 / EMBED' },
  { index: 3, start: 0.34, end: 0.46, label: '03 / RETRIEVE' },
  { index: 4, start: 0.46, end: 0.57, label: '04 / PLANT' },
  { index: 5, start: 0.57, end: 0.68, label: '05 / PROBE' },
  { index: 6, start: 0.68, end: 0.79, label: '06 / DETECT' },
  { index: 7, start: 0.79, end: 0.88, label: '07 / REPORT' },
  { index: 8, start: 0.88, end: 0.95, label: 'CALM / FIELD NOTES' },
  { index: 9, start: 0.95, end: 1.0, label: '08 / OPEN CHANNEL' },
];

export function resolveBeat(progress: number): BeatMeta {
  const p = Math.min(1, Math.max(0, progress));
  for (let i = BEATS.length - 1; i >= 0; i -= 1) {
    const b = BEATS[i]!;
    if (p >= b.start) return b;
  }
  return BEATS[0]!;
}

/** Deterministic Mulberry32 PRNG */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TENANT_X = [-3.9, 0.0, 3.9] as const;
export const TENANT_PORTRAIT_Y = [2.7, 0.0, -2.7] as const;

export interface PointCloudData {
  readonly count: number;
  readonly positions: Float32Array;
  readonly clusterPositions: Float32Array;
  readonly tenants: Float32Array;
  readonly seeds: Float32Array;
  readonly states: Float32Array;
  readonly topKPositions: Float32Array; // 5 * 2 * 3 floats for LineSegments
  readonly contextNode: THREE.Vector3;
}

export function buildPointCloudData(totalPoints: number): PointCloudData {
  const rng = createRng(0x607a11);
  const positions = new Float32Array(totalPoints * 3);
  const clusterPositions = new Float32Array(totalPoints * 3);
  const tenants = new Float32Array(totalPoints);
  const seeds = new Float32Array(totalPoints);
  const states = new Float32Array(totalPoints);

  // 4 semantic cluster centroids per tenant inside [-1.15, 1.15]^3
  const centroids: Array<Array<[number, number, number]>> = [0, 1, 2].map(() =>
    Array.from({ length: 4 }, () => [
      (rng() - 0.5) * 1.9,
      (rng() - 0.5) * 1.9,
      (rng() - 0.5) * 1.9,
    ])
  );

  const contextNode = new THREE.Vector3(-3.9, 0.2, 0.25);
  const tenantACandidates: Array<{ idx: number; distSq: number; x: number; y: number; z: number }> = [];

  for (let i = 0; i < totalPoints; i += 1) {
    const tenant = i % 3;
    const baseX = TENANT_X[tenant]!;
    tenants[i] = tenant;
    seeds[i] = rng();

    // Grid-like initial ingest position
    const gx = ((rng() - 0.5) * 2.4) + baseX;
    const gy = (rng() - 0.5) * 2.4;
    const gz = (rng() - 0.5) * 2.4;
    positions[i * 3] = gx;
    positions[i * 3 + 1] = gy;
    positions[i * 3 + 2] = gz;

    // Semantic cluster position
    const cluster = centroids[tenant]![i % 4]!;
    const cx = baseX + cluster[0] + (rng() - 0.5) * 0.65;
    const cy = cluster[1] + (rng() - 0.5) * 0.65;
    const cz = cluster[2] + (rng() - 0.5) * 0.65;
    clusterPositions[i * 3] = cx;
    clusterPositions[i * 3 + 1] = cy;
    clusterPositions[i * 3 + 2] = cz;

    // Mark a subset of Tenant A points near the right wall as leak-capable
    if (tenant === 0 && cx > baseX + 0.55 && i % 7 === 0) {
      states[i] = 1.0;
    } else {
      states[i] = 0.0;
    }

    if (tenant === 0) {
      const dx = cx - contextNode.x;
      const dy = cy - contextNode.y;
      const dz = cz - contextNode.z;
      tenantACandidates.push({ idx: i, distSq: dx * dx + dy * dy + dz * dz, x: cx, y: cy, z: cz });
    }
  }

  // Compute top-k (k=5) nearest neighbors ONCE at setup
  tenantACandidates.sort((a, b) => a.distSq - b.distSq);
  const k = 5;
  const topKPositions = new Float32Array(k * 2 * 3);
  for (let j = 0; j < k; j += 1) {
    const c = tenantACandidates[j] ?? { x: contextNode.x, y: contextNode.y, z: contextNode.z };
    const offset = j * 6;
    topKPositions[offset] = contextNode.x;
    topKPositions[offset + 1] = contextNode.y;
    topKPositions[offset + 2] = contextNode.z;
    topKPositions[offset + 3] = c.x;
    topKPositions[offset + 4] = c.y;
    topKPositions[offset + 5] = c.z;
  }

  return {
    count: totalPoints,
    positions,
    clusterPositions,
    tenants,
    seeds,
    states,
    topKPositions,
    contextNode,
  };
}

export function createCameraRail(): {
  positionCurve: THREE.CatmullRomCurve3;
  lookAtCurve: THREE.CatmullRomCurve3;
} {
  const positionCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(2.2, 1.1, 12.2), // Beat 0: Hero right-shifted lattice
    new THREE.Vector3(-2.6, 0.7, 7.6), // Beat 1: Ingest into Tenant A
    new THREE.Vector3(-3.4, 1.3, 8.2), // Beat 2: Embed clusters
    new THREE.Vector3(-3.2, 0.4, 6.8), // Beat 3: Retrieve top-k
    new THREE.Vector3(-2.4, 0.5, 6.4), // Beat 4: Plant canary in A
    new THREE.Vector3(-1.4, 0.6, 6.8), // Beat 5: Probe A -> B boundary
    new THREE.Vector3(-1.8, 0.2, 6.6), // Beat 6: Detect leak
    new THREE.Vector3(-0.8, 0.9, 8.8), // Beat 7: Report & seal
    new THREE.Vector3(0.4, 1.4, 11.4), // Beat 8: Calm idle
    new THREE.Vector3(0.0, 1.2, 13.0), // Beat 9: Full lattice pullback
  ]);

  const lookAtCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.2, 0.0, 0.0),
    new THREE.Vector3(-3.9, 0.0, 0.0),
    new THREE.Vector3(-3.9, 0.0, 0.0),
    new THREE.Vector3(-3.9, 0.1, 0.0),
    new THREE.Vector3(-3.6, 0.0, 0.0),
    new THREE.Vector3(-2.0, 0.0, 0.0),
    new THREE.Vector3(-2.0, 0.0, 0.0),
    new THREE.Vector3(-1.2, 0.0, 0.0),
    new THREE.Vector3(0.0, 0.0, 0.0),
    new THREE.Vector3(0.0, 0.0, 0.0),
  ]);

  return { positionCurve, lookAtCurve };
}

export function createPortraitCameraRail(): {
  positionCurve: THREE.CatmullRomCurve3;
  lookAtCurve: THREE.CatmullRomCurve3;
} {
  const positionCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, 0.6, 11.4), // Beat 0: Portrait overview
    new THREE.Vector3(0.0, 2.2, 7.6),  // Beat 1: Ingest into Tenant A (top)
    new THREE.Vector3(0.4, 2.1, 7.8),  // Beat 2: Embed clusters
    new THREE.Vector3(0.0, 1.9, 6.8),  // Beat 3: Retrieve top-k
    new THREE.Vector3(0.2, 1.8, 6.5),  // Beat 4: Plant canary in A
    new THREE.Vector3(0.0, 1.0, 7.2),  // Beat 5: Probe A -> B boundary
    new THREE.Vector3(0.0, 0.8, 7.0),  // Beat 6: Detect leak
    new THREE.Vector3(0.0, 1.1, 8.6),  // Beat 7: Report & seal
    new THREE.Vector3(0.0, 0.4, 10.6), // Beat 8: Calm idle
    new THREE.Vector3(0.0, 0.2, 11.8), // Beat 9: Full portrait pullback
  ]);

  const lookAtCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, 0.0, 0.0),
    new THREE.Vector3(0.0, 1.75, 0.0),
    new THREE.Vector3(0.0, 1.75, 0.0),
    new THREE.Vector3(0.0, 1.75, 0.0),
    new THREE.Vector3(0.0, 1.6, 0.0),
    new THREE.Vector3(0.0, 0.9, 0.0),
    new THREE.Vector3(0.0, 0.9, 0.0),
    new THREE.Vector3(0.0, 0.8, 0.0),
    new THREE.Vector3(0.0, 0.0, 0.0),
    new THREE.Vector3(0.0, 0.0, 0.0),
  ]);

  return { positionCurve, lookAtCurve };
}
