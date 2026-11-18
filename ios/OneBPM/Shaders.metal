// The point field and the globe. Same look as src/shaders.ts on the site:
// unlit soft dots, back-hemisphere cull in the vertex stage, two breathing meridians, one bell band.
#include <metal_stdlib>
using namespace metal;

#define TAU 6.28318530718

struct Uniforms {
    float4 right;    // xyz: screen-right on the unit sphere
    float4 up;       // xyz: screen-up
    float4 view;     // xyz: toward the viewer
    float4 dotColor; // rgb, w: 1 by day
    float4 accent;   // rgb, w: bell pulse (reduced motion)
    float4 base;     // rgb globe, w: phase (0 idle, 1 approaching, 2 live, 3 after)
    float4 misc;     // x: time, y: motion (0 under reduce motion), z: sweep longitude, w: sweep amount
    float4 layout;   // x, y: centre in px; z: radius in px; w: px per point
    float4 viewport; // x, y: size in px; z: "here" index; w: "here" glow
    float4 session;  // x: 06:00 meridian, y: 18:00 meridian (radians); z, w: their weights
};

static float angularDistance(float a, float b) {
    float d = fabs(a - b);
    return min(d, TAU - d);
}
static float approachAmount(float p) { return smoothstep(0.0, 1.0, p) * (1.0 - smoothstep(2.0, 3.2, p)); }
static float liveAmount(float p) { return smoothstep(1.0, 2.0, p) * (1.0 - smoothstep(2.0, 3.0, p)); }

static float meridianGlow(float lon, float width, constant Uniforms& u) {
    float breathe = mix(1.0, 0.78 + 0.22 * sin(u.misc.x * TAU / 10.0), u.misc.y);
    float boost = 1.0 + 1.1 * approachAmount(u.base.w);
    float g06 = exp(-pow(angularDistance(lon, u.session.x) / width, 2.0)) * u.session.z;
    float g18 = exp(-pow(angularDistance(lon, u.session.y) / width, 2.0)) * u.session.w;
    return (g06 + g18) * breathe * boost;
}
static float sweepBand(float lon, constant Uniforms& u) {
    return u.misc.w * exp(-pow(angularDistance(lon, u.misc.z) / 0.14, 2.0));
}
static float4 toClip(float2 s, constant Uniforms& u) {
    float2 px = float2(u.layout.x + s.x * u.layout.z, u.layout.y - s.y * u.layout.z);
    return float4(px.x / u.viewport.x * 2.0 - 1.0, 1.0 - px.y / u.viewport.y * 2.0, 0.0, 1.0);
}

struct PointOut {
    float4 position [[position]];
    float size [[point_size]];
    float alpha;
    float warm;
};

vertex PointOut fieldVertex(uint vid [[vertex_id]],
                            const device float4* positions [[buffer(0)]],
                            const device float2* data [[buffer(1)]],
                            constant Uniforms& u [[buffer(2)]]) {
    PointOut o;
    float3 n = positions[vid].xyz;
    float facing = dot(n, u.view.xyz);
    if (facing < 0.02) { // far side: off screen, no raster work
        o.position = float4(2.0, 2.0, 2.0, 1.0);
        o.size = 0.0;
        o.alpha = 0.0;
        o.warm = 0.0;
        return o;
    }
    o.position = toClip(float2(dot(n, u.right.xyz), dot(n, u.up.xyz)), u);

    float seed = data[vid].x;
    float density = data[vid].y;
    float lon = atan2(n.x, n.z);
    float day = u.dotColor.w;

    float isHere = (int(vid) == int(u.viewport.z)) ? u.viewport.w : 0.0;
    float size = (mix(1.5, 3.0, pow(density, 1.4)) + isHere * 2.5) * u.layout.w;
    o.size = size < 0.5 ? 0.0 : size;

    float glow = meridianGlow(lon, 0.08, u);
    float sweep = sweepBand(lon, u);
    float shimmer = sin(u.misc.x * 0.15 + seed * TAU) * 0.04 * u.misc.y;

    float alpha = mix(0.07, 0.36, pow(density, 1.2));
    alpha *= 1.0 - 0.15 * liveAmount(u.base.w);
    float limb = smoothstep(0.02, mix(0.32, 0.6, day), facing);
    alpha *= limb;
    alpha *= mix(1.0, 0.8, day);
    alpha *= 1.0 + shimmer;
    alpha *= u.accent.w;
    alpha += (glow * 0.22 + sweep * 0.35) * limb * mix(1.0, 0.55, day);
    alpha += isHere * 0.8;

    o.alpha = clamp(alpha, 0.0, 1.0);
    o.warm = clamp(glow * 0.9 + sweep * 0.6, 0.0, 1.0);
    return o;
}

fragment float4 fieldFragment(PointOut in [[stage_in]],
                              float2 pc [[point_coord]],
                              constant Uniforms& u [[buffer(0)]]) {
    float disc = 1.0 - smoothstep(0.15, 0.5, length(pc - 0.5));
    float a = disc * in.alpha;
    float3 c = mix(u.dotColor.rgb, u.accent.rgb, in.warm);
    return float4(c * a, a); // premultiplied
}

struct GlobeOut {
    float4 position [[position]];
    float2 s;
};

vertex GlobeOut globeVertex(uint vid [[vertex_id]], constant Uniforms& u [[buffer(0)]]) {
    GlobeOut o;
    float2 corner = float2((vid & 1) ? 1.0 : -1.0, (vid & 2) ? 1.0 : -1.0) * 1.03;
    o.position = toClip(corner, u);
    o.s = corner;
    return o;
}

// Dark and unlit. The only marks are the two meridians and the bell's band.
fragment float4 globeFragment(GlobeOut in [[stage_in]], constant Uniforms& u [[buffer(0)]]) {
    float r = length(in.s);
    float edge = 1.0 - smoothstep(1.0 - 1.5 / u.layout.z, 1.0, r);
    if (edge <= 0.0) discard_fragment();
    float z = sqrt(max(0.0, 1.0 - r * r));
    float3 n = in.s.x * u.right.xyz + in.s.y * u.up.xyz + z * u.view.xyz;
    float lon = atan2(n.x, n.z);
    float glow = meridianGlow(lon, 0.05, u) * 0.05 + sweepBand(lon, u) * 0.06;
    float dim = 1.0 - 0.15 * liveAmount(u.base.w);
    float3 c = u.base.rgb * dim * u.accent.w + u.accent.rgb * glow;
    return float4(c * edge, edge);
}
