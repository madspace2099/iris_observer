/**
 * IRIS OBSERVER — TRAVELLING PERIMETER GLOW.
 *
 * A PORT, NOT A REWRITE. This is `handoff/prompt-glow.js` as delivered, moved
 * to TypeScript and given the disposal and visibility discipline the handoff
 * asks for. The fragment shader is reproduced constant for constant: every
 * number in `FS` is the reference's number, and none of them is tuned here.
 *
 * ## Why there is no CSS version of this
 *
 * There was one, and it was rejected twice. The reason is in the shader rather
 * than in the effort: it accumulates FOUR bloom scales — 1.6px, 6px, 16px and
 * 38px — additively, then soft-knees the sum with `1 - exp(-1.35 * I)`. That
 * last step is what makes the head read as white-hot light rather than as a
 * pale blue smudge, and it operates on the SUM. CSS composites layer over
 * layer; it cannot tone-map an accumulated field, so `plus-lighter` on four
 * gradients gets the geometry and loses the physics. `perimT` is the second
 * reason: it measures true arc length along the rounded outline, straight runs
 * and corner arcs separately, so the head keeps a constant speed through the
 * corners. `offset-path` approximates this and `atan2` does not do it at all.
 *
 * ## The DOM contract
 *
 * The canvas is created here, not rendered by React, which is what the handoff
 * describes and what keeps the render loop out of React entirely: `uTime` is a
 * uniform, so a frame is a `gl.uniform1f` and a draw call, never a re-render.
 *
 *   <div class="ask-hero">            <- host, position: relative
 *     <canvas class="ask-glow-canvas">   <- inserted first, pointer-events: none
 *     <form class="ask-card">…</form>    <- the card, above it
 *   </div>
 *
 * @see docs/adr/0035-webgl-perimeter-glow.md for why this is exempt from the
 *      Canvas-2D-only rule ADR-0025 places on the orb.
 */

const PAD = 130; // canvas overhang beyond the card, px
const EDGE_FADE = 56; // soft fade to 0 at the canvas border, px
const MAX_DPR = 1.75;

const VS = `attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `precision highp float;
varying vec2 vUv;
uniform float uW, uH, uCardW, uCardH, uRadius, uTime, uIntensity, uMotion;
const float PI = 3.14159265;

// Signed distance to a rounded rectangle centred on the origin.
float sdRR(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// Normalised arc-length position [0,1) of the nearest point on the perimeter.
// Walks: right edge -> bottom-right corner -> bottom -> ... so the light travels
// the ACTUAL rounded outline instead of rotating a rectangular gradient.
float perimT(vec2 p, vec2 b, float r){
  float bx = max(b.x - r, 0.0), by = max(b.y - r, 0.0), A = PI * 0.5 * r;
  float total = 4.0 * bx + 4.0 * by + 4.0 * A;
  float s1 = bx, s2 = bx + A, s3 = bx + A + 2.0 * by, s4 = bx + 2.0 * A + 2.0 * by;
  float s5 = 3.0 * bx + 2.0 * A + 2.0 * by, s6 = 3.0 * bx + 3.0 * A + 2.0 * by;
  float s7 = 3.0 * bx + 3.0 * A + 4.0 * by, s8 = 3.0 * bx + 4.0 * A + 4.0 * by;
  float ax = abs(p.x), ay = abs(p.y), t;
  if (ax <= bx && ay >= by) {
    if (p.y < 0.0) { t = p.x >= 0.0 ? p.x : s8 + (bx + p.x); }
    else { t = s4 + (bx - p.x); }
  } else if (ay <= by && ax >= bx) {
    if (p.x > 0.0) { t = s2 + (by + p.y); } else { t = s6 + (by - p.y); }
  } else {
    vec2 q = vec2(ax - bx, ay - by);
    float a = atan(max(q.y, 0.0), max(q.x, 0.00001)) / (PI * 0.5);
    float base;
    if (p.x > 0.0 && p.y < 0.0) { base = s1; a = 1.0 - a; }
    else if (p.x > 0.0) { base = s3; }
    else if (p.y > 0.0) { base = s5; a = 1.0 - a; }
    else { base = s7; }
    t = base + a * A;
  }
  return t / total;
}

// Asymmetric comet profile: gaussian head, exponential tail, wrapped on [0,1).
float pulse(float t, float p, float head, float tail){
  float sd = fract(p - t + 0.5) - 0.5;
  if (sd < 0.0) return exp(-pow(sd / head, 2.0));
  return exp(-sd / tail);
}

void main(){
  vec2 pxr = vec2(vUv.x * uW, (1.0 - vUv.y) * uH);   // canvas pixel coords
  vec2 px  = pxr - vec2(uW, uH) * 0.5;               // card-centred pixel coords

  // fade the whole field out before the canvas edge so there is no visible box
  float edgeFade = smoothstep(0.0, ${EDGE_FADE}.0,
      min(min(pxr.x, uW - pxr.x), min(pxr.y, uH - pxr.y)));

  vec2 b = vec2(uCardW, uCardH) * 0.5;
  float d  = sdRR(px, b, uRadius);
  float ad = abs(d);
  float w  = d < 0.0 ? exp(d * 0.42) : 1.0;          // damp light bleeding inward
  float t  = perimT(px, b, uRadius);

  // ONE head, one direction, ~6.45 s per loop (0.155 loops/second)
  float travel = fract(uTime * 0.155);
  float moving = pulse(t, travel, 0.013, 0.052) * uMotion;

  // faint fixed hotspots at top & bottom centre so the rim never looks dead
  float dz = fract(t + 0.5) - 0.5;
  float dh = fract(t) - 0.5;
  float anchor = 0.20 * max(exp(-pow(dz / 0.040, 2.0)), exp(-pow(dh / 0.040, 2.0)));
  float hotAmt = clamp(anchor + moving, 0.0, 1.0);

  // four bloom scales, in px falloff
  float ring = exp(-ad /  1.6) * w;   // core line
  float near = exp(-ad /  6.0) * w;
  float mid  = exp(-ad / 16.0) * w;
  float far  = exp(-ad / 38.0) * w;

  float breath  = 0.80 + 0.20 * sin(uTime * 1.72);
  float shimmer = 1.0 + 0.07 * sin(uTime * 7.5 + t * 44.0) * uMotion;

  float baseI = (ring * 0.30 * shimmer + near * 0.16 + mid * 0.07 + far * 0.028)
              * (0.5 + 0.5 * uIntensity);
  float hotI  = hotAmt * (ring * 1.35 + near * 0.85 + mid * 0.44 + far * 0.18) * uIntensity;

  float I = (baseI + hotI) * breath * edgeFade;
  I = 1.0 - exp(-1.35 * I);                          // soft-knee, avoids clipping

  vec3 DP   = vec3(0.00, 0.14, 0.82);                // deep blue, outer
  vec3 BL   = vec3(0.04, 0.42, 1.00);                // electric blue
  vec3 CY   = vec3(0.52, 0.85, 1.00);                // cyan
  vec3 CORE = vec3(0.92, 0.99, 1.00);                // white core, head only
  vec3 col = mix(DP, BL, clamp(near * 1.35, 0.0, 1.0));
  col = mix(col, CY,   clamp(ring * ring * 0.45 + hotAmt * ring * 0.55, 0.0, 1.0));
  col = mix(col, CORE, clamp(hotAmt * ring * ring * 0.95, 0.0, 1.0));

  gl_FragColor = vec4(col * I, I);                   // premultiplied
}`;

/** The handle `attachPromptGlow` returns. `destroy` is idempotent. */
export type PromptGlow = {
  /** Runtime dimmer, 0.3–1.8. Redraws immediately; does not restart the loop. */
  setIntensity: (v: number) => void;
  destroy: () => void;
};

const UNIFORMS = [
  "uW",
  "uH",
  "uCardW",
  "uCardH",
  "uRadius",
  "uTime",
  "uIntensity",
  "uMotion",
] as const;

type UniformName = (typeof UNIFORMS)[number];

export function attachPromptGlow({
  card,
  intensity = 1,
  pad = PAD,
}: {
  readonly card: HTMLElement;
  readonly intensity?: number;
  readonly pad?: number;
}): PromptGlow {
  const host = card.parentElement;
  if (!host) throw new Error("attachPromptGlow: card must be in the document");
  if (getComputedStyle(host).position === "static") host.style.position = "relative";

  const canvas = document.createElement("canvas");
  canvas.className = "ask-glow-canvas";
  Object.assign(canvas.style, {
    position: "absolute",
    left: `${-pad}px`,
    top: `${-pad}px`,
    width: `calc(100% + ${pad * 2}px)`,
    height: `calc(100% + ${pad * 2}px)`,
    display: "block",
    pointerEvents: "none",
    zIndex: "0",
  });
  canvas.setAttribute("aria-hidden", "true");
  host.insertBefore(canvas, host.firstChild);

  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
    depth: false,
  });

  /*
   * NO CONTEXT IS NOT AN ERROR.
   *
   * Software rasterisers, blocklisted drivers and hardened browsers all refuse
   * WebGL, and the answer is the same in every case: take the canvas back out.
   * Removing it re-arms the CSS fallback, which is keyed on the canvas being
   * absent (`.ask-hero:not(:has(> .ask-glow-canvas))`), so a reader without
   * WebGL gets the still halo instead of an unlit card.
   */
  if (!gl) {
    canvas.remove();
    return { setIntensity() {}, destroy() {} };
  }

  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

  const compile = (type: number, src: string): WebGLShader | null => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };

  const prog = gl.createProgram();
  const vs = compile(gl.VERTEX_SHADER, VS);
  const fs = compile(gl.FRAGMENT_SHADER, FS);
  if (!prog || !vs || !fs) {
    canvas.remove();
    return { setIntensity() {}, destroy() {} };
  }
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  /*
   * The shaders are attached and linked, so the program owns them now and the
   * handles here are the last references. Deleting them is deferred-free: the
   * driver keeps the compiled code alive until the program is deleted.
   */
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos");

  const loc = {} as Record<UniformName, WebGLUniformLocation | null>;
  for (const n of UNIFORMS) loc[n] = gl.getUniformLocation(prog, n);

  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");

  /*
   * REDUCED MOTION: THE CLOCK STOPS AT 2.1, IT DOES NOT REWIND TO 0.
   *
   * `uTime` feeds three things. At 0 the breath would sit at its 0.80 floor and
   * the head would sit exactly on top-centre, on top of an anchor, so the one
   * still frame would be both the dimmest and the least legible of the lap. 2.1
   * puts the head about a third of the way round with the breath near its peak:
   * a still, evenly lit rim with a visible bright point, which is the frame a
   * screenshot should catch.
   */
  const u: Record<UniformName, number> = {
    uW: 1,
    uH: 1,
    uCardW: 1,
    uCardH: 1,
    uRadius: 24,
    uTime: motionQuery.matches ? 2.1 : 0,
    uIntensity: intensity,
    uMotion: motionQuery.matches ? 0 : 1,
  };

  let disposed = false;

  function draw(): void {
    if (disposed || !gl || !prog) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // additive, premultiplied
    for (const n of UNIFORMS) gl.uniform1f(loc[n], u[n]);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function layout(): void {
    if (disposed) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    u.uW = w;
    u.uH = h;
    u.uCardW = card.clientWidth;
    u.uCardH = card.clientHeight;
    const r = Number.parseFloat(getComputedStyle(card).borderTopLeftRadius);
    if (Number.isFinite(r) && r > 0) u.uRadius = r;
    draw();
  }

  let raf = 0;
  let last = 0;

  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    /*
     * Clamped to 50ms. A backgrounded tab, a long task or a paused debugger
     * would otherwise hand the loop a delta of seconds and teleport the head
     * across the rim on the first frame back.
     */
    u.uTime += Math.min((now - last) / 1000, 0.05);
    last = now;
    draw();
  };

  const start = (): void => {
    if (raf || disposed || u.uMotion === 0) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const onVisibility = (): void => {
    if (document.visibilityState === "visible") start();
    else stop();
  };

  /*
   * The setting can change while the page is open — a reader turning it on
   * mid-session should get the still frame without a reload, and turning it off
   * should start the lap.
   */
  const onMotionChange = (): void => {
    const reduced = motionQuery.matches;
    u.uMotion = reduced ? 0 : 1;
    if (reduced) {
      stop();
      u.uTime = 2.1;
      draw();
    } else if (document.visibilityState === "visible") {
      start();
    }
  };

  const ro = new ResizeObserver(layout);
  ro.observe(card);
  ro.observe(host);
  document.addEventListener("visibilitychange", onVisibility);
  motionQuery.addEventListener("change", onMotionChange);

  layout();
  if (document.visibilityState === "visible") start();

  return {
    setIntensity(v: number) {
      u.uIntensity = v;
      draw();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      motionQuery.removeEventListener("change", onMotionChange);
      ro.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      /*
       * Contexts are a scarce process-wide resource — browsers cap them at
       * around 16 and drop the OLDEST when a new one exceeds the cap. Two
       * composers plus route changes reach that quickly, and a dropped context
       * takes a live glow with it, so the context is surrendered explicitly.
       */
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    },
  };
}
