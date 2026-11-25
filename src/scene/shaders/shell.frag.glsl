varying vec3 vNormalWorld;
varying vec3 vViewDir;

uniform vec3 uColor;
uniform float uGlass;
uniform float uLeak;
uniform vec3 uCoral;

void main() {
  // No discard: alpha falls to 0.0 cleanly for Adreno/Mali
  float fresnel = pow(1.0 - max(0.0, abs(dot(normalize(vNormalWorld), normalize(vViewDir)))), 2.4);
  vec3 col = mix(uColor, uCoral, uLeak * 0.65);
  float alpha = uGlass * (0.08 + fresnel * 0.42);
  gl_FragColor = vec4(col, alpha);
}
