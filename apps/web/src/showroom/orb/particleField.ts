/**
 * The particle field, without React.
 *
 * A Fibonacci lattice of points on a sphere, displaced by ridged noise and lit
 * by additive bloom. Kept free of React and of the DOM beyond the canvas it is
 * handed, so the maths below can be reasoned about — and the component that
 * uses it stays about props and lifecycle rather than about GLSL.
 *
 * ## Why this one is WebGL when ObserverOrb is not
 *
 * ObserverOrb draws a few hundred arcs; this draws a thousand additively blended
 * sprites through two blur chains, which Canvas 2D cannot do at frame rate. The
 * objection recorded there still stands and is answered rather than ignored:
 * `ok` reports whether a context was obtained, and the caller is expected to
 * draw a still fallback when it is false — including after a context loss,
 * which is signalled by the same flag.
 *
 * ## Two invariants worth keeping
 *
 * **Point count tracks area, grain does not.** The number of points scales with
 * the pixel area of the canvas while each point stays a fixed 2.6 device pixels.
 * Scaling both, which is the obvious thing to do, grows total ink as the fourth
 * power of size and turns a 200px orb into a solid white disc.
 *
 * **Nothing leaves the circle.** A point at radius x projects to x·FOV/√(DIST²−x²);
 * solving that for the target radius gives the largest the cloud may ever be, and
 * the pointer reach and audio pulse are added afterwards out of a budget that is
 * reserved in advance. The mark cannot grow out of its own box.
 */

const FIB = [8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987] as const;

/** How many motes render as small spheres rather than dust, at any size. */
const BEADS = 7;

const FOV = 1 / Math.tan(0.44);
const DIST = 4.6;
/** Rest radius in clip space, leaving headroom for reach and pulse. */
const TARGET = 0.72;
const X_MAX = (TARGET * DIST) / Math.sqrt(FOV * FOV + TARGET * TARGET);

/** What one state of the field looks like. Eased between by the caller. */
export interface FieldProfile {
  /** Depth of the noise displacement. */
  readonly amp: number;
  /** Spatial frequency of the folds. */
  readonly freq: number;
  /** Domain warp, which keeps the folds from reading as plain noise. */
  readonly warp: number;
  /** How fast the field churns. */
  readonly speed: number;
  /** How fast the cloud turns. */
  readonly spin: number;
  readonly bright: number;
  readonly glow: number;
  /** Point diameter in device pixels. */
  readonly grain: number;
}

export interface FieldInput {
  readonly profile: FieldProfile;
  /** Fast audio envelope, 0–1. Drives the pulse. */
  readonly pulse: number;
  /** Slow audio envelope, 0–1. Deepens the breath. */
  readonly voice: number;
  /** Pointer proximity, 0 far and 1 over the mark. */
  readonly prox: number;
  /** Unit direction toward the pointer, +y up. */
  readonly aimX: number;
  readonly aimY: number;
}

export interface ParticleField {
  /** True while a usable context is held. Goes false on context loss. */
  readonly ok: boolean;
  /** Advance and draw. `dt` in seconds. */
  frame(dt: number, input: FieldInput): void;
  dispose(): void;
}

const NOISE = `
  vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
  float ridged(vec3 p) {
    float f = 0.0, a = 0.55, w = 0.0;
    for (int i = 0; i < 3; i++) {
      float n = 1.0 - abs(snoise(p));
      n *= n; f += n * a; w += a;
      p = p * 2.07 + 13.7; a *= 0.5;
    }
    return f / w;
  }
`;

const VS_ORB = `
  precision highp float;
  attribute vec3 aPos;
  attribute float aSeed;
  attribute float aBead;
  uniform mat3  uRot;
  uniform float uTime, uClock, uAmp, uFreq, uWarp, uSize, uScale, uProx, uPulse, uVoice;
  uniform vec2  uAim;
  varying vec3  vCol;
  varying float vA;
  varying float vBead;
  ${NOISE}
  void main() {
    vec3 sp = uRot * aPos;
    vec3 q = sp * uFreq + vec3(0.0, 0.0, uTime * 0.35);
    vec3 w = vec3(snoise(q * 0.55 + 11.3), snoise(q * 0.55 + 37.9), snoise(q * 0.55 + 71.1));
    float h = ridged(q + w * uWarp + uTime * 0.12);

    float breathe = 1.0 + (0.06 + 0.13 * uVoice)
                        * sin(uClock * (0.62 + 0.85 * uVoice) + aSeed * 0.4);
    float disp = 1.0 + uAmp * (h - 0.42) * 1.85 * breathe;

    vec3 aim3 = normalize(vec3(uAim, 0.55));
    float align = max(dot(sp, aim3), 0.0);

    // Added after the containment scale, in final units, out of reserved headroom.
    float reach = uProx * 0.10 * pow(align, 2.2);
    float pulse = uPulse * 0.22;

    vec3 pos = sp * (disp * uScale + reach + pulse);
    vec3 mv = pos + vec3(0.0, 0.0, -${DIST.toFixed(2)});
    float wc = -mv.z;
    gl_Position = vec4(mv.x * ${FOV.toFixed(6)}, mv.y * ${FOV.toFixed(6)}, 0.0, wc);

    float crest = smoothstep(0.30, 0.92, h);
    vCol = mix(vec3(0.470, 0.646, 0.831), vec3(0.960, 0.972, 1.000), crest * 0.86 + 0.14);

    float facing = abs(normalize(mv).z);
    float rim = pow(1.0 - facing, 2.2);
    float depth = mix(0.42, 1.0, smoothstep(-1.3, 1.2, pos.z));
    vA = (0.22 + 0.85 * crest) * (0.72 + 1.05 * rim) * depth * (0.55 + 0.45 * aSeed);
    vA *= 1.0 + uProx * 0.55 * align;
    vA *= 1.0 + uPulse * 0.70;

    vBead = aBead;
    vCol = mix(vCol, vec3(0.97, 0.98, 1.0), vBead * 0.55);
    vA *= mix(1.0, 0.86, vBead);

    float s = uSize * mix(1.0, 1.8, vBead) / wc;
    gl_PointSize = max(s, 1.0);
    if (s < 1.0) vA *= s * s;
  }
`;

const FS_POINT = `
  precision highp float;
  varying vec3 vCol; varying float vA; varying float vBead;
  uniform float uGain;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d) * 4.0;
    float dust = exp(-r2 * 3.4);
    float z = sqrt(max(1.0 - r2, 0.0));
    float ball = smoothstep(1.0, 0.62, r2) * (0.30 + 0.70 * z);
    vec2 hl = d - vec2(-0.15, 0.15);
    ball += exp(-dot(hl, hl) * 30.0) * 0.55 * step(r2, 1.0);
    float e = mix(dust, ball, vBead) * vA * uGain;
    if (e < 0.003) discard;
    gl_FragColor = vec4(vCol * e, e);
  }
`;

const FS_LINE = `
  precision highp float;
  varying vec3 vCol; varying float vA; varying float vBead;
  uniform float uGain;
  void main() { float e = vA * uGain; gl_FragColor = vec4(vCol * e, e); }
`;

const VS_QUAD = `
  precision highp float;
  attribute vec2 aXY; varying vec2 vUV;
  void main() { vUV = aXY * 0.5 + 0.5; gl_Position = vec4(aXY, 0.0, 1.0); }
`;

const FS_BRIGHT = `
  precision highp float; varying vec2 vUV; uniform sampler2D uTex;
  void main() {
    vec3 c = texture2D(uTex, vUV).rgb;
    float l = max(max(c.r, c.g), c.b);
    gl_FragColor = vec4(c * smoothstep(0.20, 0.78, l), 1.0);
  }
`;

const FS_BLUR = `
  precision highp float; varying vec2 vUV;
  uniform sampler2D uTex; uniform vec2 uDir;
  void main() {
    vec2 o1 = uDir * 1.3846153846, o2 = uDir * 3.2307692308;
    vec3 s = texture2D(uTex, vUV).rgb * 0.2270270270;
    s += (texture2D(uTex, vUV + o1).rgb + texture2D(uTex, vUV - o1).rgb) * 0.3162162162;
    s += (texture2D(uTex, vUV + o2).rgb + texture2D(uTex, vUV - o2).rgb) * 0.0702702703;
    gl_FragColor = vec4(s, 1.0);
  }
`;

/**
 * Transparent composite: no painted backdrop and no vignette, because the mark
 * sits on whatever surface the rail gives it. The circular fade is a guarantee
 * rather than a crop — the cloud is already scaled to sit inside it.
 */
const FS_COMP = `
  precision highp float; varying vec2 vUV;
  uniform sampler2D uScene, uBloomA, uBloomB;
  uniform float uBright, uGlow;
  void main() {
    vec3 c = texture2D(uScene, vUV).rgb;
    c += (texture2D(uBloomA, vUV).rgb * 0.44 + texture2D(uBloomB, vUV).rgb * 0.66) * uGlow;
    c *= uBright;
    c = vec3(1.0) - exp(-c * 2.55);
    float r = length(vUV - 0.5) * 2.0;
    c *= 1.0 - smoothstep(0.90, 1.00, r);
    float a = clamp(max(max(c.r, c.g), c.b), 0.0, 1.0);
    gl_FragColor = vec4(c, a);
  }
`;

interface Target {
  readonly tex: WebGLTexture;
  readonly fb: WebGLFramebuffer;
  readonly w: number;
  readonly h: number;
}

interface Program extends WebGLProgram {
  u(name: string): WebGLUniformLocation | null;
}

/** Point count from pixel area, floored only to guard degenerate geometry. */
function countFor(px: number): number {
  return Math.max(64, Math.min(14000, Math.round((px * px) / 29)));
}

export function createParticleField(
  canvas: HTMLCanvasElement,
  cssSize: number,
): ParticleField | null {
  const dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  const px = Math.round(cssSize * dpr);
  canvas.width = px;
  canvas.height = px;

  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
  }) as WebGLRenderingContext | null;
  if (gl === null) return null;

  let alive = true;
  const onLost = (e: Event) => {
    e.preventDefault();
    alive = false;
  };
  canvas.addEventListener("webglcontextlost", onLost);

  function shader(type: number, src: string): WebGLShader | null {
    const s = gl!.createShader(type);
    if (s === null) return null;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
      alive = false;
      return null;
    }
    return s;
  }

  function link(vs: WebGLShader | null, fs: WebGLShader | null): Program | null {
    if (vs === null || fs === null) return null;
    const p = gl!.createProgram() as Program | null;
    if (p === null) return null;
    gl!.attachShader(p, vs);
    gl!.attachShader(p, fs);
    gl!.linkProgram(p);
    if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) {
      alive = false;
      return null;
    }
    const cache = new Map<string, WebGLUniformLocation | null>();
    p.u = (name: string) => {
      if (!cache.has(name)) cache.set(name, gl!.getUniformLocation(p, name));
      return cache.get(name) ?? null;
    };
    return p;
  }

  const vOrb = shader(gl.VERTEX_SHADER, VS_ORB);
  const vQuad = shader(gl.VERTEX_SHADER, VS_QUAD);
  const pPts = link(vOrb, shader(gl.FRAGMENT_SHADER, FS_POINT));
  const pLine = link(vOrb, shader(gl.FRAGMENT_SHADER, FS_LINE));
  const pBright = link(vQuad, shader(gl.FRAGMENT_SHADER, FS_BRIGHT));
  const pBlur = link(vQuad, shader(gl.FRAGMENT_SHADER, FS_BLUR));
  const pComp = link(vQuad, shader(gl.FRAGMENT_SHADER, FS_COMP));
  if (!alive || !pPts || !pLine || !pBright || !pBlur || !pComp) {
    canvas.removeEventListener("webglcontextlost", onLost);
    return null;
  }

  // ---- geometry -----------------------------------------------------------
  const n = countFor(px);
  const pts = new Float32Array(n * 3);
  const seeds = new Float32Array(n);
  const beads = new Float32Array(n);
  const GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * i + 1) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = GA * i;
    pts[i * 3] = Math.cos(th) * r;
    pts[i * 3 + 1] = y;
    pts[i * 3 + 2] = Math.sin(th) * r;
    seeds[i] = (((Math.sin(i * 127.1) * 43758.5453) % 1) + 1) % 1;
  }
  // One bead per equal slice of the index range. Index is latitude here, so
  // choosing them by hash alone piles every bead onto one pole.
  for (let k = 0; k < BEADS; k++) {
    const j = (((Math.sin((k + 1) * 91.7) * 43758.5453) % 1) + 1) % 1;
    beads[Math.min(n - 1, Math.floor((n * (k + 0.15 + 0.7 * j)) / BEADS))] = 1;
  }

  // Neighbours in a golden-angle spiral sit a Fibonacci number apart in index,
  // which is what makes these strands follow the surface rather than cut across it.
  const want = Math.sqrt(n);
  let stride: number = FIB[0];
  for (const f of FIB) if (Math.abs(f - want) < Math.abs(stride - want)) stride = f;
  const segs = Math.max(1, Math.floor((n - stride) / 2));
  const linePts = new Float32Array(segs * 6);
  const lineSeeds = new Float32Array(segs * 2);
  for (let s = 0; s < segs; s++) {
    const a = s * 2;
    const b = a + stride;
    for (let k = 0; k < 3; k++) {
      linePts[s * 6 + k] = pts[a * 3 + k] ?? 0;
      linePts[s * 6 + 3 + k] = pts[b * 3 + k] ?? 0;
    }
    lineSeeds[s * 2] = seeds[a] ?? 0;
    lineSeeds[s * 2 + 1] = seeds[b] ?? 0;
  }

  const buffers: WebGLBuffer[] = [];
  function buffer(data: Float32Array): WebGLBuffer {
    const b = gl!.createBuffer()!;
    gl!.bindBuffer(gl!.ARRAY_BUFFER, b);
    gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
    buffers.push(b);
    return b;
  }
  const bPos = buffer(pts);
  const bSeed = buffer(seeds);
  const bBead = buffer(beads);
  const bLinePos = buffer(linePts);
  const bLineSeed = buffer(lineSeeds);
  const bLineBead = buffer(new Float32Array(segs * 2));
  const bQuad = buffer(new Float32Array([-1, -1, 3, -1, -1, 3]));

  // ---- render targets -----------------------------------------------------
  const targets: Target[] = [];
  function target(w: number, h: number): Target {
    const tex = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, w, h, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
    const fb = gl!.createFramebuffer()!;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fb);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, tex, 0);
    const t = { tex, fb, w, h };
    targets.push(t);
    return t;
  }
  const half = Math.max(2, px >> 1);
  const quarter = Math.max(2, px >> 2);
  const scene = target(px, px);
  const h0 = target(half, half);
  const h1 = target(half, half);
  const q0 = target(quarter, quarter);
  const q1 = target(quarter, quarter);

  // ---- drawing ------------------------------------------------------------
  function attrib(p: Program, name: string, buf: WebGLBuffer, size: number): void {
    const loc = gl!.getAttribLocation(p, name);
    if (loc < 0) return;
    gl!.bindBuffer(gl!.ARRAY_BUFFER, buf);
    gl!.enableVertexAttribArray(loc);
    gl!.vertexAttribPointer(loc, size, gl!.FLOAT, false, 0, 0);
  }
  function quad(p: Program): void {
    gl!.useProgram(p);
    attrib(p, "aXY", bQuad, 2);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }
  function bind(t: Target | null): void {
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, t === null ? null : t.fb);
    gl!.viewport(0, 0, t === null ? px : t.w, t === null ? px : t.h);
  }
  function sampler(p: Program, name: string, tex: WebGLTexture, unit: number): void {
    gl!.activeTexture(gl!.TEXTURE0 + unit);
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    gl!.uniform1i(p.u(name), unit);
  }
  function blur(src: Target, dst: Target, radius: number, horizontal: boolean): void {
    bind(dst);
    gl!.disable(gl!.BLEND);
    gl!.useProgram(pBlur!);
    sampler(pBlur!, "uTex", src.tex, 0);
    gl!.uniform2f(
      pBlur!.u("uDir"),
      horizontal ? radius / dst.w : 0,
      horizontal ? 0 : radius / dst.h,
    );
    quad(pBlur!);
  }

  gl.disable(gl.DEPTH_TEST);

  let t = Math.random() * 40;
  let yaw = Math.random() * 6.28;
  let clock = 0;
  const pitch = -0.12;

  function frame(dt: number, input: FieldInput): void {
    if (!alive) return;
    const c = input.profile;
    t += dt * c.speed * (1 + 0.9 * input.pulse);
    yaw += dt * c.spin * (1 + 1.6 * input.prox);
    clock += dt;

    bind(scene);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.ONE, gl!.ONE);

    const cy = Math.cos(yaw + input.prox * 0.42);
    const sy = Math.sin(yaw + input.prox * 0.42);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const rot = new Float32Array([cy, sy * sp, -sy * cp, 0, cp, sp, sy, -cy * sp, cy * cp]);
    const scale = X_MAX / (1 + c.amp * 1.137);

    const passes: readonly [
      Program,
      number,
      number,
      WebGLBuffer,
      WebGLBuffer,
      WebGLBuffer,
      number,
    ][] = [
      [pLine!, gl!.LINES, segs * 2, bLinePos, bLineSeed, bLineBead, 0.2],
      [pPts!, gl!.POINTS, n, bPos, bSeed, bBead, 8.4],
    ];
    for (const [p, mode, count, pb, sb, bb, gain] of passes) {
      gl!.useProgram(p);
      attrib(p, "aPos", pb, 3);
      attrib(p, "aSeed", sb, 1);
      attrib(p, "aBead", bb, 1);
      gl!.uniformMatrix3fv(p.u("uRot"), false, rot);
      gl!.uniform1f(p.u("uTime"), t);
      gl!.uniform1f(p.u("uClock"), clock);
      gl!.uniform1f(p.u("uAmp"), c.amp);
      gl!.uniform1f(p.u("uFreq"), c.freq);
      gl!.uniform1f(p.u("uWarp"), c.warp);
      gl!.uniform1f(p.u("uSize"), c.grain * 3.35);
      gl!.uniform1f(p.u("uScale"), scale);
      gl!.uniform1f(p.u("uProx"), input.prox);
      gl!.uniform1f(p.u("uPulse"), input.pulse);
      gl!.uniform1f(p.u("uVoice"), input.voice);
      gl!.uniform2f(p.u("uAim"), input.aimX, input.aimY);
      gl!.uniform1f(p.u("uGain"), gain);
      gl!.drawArrays(mode, 0, count);
    }

    gl!.disable(gl!.BLEND);
    bind(h0);
    gl!.useProgram(pBright!);
    sampler(pBright!, "uTex", scene.tex, 0);
    quad(pBright!);
    blur(h0, h1, 1.4, true);
    blur(h1, h0, 1.4, false);
    bind(q0);
    gl!.useProgram(pBright!);
    sampler(pBright!, "uTex", h0.tex, 0);
    quad(pBright!);
    blur(q0, q1, 2.6, true);
    blur(q1, q0, 2.6, false);
    blur(q0, q1, 5.2, true);
    blur(q1, q0, 5.2, false);

    bind(null);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.useProgram(pComp!);
    sampler(pComp!, "uScene", scene.tex, 0);
    sampler(pComp!, "uBloomA", h0.tex, 1);
    sampler(pComp!, "uBloomB", q0.tex, 2);
    gl!.uniform1f(pComp!.u("uBright"), c.bright * (1 + 0.28 * input.prox + 0.4 * input.pulse));
    gl!.uniform1f(pComp!.u("uGlow"), c.glow * (1 + 0.45 * input.prox + 0.55 * input.pulse));
    quad(pComp!);
  }

  function dispose(): void {
    alive = false;
    canvas.removeEventListener("webglcontextlost", onLost);
    for (const b of buffers) gl!.deleteBuffer(b);
    for (const tt of targets) {
      gl!.deleteFramebuffer(tt.fb);
      gl!.deleteTexture(tt.tex);
    }
  }

  return {
    get ok() {
      return alive;
    },
    frame,
    dispose,
  };
}
