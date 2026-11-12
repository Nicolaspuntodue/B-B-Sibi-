// La scena fissa: quattro fotografie vere di Chieti in WebGL.
// Lo scroll le fa scorrere una nell'altra, il puntatore dà profondità al paesaggio.
import * as THREE from 'three';

// file, proporzione, punto di interesse (x, y dal basso) e ingrandimento
const SHOTS = [
  { src: '/img/casa-video.jpg', video: '/img/casa.mp4', aspect: 16 / 9, focus: [0.5, 0.5], zoom: 1.0 },
  { src: '/img/chieti.jpg', aspect: 1920 / 1282, focus: [0.5, 0.52], zoom: 1.12 },
  { src: '/img/cattedrale.jpg', aspect: 1920 / 1280, focus: [0.3, 0.5], zoom: 1.0 },
  { src: '/img/casa.jpg', aspect: 1200 / 796, focus: [0.42, 0.5], zoom: 1.0 },
];

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex[4];
  uniform vec4 uShot[4];   // focus.xy, zoom, aspect
  uniform float uB, uIntro, uAspect, uFit, uCenter;
  uniform vec2 uPointer;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  // fit 1: riempie la scena come object-fit: cover; fit 0: la fotografia intera, con un po' di margine
  vec2 place(vec2 uv, vec4 shot, float push, float fit, float cy) {
    vec2 s = uAspect < shot.w ? vec2(uAspect / shot.w, 1.0) : vec2(1.0, shot.w / uAspect);
    float whole = (uAspect < shot.w ? shot.w / uAspect : uAspect / shot.w) * 1.12;
    vec2 p = (uv - vec2(0.5, cy)) * s * mix(whole, 1.0, fit) / (shot.z * mix(1.0, 1.06 + push, fit)) + shot.xy;
    return p + uPointer * 0.008;                    // spostamento uniforme: la fotografia non si deforma
  }
  vec2 cover(vec2 uv, vec4 shot, float push) { return clamp(place(uv, shot, push, 1.0, 0.5), vec2(0.0), vec2(1.0)); }
  vec3 shot(int i, vec2 uv, float push) {
    if (i == 0) {
      // la facciata parte intera, con gli angoli tondi, e si allarga fino a riempire la scena
      vec2 p = place(uv, uShot[0], push, uFit, mix(uCenter, 0.5, uFit));
      vec3 img = texture2D(uTex[0], clamp(p, vec2(0.0), vec2(1.0))).rgb;
      vec2 q = (p - 0.5) * vec2(uShot[0].w, 1.0), hb = vec2(uShot[0].w, 1.0) * 0.5;
      float r = 0.05 * (1.0 - uFit);
      vec2 e = abs(q) - hb + r;
      float d = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - r;   // negativo dentro la fotografia
      return mix(vec3(0.090, 0.227, 0.369), img, 1.0 - smoothstep(-0.004, 0.004, d));
    }
    if (i == 1) return texture2D(uTex[1], cover(uv, uShot[1], push)).rgb;
    if (i == 2) return texture2D(uTex[2], cover(uv, uShot[2], push)).rgb;
    return texture2D(uTex[3], cover(uv, uShot[3], push)).rgb;
  }
  void main() {
    float b = clamp(uB, 0.0, 3.0);
    int i = int(min(floor(b), 2.0));
    float t = b - float(i);
    float n = noise(vUv * vec2(3.0, 1.5) + 4.0);
    // la fotografia nuova sale dal basso con un bordo irregolare, la vecchia si allontana
    float edge = mix(-0.25, 1.25, t);
    float m = 1.0 - smoothstep(edge - 0.12, edge + 0.12, vUv.y + (n - 0.5) * 0.35);
    vec2 uv = vUv;
    vec3 a = shot(i, uv + vec2(0.0, t * 0.06), t * 0.10);
    vec3 c = shot(i + 1, uv - vec2(0.0, (1.0 - t) * 0.06), (1.0 - t) * 0.10);
    vec3 col = mix(a, c, m);
    // apertura: il panorama emerge dal fondo carta
    float open = 1.0 - smoothstep(uIntro * 1.5 - 0.25, uIntro * 1.5, vUv.y + (n - 0.5) * 0.3);
    gl_FragColor = vec4(mix(vec3(0.090, 0.227, 0.369), col, open), 1.0);
  }`;

export function createStage(canvas, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const loader = new THREE.TextureLoader();
  const uniforms = {
    uTex: { value: SHOTS.map((s) => loader.load(s.src)) },
    uShot: { value: SHOTS.map((s) => new THREE.Vector4(s.focus[0], s.focus[1], s.zoom, s.aspect)) },
    uB: { value: 0 }, uIntro: { value: reducedMotion ? 1 : 0 }, uAspect: { value: 1 }, uFit: { value: 0 }, uCenter: { value: 0.5 },
    uPointer: { value: new THREE.Vector2() },
  };
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader })));
  const camera = new THREE.Camera();

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    uniforms.uAspect.value = w / h;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // L'apertura è un video che lo scroll fa avanzare; finché non è pronto resta il suo primo fotogramma.
  // ponytail: stesso file a 720p per telefono e desktop; una versione più leggera per il telefono se il caricamento pesa.
  let video, vtex, dur = 0, scrub = 0, scrubTarget = 0;
  const still = uniforms.uTex.value[0];   // la fotografia vera, nitida: resta finché non si scorre
  if (!reducedMotion) {
    video = Object.assign(document.createElement('video'), { src: SHOTS[0].video, muted: true, playsInline: true, preload: 'auto' });
    const tex = new THREE.VideoTexture(video);
    const show = () => { tex.needsUpdate = true; };
    video.addEventListener('loadeddata', () => { dur = video.duration; vtex = tex; show(); });
    video.addEventListener('seeked', show);
  }

  let target = 0, b = 0;
  const pointer = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = 0.5 - e.clientY / innerHeight; });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 4);
    b += (target - b) * k;
    uniforms.uB.value = b;
    scrub += (scrubTarget - scrub) * k;
    const f = Math.min(scrub / 0.4, 1); uniforms.uFit.value = f * f * (3 - 2 * f);
    uniforms.uTex.value[0] = vtex && scrub > 0.004 ? vtex : still;
    if (dur && !video.seeking && Math.abs(video.currentTime - scrub * (dur - 0.05)) > 0.02) video.currentTime = scrub * (dur - 0.05);
    uniforms.uIntro.value += (1 - uniforms.uIntro.value) * (1 - Math.exp(-dt * 1.4));
    uniforms.uPointer.value.x += (pointer.x - uniforms.uPointer.value.x) * k;
    uniforms.uPointer.value.y += (pointer.y - uniforms.uPointer.value.y) * k;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { setTarget(v) { target = v; }, setScrub(v) { scrubTarget = v; }, setCenter(v) { uniforms.uCenter.value = v; } };
}
