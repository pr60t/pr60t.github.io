attribute float aTenant;
attribute float aSeed;
attribute float aState;
attribute vec3 aClusterPos;

uniform float uTime;
uniform float uProgress;
uniform float uLeak;
uniform float uQuery;
uniform float uDim;
uniform float uPixelRatio;
uniform float uReducedMotion;
uniform float uPointScale;
uniform float uMotionAmp;

varying float vTenant;
varying float vAlpha;
varying float vLeak;
varying float vHighlight;

void main() {
  vTenant = aTenant;
  vLeak = 0.0;
  vHighlight = 0.0;

  // Interpolate between grid/ingest layout (position) and semantic cluster (aClusterPos)
  float embedMix = smoothstep(0.10, 0.24, uProgress);
  vec3 basePos = mix(position, aClusterPos, embedMix);

  // Slow Brownian drift + breathing (tempered on mobile, disabled in reduced motion)
  float motionScale = (1.0 - uReducedMotion) * uMotionAmp;
  float phase = aSeed * 6.2831853;
  float driftX = sin(uTime * 0.45 + phase) * 0.055 * motionScale;
  float driftY = cos(uTime * 0.38 + phase * 1.3) * 0.055 * motionScale;
  float driftZ = sin(uTime * 0.32 + phase * 0.7) * 0.055 * motionScale;
  vec3 pos = basePos + vec3(driftX, driftY, driftZ);

  // Query pulse sweep
  float sweepX = mix(-5.5, 5.5, fract(uQuery));
  float distToSweep = abs(pos.x - sweepX);
  float queryWave = smoothstep(0.8, 0.0, distToSweep) * step(0.01, uQuery);
  vHighlight = queryWave;

  // Leak state: selected Tenant A points cross toward Tenant B and turn coral
  if (aState > 0.5 && uLeak > 0.01) {
    float crossAmount = smoothstep(0.0, 1.0, uLeak);
    pos.x = mix(pos.x, pos.x + 3.6, crossAmount);
    pos.y += sin(crossAmount * 3.14159) * 0.32;
    vLeak = crossAmount;
  }

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Clamped <= 48.0 for Adreno/Mali stability; scaled down at low tier to curb overdraw
  float baseSize = (16.0 + aSeed * 9.0 + vHighlight * 12.0 + vLeak * 16.0) * uPointScale;
  gl_PointSize = clamp((baseSize * uPixelRatio) / max(1.0, -mvPosition.z), 2.0, 48.0);

  float depthFade = clamp(1.0 - (-mvPosition.z - 6.0) / 20.0, 0.22, 0.95);
  vAlpha = depthFade * uDim;
}
