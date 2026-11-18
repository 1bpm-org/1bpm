// Named, readable shaders. Compiled by three as GLSL ES 3.00 (WebGL2), so gl_VertexID exists.
//
// Phase is one float on a cycle, eased forward on the CPU:
//   0 idle → 1 approaching → 2 live (bell) → 3 after → 4 ≡ 0 idle
// Every visual in here is a periodic-safe function of it.

const COMMON = /* glsl */ `
  #define TAU 6.28318530718

  uniform float uPhase;
  uniform float uTime;
  uniform float uMotion;        // 1 normally, 0 under prefers-reduced-motion
  uniform vec2  uSessionLon;    // radians: x = the 06:00 UTC meridian, y = the 18:00 UTC meridian
  uniform vec2  uSessionWeight; // which meridian is the one coming (or happening)
  uniform float uSweepLon;      // the bell's single band of light
  uniform float uSweepAmt;

  float angularDistance(float a, float b) {
    float d = abs(a - b);
    return min(d, TAU - d);
  }

  float approachAmount(float p) { return smoothstep(0.0, 1.0, p) * (1.0 - smoothstep(2.0, 3.2, p)); }
  float liveAmount(float p)     { return smoothstep(1.0, 2.0, p) * (1.0 - smoothstep(2.0, 3.0, p)); }

  // Two thin longitudinal glows. They breathe on a ten-second cycle.
  float meridianGlow(float lon, float width) {
    float breathe = mix(1.0, 0.78 + 0.22 * sin(uTime * TAU / 10.0), uMotion);
    float boost = 1.0 + 1.1 * approachAmount(uPhase);
    float g06 = exp(-pow(angularDistance(lon, uSessionLon.x) / width, 2.0)) * uSessionWeight.x;
    float g18 = exp(-pow(angularDistance(lon, uSessionLon.y) / width, 2.0)) * uSessionWeight.y;
    return (g06 + g18) * breathe * boost;
  }

  float sweepBand(float lon) {
    return uSweepAmt * exp(-pow(angularDistance(lon, uSweepLon) / 0.14, 2.0));
  }
`

export const FIELD_VERTEX = /* glsl */ `
  ${COMMON}
  uniform vec3  uViewDir;       // unit vector, globe centre → camera
  uniform float uPixelRatio;    // min(devicePixelRatio, 1.5), or 1 after a downgrade
  uniform float uRestDistance;  // camera distance at which sizes are their nominal CSS px
  uniform float uPulse;         // reduced-motion bell: an opacity pulse only
  uniform int   uHereId;
  uniform float uHereGlow;
  uniform float uDay;           // 1 in day mode: ink on paper crowds darker at the limb, so soften it

  attribute vec2 aData;         // x: seed, y: density (0..1, log-scaled)

  varying float vAlpha;
  varying float vWarm;

  void main() {
    vec3 n = normalize(position);
    float facing = dot(n, uViewDir);

    // Back-hemisphere cull before raster. Roughly halves fragment work.
    if (facing < 0.02) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;

    float density = aData.y;
    float lon = atan(n.x, n.z);

    // Dust, not coins: 1.5–3 CSS px at rest distance, perspective-attenuated.
    float cssSize = mix(1.5, 3.0, pow(density, 1.4)) * (uRestDistance / -mv.z);
    float isHere = (gl_VertexID == uHereId) ? uHereGlow : 0.0;
    cssSize += isHere * 2.5;
    float px = cssSize * uPixelRatio;
    gl_PointSize = px < 0.5 ? 0.0 : px;

    float glow = meridianGlow(lon, 0.08);
    float sweep = sweepBand(lon);
    float shimmer = sin(uTime * 0.15 + aData.x * TAU) * 0.04 * uMotion;

    float alpha = mix(0.07, 0.36, pow(density, 1.2));
    alpha *= 1.0 - 0.15 * liveAmount(uPhase);          // the field dims ~15% at the bell
    float limb = smoothstep(0.02, mix(0.32, 0.6, uDay), facing);
    alpha *= limb;                                     // soft limb
    alpha *= mix(1.0, 0.8, uDay);
    alpha *= 1.0 + shimmer;
    alpha *= uPulse;
    alpha += (glow * 0.22 + sweep * 0.35) * limb * mix(1.0, 0.55, uDay);
    alpha += isHere * 0.8;

    vAlpha = clamp(alpha, 0.0, 1.0);
    vWarm = clamp(glow * 0.9 + sweep * 0.6, 0.0, 1.0);
  }
`

export const FIELD_FRAGMENT = /* glsl */ `
  uniform vec3 uPaper;
  uniform vec3 uAccent;

  varying float vAlpha;
  varying float vWarm;

  void main() {
    float disc = smoothstep(0.5, 0.15, length(gl_PointCoord - 0.5));
    float a = disc * vAlpha;
    vec3 colour = mix(uPaper, uAccent, vWarm);
    gl_FragColor = vec4(colour * a, a); // premultiplied
  }
`

export const GLOBE_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Dark and unlit. The only marks on it are the two session meridians and the bell's band,
// so the schedule still reads where a meridian crosses open ocean.
export const GLOBE_FRAGMENT = /* glsl */ `
  ${COMMON}
  uniform vec3 uBase;
  uniform vec3 uAccent;
  uniform float uPulse;

  varying vec3 vNormal;

  void main() {
    vec3 n = normalize(vNormal);
    float lon = atan(n.x, n.z);
    float glow = meridianGlow(lon, 0.05) * 0.05 + sweepBand(lon) * 0.06;
    float dim = 1.0 - 0.15 * liveAmount(uPhase);
    gl_FragColor = vec4(uBase * dim * uPulse + uAccent * glow, 1.0);
  }
`
