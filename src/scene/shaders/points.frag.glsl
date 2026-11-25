varying float vTenant;
varying float vAlpha;
varying float vLeak;
varying float vHighlight;

uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uColorCoral;
uniform float uFakeBloom;

void main() {
  // No discard: smoothstep falls to 0.0 cleanly for tile-based GPUs (Adreno/Mali)
  vec2 uv = gl_PointCoord - vec2(0.5);
  float dist = length(uv);
  float core = smoothstep(0.48, 0.08, dist);
  float halo = smoothstep(0.5, 0.0, dist) * 0.32 * uFakeBloom;
  float alpha = (core + halo) * vAlpha;

  vec3 col = uColorA;
  if (vTenant > 0.5 && vTenant < 1.5) {
    col = uColorB;
  } else if (vTenant >= 1.5) {
    col = uColorC;
  }

  col = mix(col, uColorA, vHighlight * 0.65);
  col = mix(col, uColorCoral, vLeak);

  gl_FragColor = vec4(col, alpha);
}
