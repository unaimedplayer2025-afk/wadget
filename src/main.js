// WADGET: Chain of Ages — main game.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Snd, SFX } from './audio.js';
import { rnd, pick, clamp, lerp, damp, angLerp, glow, additive, Tex, std } from './util.js';
import { buildHero, buildDisc, animLimbs, animWalrus, poseWadgetArms, buildZombieDino, buildTrainBandit, buildCowTerm, buildMatrixSentinel, buildSteer, GEO } from './models.js';
import { buildLayout, buildLayoutMeshes, buildSky, buildNav, navPath, colliders, pads, PORTAL_SPOTS, resolveHoriz, groundAt, pointInBox, ARENA_R, clearLine, useLayout, layoutId, spawnPoints, itemSpots, voidBounds } from './world.js';
import { ERAS, ERA_KEYS, BONUS_KEY, installCustomEra } from './eras.js';

const Q = new URLSearchParams(location.search);
if (Q.has('seed')) { let a = +Q.get('seed') || 1; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }   // reproducible capture runs
const CAPTURE = Q.has('capture'), DEMO = Q.has('demo') || CAPTURE;
const TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (TOUCH) document.body.classList.add('touch');
const PORTALS_NEEDED = 5, GRAV = 26, STEP = 0.45, START_ERA = ERA_KEYS[0];
const $ = id => document.getElementById(id);

// ------------------------------------------------------------------------------------------ renderer + post
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
let pixelRatio = Math.min(window.devicePixelRatio || 1, Q.has('lowfx') ? 0.75 : 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.015);
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 900);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex; scene.environmentIntensity = 0.6;
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera); composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(480, 270), 0.9, 0.55, 0.62); composer.addPass(bloom);
composer.addPass(new OutputPass());
let useBloom = !Q.has('lowfx');
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h); composer.setPixelRatio(pixelRatio);
  bloom.resolution.set(w / 2, h / 2);
  for (const c of [camera, titleCam, warpCam]) { c.aspect = w / h; c.updateProjectionMatrix(); }
}

// ------------------------------------------------------------------------------------------ world
let layout = null;
function rebuildLayoutMeshes() {
  if (layout) { scene.remove(layout.mesh, layout.edges); }
  layout = buildLayoutMeshes(); scene.add(layout.mesh, layout.edges);
}
buildLayout(); buildNav();
rebuildLayoutMeshes();
const sky = buildSky(); scene.add(sky);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshStandardMaterial()); ground.rotation.x = -Math.PI / 2; scene.add(ground);
const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1); scene.add(sun, sun.target);
const eraRes = {};
for (const k of ERA_KEYS) { eraRes[k] = ERAS[k].build(); eraRes[k].group.visible = false; scene.add(eraRes[k].group); }
const G = { mode: 'title', era: START_ERA, score: 0, portals: 0, t: 0, shake: 0, enemies: [], shots: [], portal: null, boss: null, kills: 0, eraKills: 0, eraT: 0, spawnT: 2, portalCD: 0, combo: 0, comboT: 0, lastSpot: null, orbs: [] };
window.__game = G;

function applyEra(key) {
  const E = ERAS[key], want = E.layout || 'default';
  if (useLayout(want)) rebuildLayoutMeshes();
  const R = eraRes[key]; G.era = key;
  for (const k of ERA_KEYS) eraRes[k].group.visible = (+k === +key);
  scene.fog.color.set(E.fog.color); scene.fog.density = E.fog.density;
  const u = sky.material.uniforms; u.top.value.set(E.sky.top); u.horizon.value.set(E.sky.horizon); u.bottom.value.set(E.sky.bottom); u.sun.value.set(E.sky.sun); u.sunOn.value = E.sky.sunOn; u.flash.value = 0;
  ground.visible = want !== 'bonus';
  ground.material = R.groundMat; layout.mesh.material = R.layoutMat;
  layout.edges.visible = R.edges.visible; layout.edges.material.color.set(R.edges.color).multiplyScalar(1.6);
  for (const p of pads) if (p.mesh) { p.mesh.material.color.set(E.palette.portal[1]).multiplyScalar(0.9); p.beam.material.color.set(E.palette.portal[1]); }
  hemi.color.set(E.lights.hemi[0]); hemi.groundColor.set(E.lights.hemi[1]); hemi.intensity = E.lights.hemi[2];
  sun.color.set(E.lights.dir[0]); sun.intensity = E.lights.dir[1]; sun.position.set(...E.lights.dir[2]);
  renderer.toneMappingExposure = E.lights.exposure; bloom.strength = E.lights.bloom;
  document.documentElement.style.setProperty('--accent', E.palette.accent); document.documentElement.style.setProperty('--accent2', E.palette.accent2);
  $('year').textContent = E.year; $('eraName').textContent = E.name;
  EraMusic.set(E.music || 'audio/gameplay');
  if (E.bonus && E.bonus.type) startBonusRound(E.bonus); else G.bonus = null;
}
// Gameplay music: loops in every era (including bonus). Swap files at audio/gameplay.{ogg,mp3}.
// An era can override with ERAS[k].music = 'audio/my-era' (base path; canPlayType picks ogg vs mp3).
// Title theme is a separate easy-to-swap pair: audio/title-theme.{ogg,mp3} (see audio.js).
function pickSrc(base) {
  if (/\.(ogg|mp3|wav|m4a)$/i.test(base)) return base;
  const a = document.createElement('audio');
  const ogg = a.canPlayType('audio/ogg; codecs="vorbis"') || a.canPlayType('audio/ogg; codecs="opus"');
  return ogg ? base + '.ogg' : base + '.mp3';
}
const EraMusic = {
  el: null, url: null, vol: 0,
  set(url) {
    const src = pickSrc(url || 'audio/gameplay');
    if (src === this.url) { this.sync(); return; }
    this.url = src;
    if (this.el) { this.el.pause(); this.el = null; }
    const a = new Audio(); a.loop = true; a.preload = 'auto'; a.src = src; a.volume = 0; this.el = a; this.vol = 0;
    this.sync();
  },
  sync() {
    if (!this.el) return;
    const want = G.mode !== 'title' && Snd.unlocked && !Snd.muted;
    if (want && this.el.paused) { const p = this.el.play(); if (p && p.catch) p.catch(() => {}); }
  },
  update(dt) {
    const want = G.mode !== 'title' && Snd.unlocked && !Snd.muted;
    this.vol = want ? Math.min(0.55, this.vol + dt * 0.8) : Math.max(0, this.vol - dt * 0.7);
    if (this.el) {
      if (want && this.el.paused) this.sync();
      try { this.el.volume = this.vol; } catch (e) {}
      if (!want && this.vol <= 0 && !this.el.paused) this.el.pause();
    }
  }
};

// ------------------------------------------------------------------------------------------ FX: particles, debris, rings, floating text
const PN = 1200;
const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pData = [];
for (let i = 0; i < PN; i++) { pData.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, r: 1, gg: 1, b: 1 }); pPos[i * 3 + 1] = -999; }
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.3, map: Tex.dot(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
points.frustumCulled = false; scene.add(points);
points.material.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n gl_PointSize = min(gl_PointSize, 22.0);'); };
let pNext = 0; const tmpC = new THREE.Color();
function emit(pos, n, color, spd = 6, o = {}) {
  for (let k = 0; k < n; k++) {
    const i = pNext; pNext = (pNext + 1) % PN; const d = pData[i];
    const c = Array.isArray(color) ? pick(color) : color; tmpC.set(c);
    const th = Math.random() * Math.PI * 2, ph = Math.acos(rnd(-1, 1)), s = spd * rnd(0.3, 1);
    d.vx = Math.sin(ph) * Math.cos(th) * s + (o.vx || 0); d.vy = Math.cos(ph) * s * (o.flat ? 0.2 : 1) + (o.up || 0); d.vz = Math.sin(ph) * Math.sin(th) * s + (o.vz || 0);
    d.life = d.max = rnd(0.4, 1) * (o.life || 0.8); d.g = o.g ?? 6; d.drag = o.drag ?? 1.5; d.r = tmpC.r * (o.bright || 2); d.gg = tmpC.g * (o.bright || 2); d.b = tmpC.b * (o.bright || 2);
    pPos[i * 3] = pos.x + (o.spread ? rnd(-o.spread, o.spread) : 0); pPos[i * 3 + 1] = pos.y + (o.spreadY ? rnd(0, o.spreadY) : 0); pPos[i * 3 + 2] = pos.z + (o.spread ? rnd(-o.spread, o.spread) : 0);
  }
}
function updateParticles(dt) {
  for (let i = 0; i < PN; i++) {
    const d = pData[i]; if (d.life <= 0) continue;
    d.life -= dt; const k = Math.max(0, d.life / d.max), dr = Math.exp(-d.drag * dt);
    d.vx *= dr; d.vz *= dr; d.vy = d.vy * dr - d.g * dt;
    pPos[i * 3] += d.vx * dt; pPos[i * 3 + 1] += d.vy * dt; pPos[i * 3 + 2] += d.vz * dt;
    pCol[i * 3] = d.r * k; pCol[i * 3 + 1] = d.gg * k; pCol[i * 3 + 2] = d.b * k;
    if (d.life <= 0) { pPos[i * 3 + 1] = -999; pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0; }
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}
// debris cubes
const DN = 220, debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.6 }), DN);
debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage); debris.frustumCulled = false; scene.add(debris);
const dData = []; const dm = new THREE.Matrix4(), dq = new THREE.Quaternion(), de = new THREE.Euler(), dv = new THREE.Vector3(), ds = new THREE.Vector3();
for (let i = 0; i < DN; i++) { dData.push({ life: 0, p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), r: new THREE.Vector3(), rv: new THREE.Vector3(), s: 0.1 }); debris.setColorAt(i, tmpC.set(0xffffff)); }
let dNext = 0;
function burstDebris(pos, n, colors, spd = 7, size = 0.12) {
  for (let k = 0; k < n; k++) {
    const d = dData[dNext]; debris.setColorAt(dNext, tmpC.set(pick(colors))); dNext = (dNext + 1) % DN;
    d.p.copy(pos).add(dv.set(rnd(-0.3, 0.3), rnd(0, 0.6), rnd(-0.3, 0.3))); d.v.set(rnd(-1, 1), rnd(0.4, 1.4), rnd(-1, 1)).multiplyScalar(spd);
    d.rv.set(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)); d.life = rnd(1.2, 2.2); d.s = size * rnd(0.6, 1.6);
  }
  debris.instanceColor.needsUpdate = true;
}
function updateDebris(dt) {
  for (let i = 0; i < DN; i++) {
    const d = dData[i];
    if (d.life > 0) {
      d.life -= dt; d.v.y -= 20 * dt; d.p.addScaledVector(d.v, dt); d.r.addScaledVector(d.rv, dt);
      const fl = groundAt(d.p, d.p.y + 0.3, 0.3, 0.01).y; if (d.p.y < fl + d.s / 2) { d.p.y = fl + d.s / 2; d.v.y *= -0.35; d.v.x *= 0.6; d.v.z *= 0.6; d.rv.multiplyScalar(0.6); }
    }
    const s = d.life > 0 ? d.s * Math.min(1, d.life * 2) : 0;
    dm.compose(d.p, dq.setFromEuler(de.set(d.r.x, d.r.y, d.r.z)), ds.set(s, s, s)); debris.setMatrixAt(i, dm);
  }
  debris.instanceMatrix.needsUpdate = true;
}
// expanding rings (shockwaves, portal pops)
const rings = [], ringTex = Tex.ring();
function ring(pos, color, maxR = 4, dur = 0.5, vertical = null) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), additive(color, 1, { map: ringTex, side: THREE.DoubleSide }));
  m.position.copy(pos); if (vertical === null) m.rotation.x = -Math.PI / 2; else m.rotation.y = vertical;
  scene.add(m); rings.push({ m, t: 0, dur, maxR });
}
function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt; const k = r.t / r.dur; r.m.scale.setScalar(0.1 + r.maxR * k); r.m.material.opacity = 1 - k;
    if (k >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); }
  }
}
// floating DOM text
const floats = [];
function floatText(pos, text, color = '#fff', size = 16) {
  const el = document.createElement('div'); el.className = 'float'; el.textContent = text; el.style.color = color; el.style.fontSize = size + 'px'; document.body.appendChild(el);
  floats.push({ el, p: pos.clone(), t: 0 });
}
const proj = new THREE.Vector3();
function toScreen(p, out = {}) { proj.copy(p).project(camera); out.x = (proj.x * 0.5 + 0.5) * innerWidth; out.y = (-proj.y * 0.5 + 0.5) * innerHeight; out.behind = proj.z > 1; return out; }
function updateFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; f.p.y += dt * 1.2; const s = toScreen(f.p);
    f.el.style.left = s.x + 'px'; f.el.style.top = s.y + 'px'; f.el.style.opacity = s.behind ? 0 : Math.min(1, 2.5 - f.t * 2.5);
    if (f.t > 1) { f.el.remove(); floats.splice(i, 1); }
  }
}
let msgT = 0, quipT = 0;
function showMsg(a, b = '', dur = 2) { $('msg').textContent = a; $('sub').textContent = b; $('msg').style.opacity = 1; $('sub').style.opacity = b ? 1 : 0; msgT = dur; }
function quip(text, dur = 2.2) { $('quip').textContent = 'Wadget: ' + text; $('quip').style.opacity = 1; quipT = dur; }
let flashA = 0, hurtA = 0;
function flash(a = 0.8) { flashA = Math.max(flashA, a); }

// ------------------------------------------------------------------------------------------ hero
const H = buildHero(); scene.add(H.root);
const disc = buildDisc(1); scene.add(disc);
const CHAIN_N = 18;
const chain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.045, 0.16), new THREE.MeshStandardMaterial({ color: 0x8a8a90, metalness: 1, roughness: 0.3, emissive: 0x400800 }), CHAIN_N);
chain.frustumCulled = false; scene.add(chain);
const hero = {
  pos: H.root.position, vel: new THREE.Vector3(), yaw: Math.PI, onGround: true, hp: 100, maxHp: 100, armor: 0,
  rollT: 0, rollCD: 0, rollDir: new THREE.Vector3(), hurtT: 0, throwT: 0, phase: 0, launched: false, airT: 0, jumpBuf: 0, coyote: 0, dead: false,
  lastSafe: new THREE.Vector3(0, 0, 20),
  disc: { state: 'held', pos: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0, target: null, hits: new Set(), dir: new THREE.Vector3() },
};
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const handPos = new THREE.Vector3();
function resetHero(pos) {
  hero.pos.copy(pos); hero.vel.set(0, 0, 0); hero.hp = hero.maxHp; hero.armor = 0; hero.rollT = 0; hero.hurtT = 0; hero.dead = false; hero.launched = false; hero.lastSafe.copy(pos);
  hero.disc.state = 'held'; H.root.visible = true; H.root.scale.setScalar(1); H.body.rotation.set(0, 0, 0); H.body.position.y = 0;
}
function hurtHero(dmg, from) {
  if (G.mode !== 'play' || hero.rollT > 0 || hero.hurtT > 0 || hero.dead) return false;
  if (DEMO) dmg *= 0.3;
  if (hero.armor > 0) { const a = Math.min(hero.armor, dmg); hero.armor -= a; dmg -= a; }
  if (dmg <= 0) { hero.hurtT = 0.25; return true; }
  hero.hp -= dmg; hero.hurtT = 0.45; hurtA = 0.8; SFX.hurt(); G.shake = Math.max(G.shake, 0.25);
  if (from) { tmpV.subVectors(hero.pos, from).setY(0).normalize(); hero.vel.addScaledVector(tmpV, 4); }
  emit(tmpV2.copy(hero.pos).setY(hero.pos.y + 1.1), 10, [0xff2a1a, 0x5cff3a], 5);
  if (DEMO) hero.hp = Math.max(hero.hp, 35);
  if (hero.hp <= 0) { hero.hp = 0; heroDie(); } else if (Math.random() < 0.25) quip(pick(['THAT ALL YOU GOT?', 'ARGH!', 'TOUGHER THAN YOU.']));
  return true;
}
function heroDie() {
  hero.dead = true; SFX.die(); burstDebris(tmpV.copy(hero.pos).setY(hero.pos.y + 0.8), 20, [0x1a120e, 0x3a3a42, 0x5cff3a], 6); emit(tmpV, 40, [0xff2a1a, 0x5cff3a], 8);
  H.root.visible = false; disc.visible = false; chain.visible = false;
  setTimeout(() => endGame(false), CAPTURE ? 0 : 1600);
}

// ------------------------------------------------------------------------------------------ input
const keys = {}; const input = { mx: 0, my: 0, jump: false, roll: false, throw: false, lookIdle: 99 };
const touchState = { stickId: null, sx: 0, sy: 0, lookId: null, lx: 0, ly: 0, vx: 0, vy: 0 };
const camState = { yaw: 0, pitch: 0.38, dist: 9.0, target: new THREE.Vector3(), curDist: 9.0 };
function anyStartInput(e) {
  if (G.mode === 'title') { if (DEMO && !e) return; titleInput(); return true; }
  if ((G.mode === 'win' || G.mode === 'over') && G.endT > 1.2) { toTitle(); return true; }
  return false;
}
addEventListener('keydown', e => {
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (e.repeat) return;
  keys[e.code] = true;
  if (anyStartInput(e)) return;
  if (G.mode !== 'play') return;
  if (e.code === 'Space') { input.jump = true; e.preventDefault(); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyC') input.roll = true;
  if (e.code === 'KeyF' || e.code === 'KeyJ' || e.code === 'Enter') input.throw = true;
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
let dragging = false, dragX = 0, dragY = 0;
canvas.addEventListener('mousedown', e => {
  if (TOUCH && e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
  if (anyStartInput(e)) { if (G.mode === 'play') lockPointer(); return; }
  if (G.mode !== 'play') return;
  if (document.pointerLockElement === canvas) { if (e.button === 0) input.throw = true; if (e.button === 2) input.roll = true; }
  else { lockPointer(); dragging = true; dragX = e.clientX; dragY = e.clientY; }
});
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', e => {
  if (G.mode !== 'play') return;
  if (document.pointerLockElement === canvas) look(e.movementX, e.movementY, 0.0024);
  else if (dragging) { look(e.clientX - dragX, e.clientY - dragY, 0.005); dragX = e.clientX; dragY = e.clientY; }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
function lockPointer() { if (TOUCH || DEMO || !canvas.requestPointerLock) return; try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
function look(dx, dy, s) { camState.yaw -= dx * s; camState.pitch = clamp(camState.pitch + dy * s, -0.45, 1.15); input.lookIdle = 0; }
// touch
addEventListener('touchstart', e => {
  if (e.target.id === 'mute') return;
  if (anyStartInput(e)) { e.preventDefault(); return; }
  if (G.mode !== 'play') return;
  for (const t of e.changedTouches) {
    const btn = t.target.closest && t.target.closest('.tbtn');
    if (btn) { if (btn.id === 'bDisc') input.throw = true; if (btn.id === 'bJump') input.jump = true; if (btn.id === 'bRoll') input.roll = true; btn.style.background = 'rgba(255,255,255,.3)'; continue; }
    if (t.clientX < innerWidth * 0.42 && touchState.stickId === null) {
      touchState.stickId = t.identifier; touchState.sx = t.clientX; touchState.sy = t.clientY; touchState.vx = touchState.vy = 0;
      const st = $('stick'); st.style.display = 'block'; st.style.left = (t.clientX - 60) + 'px'; st.style.top = (t.clientY - 60) + 'px'; $('knob').style.transform = '';
    } else if (touchState.lookId === null) { touchState.lookId = t.identifier; touchState.lx = t.clientX; touchState.ly = t.clientY; }
  }
  e.preventDefault();
}, { passive: false });
addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === touchState.stickId) {
      let dx = t.clientX - touchState.sx, dy = t.clientY - touchState.sy; const d = Math.hypot(dx, dy), m = 50; if (d > m) { dx *= m / d; dy *= m / d; }
      touchState.vx = dx / m; touchState.vy = dy / m; $('knob').style.transform = `translate(${dx}px,${dy}px)`;
    } else if (t.identifier === touchState.lookId) { look(t.clientX - touchState.lx, t.clientY - touchState.ly, 0.006); touchState.lx = t.clientX; touchState.ly = t.clientY; }
  }
  e.preventDefault();
}, { passive: false });
const touchEnd = e => {
  for (const t of e.changedTouches) {
    if (t.identifier === touchState.stickId) { touchState.stickId = null; touchState.vx = touchState.vy = 0; $('stick').style.display = 'none'; }
    if (t.identifier === touchState.lookId) touchState.lookId = null;
  }
  document.querySelectorAll('.tbtn').forEach(b => b.style.background = '');
};
addEventListener('touchend', touchEnd); addEventListener('touchcancel', touchEnd);
$('mute').addEventListener('click', e => { e.stopPropagation(); toggleMute(); });
$('mute').addEventListener('touchstart', e => { e.stopPropagation(); }, { passive: true });
function toggleMute() { const m = Snd.toggleMute(); $('mute').innerHTML = m ? '&#128263;' : '&#128266;'; EraMusic.sync(); }
function readMove() {
  let x = 0, y = 0;
  if (keys.KeyW || keys.ArrowUp) y += 1; if (keys.KeyS || keys.ArrowDown) y -= 1; if (keys.KeyD || keys.ArrowRight) x += 1; if (keys.KeyA || keys.ArrowLeft) x -= 1;
  x += touchState.vx; y -= touchState.vy;
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  input.mx = x; input.my = y;
}

// ------------------------------------------------------------------------------------------ hero update
const moveDir = new THREE.Vector3();
function camForwardXZ(out) { return out.set(-Math.sin(camState.yaw), 0, -Math.cos(camState.yaw)); }
function updateHero(dt) {
  if (hero.dead) return;
  const fwd = camForwardXZ(tmpV), right = tmpV2.set(-fwd.z, 0, fwd.x);
  moveDir.set(0, 0, 0).addScaledVector(fwd, input.my).addScaledVector(right, input.mx);
  const mlen = Math.min(1, moveDir.length());
  hero.rollCD -= dt; hero.hurtT -= dt; hero.throwT -= dt; hero.jumpBuf -= dt; hero.coyote -= dt;
  if (input.jump) hero.jumpBuf = 0.15;
  // roll
  if (input.roll && hero.rollCD <= 0 && hero.rollT <= 0 && hero.onGround) {
    hero.rollT = 0.48; hero.rollCD = 0.75; SFX.roll();
    if (mlen > 0.1) hero.rollDir.copy(moveDir).normalize(); else hero.rollDir.set(Math.sin(hero.yaw), 0, Math.cos(hero.yaw));
    hero.yaw = Math.atan2(hero.rollDir.x, hero.rollDir.z);
  }
  let speed = 8.2, accel = hero.onGround ? 14 : 4;
  const want = tmpV3.copy(moveDir).multiplyScalar(speed);
  if (hero.rollT > 0) { hero.rollT -= dt; want.copy(hero.rollDir).multiplyScalar(13); accel = 30; }
  if (hero.launched) accel = 0.6;
  hero.vel.x = damp(hero.vel.x, want.x, accel, dt); hero.vel.z = damp(hero.vel.z, want.z, accel, dt);
  // jump
  if (hero.jumpBuf > 0 && (hero.onGround || hero.coyote > 0) && hero.rollT <= 0) { hero.vel.y = 9.6; hero.onGround = false; hero.coyote = 0; hero.jumpBuf = 0; SFX.jump(); emit(tmpV.copy(hero.pos), 8, 0xcccccc, 2, { flat: true, g: 0 }); }
  hero.vel.y -= GRAV * dt;
  const prevY = hero.pos.y, wasGround = hero.onGround;
  hero.pos.x += hero.vel.x * dt; hero.pos.z += hero.vel.z * dt; resolveHoriz(hero.pos, 0.9, 1.6);
  hero.pos.y += hero.vel.y * dt;
  const g = groundAt(hero.pos, prevY, wasGround ? STEP : 0.05);
  if (hero.pos.y <= g.y) {
    if (!wasGround && hero.airT > 0.35) { SFX.land(); emit(tmpV.copy(hero.pos), 10, 0xaaaaaa, 3, { flat: true, g: 0 }); }
    hero.pos.y = g.y; if (hero.vel.y < 0) hero.vel.y = 0; hero.onGround = true; hero.launched = false; hero.airT = 0;
    if (g.box && g.box.kind === 'pad') launchPad(g.box);
    if (g.y > -50) hero.lastSafe.copy(hero.pos);
  } else { if (wasGround) hero.coyote = 0.1; hero.onGround = false; hero.airT += dt; }
  if (hero.pos.y < -8) {
    if (DEMO) { hero.pos.copy(hero.lastSafe); hero.vel.set(0, 0, 0); hero.launched = false; }
    else heroDie();
  }
  // facing
  if (hero.throwT > 0 && hero.disc.aimYaw !== undefined) hero.yaw = angLerp(hero.yaw, hero.disc.aimYaw, 1 - Math.exp(-20 * dt));
  else if (mlen > 0.1 && hero.rollT <= 0) hero.yaw = angLerp(hero.yaw, Math.atan2(moveDir.x, moveDir.z), 1 - Math.exp(-12 * dt));
  H.root.rotation.y = hero.yaw;
  // throw
  if (input.throw) throwDisc();
  animateHero(dt, Math.hypot(hero.vel.x, hero.vel.z));
  updateDisc(dt);
  // blob shadow sits on the floor under the hero
  const fl = groundAt(hero.pos, hero.pos.y + 0.01, 0.01).y; H.shadow.position.y = fl - hero.pos.y + 0.03; H.shadow.material.opacity = 0.45 * clamp(1 - (hero.pos.y - fl) / 6, 0.1, 1);
}
function launchPad(box) {
  const p = pads.find(q => q.box === box); if (!p) return;
  const d = tmpV.subVectors(p.target, hero.pos);
  const T = clamp(Math.max(1.15, Math.hypot(d.x, d.z) / 14), 1.1, 2.2);
  hero.vel.set(d.x / T, (d.y + 0.5 * GRAV * T * T) / T, d.z / T); hero.onGround = false; hero.launched = true;
  SFX.pad(); emit(tmpV2.copy(hero.pos), 30, ERAS[G.era].palette.portal, 6, { up: 6, g: 4 }); ring(tmpV2.setY(hero.pos.y + 0.1), ERAS[G.era].palette.portal[1], 3, 0.4);
}
function animateHero(dt, sp) {
  const P = H;
  if (hero.rollT > 0) {
    const k = 1 - hero.rollT / 0.48; P.body.rotation.x = k * Math.PI * 2; P.body.position.y = Math.sin(k * Math.PI) * 0.12;
  } else {
    P.body.rotation.x = damp(P.body.rotation.x, 0, 12, dt);
    if (!hero.onGround) {
      P.body.position.y = 0.08;
      P.legL.hip.rotation.x = 0.55; P.legR.hip.rotation.x = 0.55;
      if (P.wadget) { poseWadgetArms(P, G.t); P.wadget.position.y = 0.68; }
    } else {
      hero.phase += dt * (3 + sp * 1.25);
      const amt = clamp(sp / 8, 0, 1);
      animWalrus(P, hero.phase, amt, G.t);
      if (amt > 0.3 && Math.sin(hero.phase) * Math.sin(hero.phase - dt * (3 + sp * 1.25)) < 0) emit(tmpV.copy(hero.pos), 2, 0x999999, 1, { flat: true, g: 0, life: 0.4 });
    }
  }
  if (hero.throwT > 0 && P.wadget) {
    const k = hero.throwT / 0.3;
    P.armR.sh.rotation.x = -1.1 + (1 - k) * 0.3; P.armR.sh.rotation.z = -0.15; P.armR.el.rotation.x = 0.05;
    P.head.rotation.y = -0.2 * k;
  }
  H.root.visible = !(hero.hurtT > 0 && Math.floor(G.t * 30) % 2 === 0);
}

// ------------------------------------------------------------------------------------------ disc: throw, boomerang, soft lock-on
const center = (e, out) => out.copy(e.pos).setY(e.pos.y + e.def.hitY);
function targets() { return G.boss && !G.boss.dead ? G.enemies.concat([G.boss]) : G.enemies; }
function findLock() {
  const fwd = camForwardXZ(new THREE.Vector3()), chest = tmpV3.copy(hero.pos).setY(hero.pos.y + 1.7);
  let best = null, bs = 1e9; const c = new THREE.Vector3();
  for (const e of targets()) {
    if (e.dead || e.spawnT > 0) continue;
    center(e, c); const v = c.sub(chest), d = v.length(); if (d > 30) continue;
    const ang = Math.acos(clamp((v.x * fwd.x + v.z * fwd.z) / (Math.hypot(v.x, v.z) || 1), -1, 1));
    if (ang > 1.0 && d > 7) continue;
    const s = d * 0.35 + ang * 9; if (s < bs) { bs = s; best = e; }
  }
  return best;
}
function throwDisc() {
  const D = hero.disc; if (D.state !== 'held' || hero.rollT > 0 || hero.dead) return;
  D.target = findLock(); H.root.updateMatrixWorld(true); H.discMount.getWorldPosition(D.pos);
  if (D.target) center(D.target, tmpV).sub(D.pos).normalize();
  else { camera.getWorldDirection(tmpV); tmpV.y = clamp(tmpV.y + 0.12, -0.25, 0.35); tmpV.normalize(); }
  D.vel.copy(tmpV).multiplyScalar(30); D.state = 'out'; D.t = 0; D.hits.clear(); D.aimYaw = Math.atan2(tmpV.x, tmpV.z);
  hero.throwT = 0.3; SFX.throw();
}
const bez = new THREE.Vector3(), cm = new THREE.Matrix4(), cq = new THREE.Quaternion(), cs = new THREE.Vector3(1, 1, 1), prevPt = new THREE.Vector3();
function updateDisc(dt) {
  const D = hero.disc; H.root.updateMatrixWorld(true); H.discMount.getWorldPosition(handPos);
  const spin = disc.userData.spin;
  if (D.state === 'held') {
    disc.position.copy(handPos); H.discMount.getWorldQuaternion(disc.quaternion); spin.rotation.y += dt * 5; chain.visible = false; disc.visible = H.root.visible || hero.hurtT > 0;
    disc.userData.halo.material.opacity = 0.35; return;
  }
  disc.visible = true; chain.visible = true; disc.userData.halo.material.opacity = 0.7;
  D.t += dt; spin.rotation.y += dt * 38;
  if (D.state === 'out') {
    if (D.target && !D.target.dead) { center(D.target, tmpV).sub(D.pos); const dist = tmpV.length(); tmpV.normalize().multiplyScalar(32); D.vel.lerp(tmpV, 1 - Math.exp(-11 * dt)); if (dist < 0.6) D.t = 9; }
    D.pos.addScaledVector(D.vel, dt);
    if (D.t > 0.55 || D.pos.distanceTo(hero.pos) > 26) { D.state = 'back'; D.t = 0; D.hits.clear(); }
  } else {
    tmpV.subVectors(handPos, D.pos); const dist = tmpV.length(); tmpV.normalize().multiplyScalar(26 + D.t * 30); D.vel.lerp(tmpV, 1 - Math.exp(-14 * dt));
    D.pos.addScaledVector(D.vel, dt);
    if (dist < 0.9 || D.t > 2.5) { D.state = 'held'; SFX.catch(); emit(handPos, 6, 0xff3a1a, 2); }
  }
  disc.position.copy(D.pos); disc.quaternion.setFromAxisAngle(tmpV2.set(D.vel.z, 0, -D.vel.x).normalize(), 0.25);
  if (Math.random() < 0.8) emit(D.pos, 1, [0xff2a1a, 0xff6a2a], 0.5, { g: 0, life: 0.35 });
  // hits
  const c = tmpV3;
  for (const e of targets()) {
    if (e.dead || e.spawnT > 0 || D.hits.has(e)) continue;
    center(e, c); if (c.distanceTo(D.pos) < e.def.hitR + 0.45) { D.hits.add(e); damageEnemy(e, 1, D.vel); if (D.state === 'out' && e === D.target) { D.state = 'back'; D.t = 0; D.hits.clear(); D.hits.add(e); } }
  }
  for (const s of G.shots) if (!s.dead && s.pos.distanceTo(D.pos) < 0.9) { s.dead = true; SFX.clang(); emit(s.pos, 8, [0xffffff, 0xff6a2a], 5); addScore(10, s.pos); }
  // chain: sagging curve from the hand to the disc
  const len = handPos.distanceTo(D.pos), sag = Math.min(1.2, len * 0.08) * (D.state === 'out' ? 0.4 : 1);
  prevPt.copy(handPos);
  for (let i = 0; i < CHAIN_N; i++) {
    const k = (i + 1) / CHAIN_N; bez.lerpVectors(handPos, D.pos, k); bez.y -= Math.sin(k * Math.PI) * sag;
    tmpV.subVectors(bez, prevPt); const l = tmpV.length() || 0.001; cq.setFromUnitVectors(tmpV2.set(0, 0, 1), tmpV.divideScalar(l));
    cs.set(1, 1, Math.min(4, l / 0.16)); cm.compose(tmpV2.lerpVectors(prevPt, bez, 0.5), cq, cs); chain.setMatrixAt(i, cm); prevPt.copy(bez);
  }
  chain.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------------------------------------ enemies (registry; ERAS[k].roster picks which types appear in which year)
// ai(e, dt, ctx) drives each; flying types skip ground physics.
const ENEMY_TYPES = {
  zdino:     { name: 'ZOMBIE DINO', build: buildZombieDino, hp: 2, r: 0.35, h: 1.1, hitY: 0.7, hitR: 0.55, score: 150, kind: 'beast', ai: aiDino, debris: [0x3a5a28, 0xd8d0b8, 0x39ff3a] },
  bandit:    { name: 'TRAIN BANDIT', build: buildTrainBandit, hp: 3, r: 0.4, h: 1.85, hitY: 1.15, hitR: 0.6, score: 250, kind: 'machine', ai: aiBandit, debris: [0x6a5a48, 0xb8863a, 0xff9a2a] },
  cowterm:   { name: 'COW TERMINATOR', build: () => buildCowTerm(1), hp: 4, r: 0.7, h: 1.6, hitY: 0.95, hitR: 0.9, score: 300, kind: 'machine', ai: aiCow, debris: [0xc8ccd6, 0x2a2c32, 0xff1a10] },
  sentinel:  { name: 'GRID SENTINEL', build: () => buildMatrixSentinel(1), hp: 2, r: 0.9, h: 1, hitY: 0, hitR: 1.05, score: 200, kind: 'machine', fly: true, ai: aiMatrix, debris: [0x1a2218, 0x39ff6a, 0x8aa090] },
  steer:     { name: 'THE OMEGA STEER', build: () => buildSteer(1), hp: 40, r: 1.5, h: 3.4, hitY: 2.0, hitR: 2.0, score: 5000, kind: 'machine', ai: aiBoss, scale: 1.8, debris: [0xc8ccd6, 0x2a2c32, 0xff1a10] },
};
function collectMats(root) { const s = new Set(); root.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) s.add(o.material); }); return [...s].map(m => ({ m, e: m.emissive.clone() })); }
function makeEnemy(type, pos) {
  const def = ENEMY_TYPES[type], P = def.build();
  const e = { type, def, P, pos: P.root.position, vel: new THREE.Vector3(), hp: def.hp, era: G.era, st: 'idle', t: 0, cool: rnd(0.8, 2), flash: 0, yaw: 0, onGround: false, spawnT: 0.6, dead: false, phase: Math.random() * 6, mats: null, air: false };
  e.pos.copy(pos); e.mats = collectMats(P.root);
  if (P.hipY === undefined) P.hipY = P.hips ? P.hips.position.y : 0;
  scene.add(P.root); G.enemies.push(e);
  // arrival FX per era
  const fx = ERAS[G.era].spawnFx, c = tmpV.copy(pos).setY(pos.y + 1);
  if (fx === 'dust') { emit(c, 28, [0xc8a060, 0xffb02a, 0xffffff], 4, { flat: true, g: 1, life: 0.6 }); }
  else if (fx === 'code') { emit(c, 30, [0x39ff6a, 0xa0ffc0, 0xffffff], 7, { g: 0, life: 0.5 }); ring(tmpV2.copy(pos).setY(pos.y + 0.1), 0x39ff6a, 2.5, 0.4); }
  else { emit(c, 30, [0x5cff3a, 0xff2ad4, 0xffffff], 5, { spread: 0.5, spreadY: 1, g: -2, life: 0.7 }); }
  P.root.scale.multiplyScalar(0.01); e.baseScale = def.scale || 1;
  return e;
}
function spawnFromRoster() {
  const roster = ERAS[G.era].roster, types = Object.keys(roster); if (!types.length) return null; let tot = 0; for (const k of types) tot += roster[k];
  let r = Math.random() * tot, type = types[0]; for (const k of types) { r -= roster[k]; if (r <= 0) { type = k; break; } }
  if (DEMO) type = types[(G.spawnIdx = (G.spawnIdx || 0) + 1) % types.length];   // demo: show the whole roster
  const def = ENEMY_TYPES[type];
  if (spawnPoints.length) {
    const far = spawnPoints.filter(s => s.distanceTo(hero.pos) > 7);
    const p = (far.length ? pick(far) : pick(spawnPoints)).clone();
    if (def.fly) p.y += rnd(4, 7);
    return makeEnemy(type, p);
  }
  for (let k = 0; k < 30; k++) {
    const a = Math.random() * Math.PI * 2, d = rnd(11, 22), p = new THREE.Vector3(hero.pos.x + Math.cos(a) * d, 0, hero.pos.z + Math.sin(a) * d);
    if (Math.hypot(p.x, p.z) > ARENA_R - 2) continue;
    if (def.fly) { p.y = rnd(6, 9) + hero.pos.y * 0.5; return makeEnemy(type, p); }
    p.y = 0; if (pointInBox(tmpV.copy(p).setY(0.5), 0.6)) continue;
    return makeEnemy(type, p);
  }
  return null;
}
function damageEnemy(e, dmg, dir) {
  if (e.dead) return;
  e.hp -= dmg; e.flash = 0.12; G.shake = Math.max(G.shake, e === G.boss ? 0.15 : 0.08);
  const c = center(e, new THREE.Vector3());
  if (e.def.kind === 'machine') { SFX.clang(); emit(c, 14, [0xffffff, 0xffc23a, 0xff6a2a], 7); }
  else { SFX.hit(); emit(c, 14, [0x5cff3a, 0xff2ad4, 0xffffff], 5); }
  if (dir && e !== G.boss) { tmpV.copy(dir).setY(0).normalize(); e.vel.addScaledVector(tmpV, e.def.fly ? 5 : 6); if (!e.def.fly) e.vel.y = 3; }
  if (e === G.boss) { $('bossHp').style.width = (100 * Math.max(0, e.hp) / e.maxHp) + '%'; if (Math.random() < 0.2) floatText(c.setY(c.y + 2), pick(['DAMAGE: ACCEPTABLE.', 'RECALCULATING...', 'MOO-TAL ERROR.']), '#ff4a3a', 14); }
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dead = true; const c = center(e, new THREE.Vector3());
  G.kills++; G.eraKills++; G.combo = G.comboT > 0 ? G.combo + 1 : 1; G.comboT = 2.5;
  addScore(e.def.score * Math.min(G.combo, 5), c, G.combo > 1 ? ' x' + Math.min(G.combo, 5) : '');
  if (e === G.boss) return bossDeath(e);
  if (e.def.kind === 'machine') { SFX.boom(); burstDebris(c, 16, e.def.debris, 7, e.def.fly ? 0.2 : 0.13); emit(c, 40, [0xff6a1a, 0xffc23a, 0xff2a0a], 9, { g: 2 }); G.shake = Math.max(G.shake, 0.3); }
  else { SFX.ko(); burstDebris(c, 18, e.def.debris, 5, 0.1); emit(c, 36, e.def.debris.concat([0xffffff]), 6, { spread: 0.3, spreadY: 1.2, g: -1 }); floatText(c.clone().setY(c.y + 0.8), pick(['KO!', 'CHOMPED!', 'RUSTED!', 'UNPLUGGED!']), ERAS[G.era].palette.accent2, 18); }
  if (Math.random() < 0.12) dropOrb(c);
  if (Math.random() < 0.18) quip(pick(ERAS[e.era].quips.kill));
  scene.remove(e.P.root);
}
function addScore(n, pos, suf = '') { G.score += n; if (pos) floatText(tmpV.copy(pos).setY(pos.y + 0.6), '+' + n + suf, '#fff', 15); }
function dropOrb(p, type = 'health', persist = false) {
  const col = type === 'armor' ? 0xffd24a : 0x3aff8a;
  const gy = groundAt(p, (p.y || 0) + 2, 2).y;
  const base = (gy > -50 ? gy : p.y) + 0.7;
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(type === 'armor' ? 0.34 : 0.3), glow(col, 2));
  m.position.copy(p).setY(base); scene.add(m);
  G.orbs.push({ m, t: 0, base, type, persist });
}
function updateOrbs(dt) {
  for (let i = G.orbs.length - 1; i >= 0; i--) {
    const o = G.orbs[i]; o.t += dt; o.m.position.y = damp(o.m.position.y, o.base + Math.sin(o.t * 3) * 0.15, 4, dt); o.m.rotation.y += dt * 3;
    if (o.m.position.distanceTo(tmpV.copy(hero.pos).setY(hero.pos.y + 0.8)) < 1.6) {
      if (o.type === 'armor') { hero.armor = Math.min(100, hero.armor + 40); emit(o.m.position, 20, 0xffd24a, 4); floatText(o.m.position.clone(), '+ARMOR', '#ffd24a', 14); }
      else { hero.hp = Math.min(hero.maxHp, hero.hp + 25); emit(o.m.position, 20, 0x3aff8a, 4); }
      SFX.pickup(); scene.remove(o.m); G.orbs.splice(i, 1); continue;
    }
    if (!o.persist && o.t > 14) { scene.remove(o.m); G.orbs.splice(i, 1); }
  }
}
function seedBonusItems() {
  for (const s of itemSpots) dropOrb(s.p.clone(), s.type, true);
}
function startBonusRound(cfg) {
  const dur = DEMO ? 12 : (cfg.duration || 60);
  G.bonus = { type: cfg.type || 'survival', duration: dur, t: dur, done: false };
  seedBonusItems();
}
function updateBonus(dt) {
  if (!G.bonus || G.bonus.done || G.mode !== 'play') return;
  G.bonus.t -= dt;
  if (G.bonus.t <= 0) {
    G.bonus.t = 0; G.bonus.done = true;
    showMsg('ROUND COMPLETE', 'A PORTAL OPENS', 2.0);
    G.eraKills = 99; G.portalCD = 0;
  }
}

const heroChest = new THREE.Vector3();
const ctx = { dir: new THREE.Vector3(), d: 0, dy: 0 };
function updateEnemies(dt) {
  heroChest.copy(hero.pos).setY(hero.pos.y + 1.0);
  for (const e of G.enemies.concat(G.boss && !G.boss.dead ? [G.boss] : [])) {
    if (e.dead) continue;
    const P = e.P;
    if (e.spawnT > 0) {
      e.spawnT -= dt; const k = 1 - Math.max(0, e.spawnT) / 0.6;
      const flick = ERAS[e.era] && ERAS[e.era].spawnFx === 'rift' ? (Math.random() < 0.5 ? 1.15 : 0.85) : 1;
      P.root.scale.set(e.baseScale * k * flick, e.baseScale * Math.min(1, k * 1.4), e.baseScale * k);
      if (e.spawnT <= 0) P.root.scale.setScalar(e.baseScale);
      if (!e.def.fly) groundPhysics(e, dt);
      continue;
    }
    e.t += dt; e.cool -= dt;
    ctx.dir.subVectors(hero.pos, e.pos); ctx.dy = ctx.dir.y; ctx.dir.y = 0; ctx.d = ctx.dir.length(); ctx.dir.divideScalar(ctx.d || 1);
    if (!e.want) e.want = new THREE.Vector3();
    e.def.ai(e, dt, ctx);
    if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0) { e.burst--; e.burstT = e.burstGap || 0.13; e.fireFn(); } }
    if (!e.def.fly) groundPhysics(e, dt);
    if (e.pos.y < -8) { killEnemy(e); continue; }
    if (!e.def.fly) P.root.rotation.y = e.yaw;
    if (e.flash > 0 || e.flashOn) {
      e.flash -= dt; const on = e.flash > 0;
      if (on !== e.flashOn) { for (const m of e.mats) { if (on) m.m.emissive.setScalar(e.def.kind === 'machine' ? (e === G.boss ? 0.35 : 0.6) : 1.2); else m.m.emissive.copy(m.e); } e.flashOn = on; }
    }
  }
  G.enemies = G.enemies.filter(e => !e.dead);
}
function groundPhysics(e, dt) {
  if (!e.air && e.onGround) { const k = 1 - Math.exp(-10 * dt); e.vel.x += (e.want ? e.want.x - e.vel.x : -e.vel.x) * k; e.vel.z += (e.want ? e.want.z - e.vel.z : -e.vel.z) * k; }
  e.vel.y -= GRAV * dt;
  const p = e.pos, prevY = p.y, was = e.onGround;
  p.x += e.vel.x * dt; p.z += e.vel.z * dt; resolveHoriz(p, e.def.r, e.def.h);
  p.y += e.vel.y * dt;
  const g = groundAt(p, prevY, was ? STEP : 0.05);
  if (p.y <= g.y) { p.y = g.y; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; } else e.onGround = false;
  for (const o of G.enemies) {   // light separation so mobs don't stack
    if (o === e || o.def.fly || o.dead) continue; const dx = p.x - o.pos.x, dz = p.z - o.pos.z, d2 = dx * dx + dz * dz, m = e.def.r + o.def.r;
    if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2), k = (m - d) / d * 0.5; p.x += dx * k; p.z += dz * k; }
  }
}
const handW = new THREE.Vector3();
function shootAt(kind, from, speed, spread = 0, target = heroChest) {
  const d = tmpV2.subVectors(target, from).normalize();
  if (spread) { d.x += rnd(-spread, spread); d.y += rnd(-spread, spread) * 0.5; d.z += rnd(-spread, spread); d.normalize(); }
  fireShot(kind, from, d.multiplyScalar(speed));
}
function faceTo(e, dir, dt, k = 10) { e.yaw = angLerp(e.yaw, Math.atan2(dir.x, dir.z), 1 - Math.exp(-k * dt)); }

function aiDino(e, dt, c) {
  const P = e.P; e.want.set(0, 0, 0);
  if (c.d > 1.6) e.want.copy(c.dir).multiplyScalar(c.d > 8 ? 6.2 : 4.5);
  faceTo(e, c.dir, dt, 12);
  if (c.d < 1.8 && Math.abs(c.dy) < 1.4 && e.cool <= 0) { e.cool = 0.7; e.swipe = 0.28; hurtHero(10, e.pos); SFX.hit(); }
  if (c.d > 3 && c.d < 9 && e.onGround && e.cool <= 0 && Math.random() < dt * 0.6) { e.vel.y = 7.5; e.vel.addScaledVector(c.dir, 5); e.onGround = false; e.cool = 1.4; }
  const sp = Math.hypot(e.vel.x, e.vel.z); e.phase += dt * (4 + sp * 2);
  animLimbs(P, e.phase, clamp(sp / 5, 0, 1));
  if (P.head) P.head.rotation.x = 0.5 + Math.sin(e.t * 8) * 0.15;
  if (e.swipe > 0) { e.swipe -= dt; if (P.armL) P.armL.sh.rotation.x = -1.8; }
}

function chooseCover(e) {
  let best = null, bd = 1e9;
  for (const b of colliders) {
    if (b.kind === 'pad' || b.kind === 'step') continue;
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const d = Math.hypot(cx - hero.pos.x, cz - hero.pos.z); if (d < 4 || d > 16) continue;
    const behind = (cx - hero.pos.x) * (e.pos.x - hero.pos.x) + (cz - hero.pos.z) * (e.pos.z - hero.pos.z);
    if (behind < 0) continue;
    const dd = Math.hypot(cx - e.pos.x, cz - e.pos.z); if (dd < bd) { bd = dd; best = new THREE.Vector3(cx, 0, cz); }
  }
  return best;
}
function aiBandit(e, dt, c) {
  const P = e.P; e.want.set(0, 0, 0);
  if (c.d < 7) e.want.copy(c.dir).multiplyScalar(-2.2);
  else if (c.d > 14) e.want.copy(c.dir).multiplyScalar(2.6);
  else {
    if (!e.cover || e.t % 4 < dt) e.cover = chooseCover(e);
    if (e.cover) e.want.subVectors(e.cover, e.pos).setY(0);
  }
  faceTo(e, c.dir, dt, 8);
  if (e.cool <= 0 && c.d < 22) {
    e.cool = rnd(0.7, 1.3); e.burst = 3; e.burstT = 0; e.burstGap = 0.12;
    e.fireFn = () => { if (P.muzzle) { P.muzzle.getWorldPosition(handW); shootAt('bullet', handW, 28, 0.05); } };
  }
  const sp = Math.hypot(e.vel.x, e.vel.z); e.phase += dt * (2 + sp * 2);
  animLimbs(P, e.phase, clamp(sp / 3, 0, 1), { noArms: e.burst > 0 });
  if (e.burst > 0 && P.armR) { P.armR.sh.rotation.x = -1.4; P.armR.el.rotation.x = 0; }
}

function aiCow(e, dt, c) {
  const P = e.P; e.want.set(0, 0, 0);
  if (c.d > 10) e.want.copy(c.dir).multiplyScalar(2.4);
  else if (c.d < 4) e.want.copy(c.dir).multiplyScalar(5.5);   // charge
  faceTo(e, c.dir, dt, 5);
  if (c.d < 2.6 && Math.abs(c.dy) < 2 && e.cool <= 0) { e.cool = 1.5; hurtHero(14, e.pos); SFX.hit(); }
  else if (e.cool <= 0 && c.d < 28 && !e.charging) { e.charging = 0.55; SFX.charge(); }
  if (e.charging > 0) {
    e.charging -= dt;
    if (P.eyes) for (const ey of P.eyes) ey.scale.setScalar(1.4 + Math.sin(e.t * 40) * 0.3);
    if (e.charging <= 0) {
      e.charging = 0; e.cool = rnd(1.8, 2.8); e.burst = 3; e.burstT = 0; e.burstGap = 0.14;
      e.fireFn = () => { if (P.muzzle) { P.muzzle.getWorldPosition(handW); shootAt('laser', handW, 24, 0.04); } };
      if (P.eyes) for (const ey of P.eyes) ey.scale.setScalar(1);
    }
  }
  const sp = Math.hypot(e.vel.x, e.vel.z); e.phase += dt * (1.5 + sp * 2);
  animLimbs(P, e.phase, clamp(sp / 3, 0, 1) * 0.7);
  if (P.head) P.head.rotation.x = Math.sin(e.t * 2) * 0.08;
}

const DOWN = new THREE.Vector3(0, -1, 0);
function aiMatrix(e, dt, c) {
  const P = e.P;
  // orbit / hover toward the hero
  const wantY = 4 + Math.sin(e.t * 1.3 + e.phase) * 1.2;
  const tang = tmpV2.set(-c.dir.z, 0, c.dir.x);
  const dist = c.d < 8 ? -1.5 : (c.d > 16 ? 2.5 : 0);
  e.vel.x = damp(e.vel.x, c.dir.x * dist + tang.x * 3.2, 3, dt);
  e.vel.z = damp(e.vel.z, c.dir.z * dist + tang.z * 3.2, 3, dt);
  e.vel.y = damp(e.vel.y, (wantY - e.pos.y) * 1.8, 2, dt);
  e.pos.addScaledVector(e.vel, dt);
  P.root.lookAt(heroChest);
  if (P.fans) for (const f of P.fans) f.rotation.y += dt * 18;
  if (P.tentacles) for (const ten of P.tentacles) ten.segs.forEach((s, i) => { s.rotation.x = Math.sin(e.t * 4 + ten.phase + i * 0.5) * 0.35; s.rotation.y = Math.cos(e.t * 3 + ten.phase) * 0.2; });
  if (P.eye) P.eye.scale.setScalar(1 + 0.08 * Math.sin(e.t * 10));
  if (P.light) P.light.lookAt(heroChest);
  if (e.cool <= 0 && c.d < 28) {
    e.cool = rnd(1.6, 2.6); e.burst = 2; e.burstT = 0; e.burstGap = 0.16;
    e.fireFn = () => { if (P.muzzle) { P.muzzle.getWorldPosition(handW); shootAt('matrix', handW, 22, 0.04); } };
  }
}

// ------------------------------------------------------------------------------------------ enemy projectiles
const SHOT = {
  laser:    { geo: new THREE.BoxGeometry(0.09, 0.09, 1.0), mat: glow(0xff1a10, 5), dmg: 10, r: 0.3 },
  bolt:     { geo: new THREE.BoxGeometry(0.22, 0.22, 1.8), mat: glow(0xff2a10, 5), dmg: 14, r: 0.55 },
  bullet:   { geo: new THREE.BoxGeometry(0.05, 0.05, 0.55), mat: glow(0xffe23a, 4), dmg: 7, r: 0.25 },
  shuriken: { geo: (() => { const s = new THREE.Shape(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = i % 2 ? 0.07 : 0.24; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); return g; })(), mat: new THREE.MeshStandardMaterial({ color: 0xd0d0e0, metalness: 1, roughness: 0.2, emissive: 0x2a6aff, emissiveIntensity: 0.8, side: THREE.DoubleSide }), dmg: 7, r: 0.3, spin: true },
  bottle:   { geo: new THREE.CylinderGeometry(0.05, 0.06, 0.28, 6), mat: new THREE.MeshStandardMaterial({ color: 0x2aa04a, emissive: 0x0a5020, roughness: 0.1 }), dmg: 9, r: 0.35, g: 20, spin: true },
  matrix:   { geo: new THREE.BoxGeometry(0.08, 0.08, 1.1), mat: glow(0x39ff6a, 5), dmg: 10, r: 0.3 },
};
function fireShot(kind, from, vel) {
  const d = SHOT[kind], m = new THREE.Mesh(d.geo, d.mat); m.position.copy(from); scene.add(m);
  G.shots.push({ kind, d, m, pos: m.position, vel: vel.clone(), life: 3, dead: false });
  (kind === 'bullet' ? SFX.gun : kind === 'shuriken' ? SFX.star : kind === 'bottle' ? SFX.toss : SFX.laser)();
}
function updateShots(dt) {
  for (const s of G.shots) {
    if (s.dead) continue;
    s.life -= dt; if (s.d.g) s.vel.y -= s.d.g * dt; s.pos.addScaledVector(s.vel, dt);
    if (s.d.spin) { s.m.rotation.y += dt * 25; if (s.kind === 'bottle') s.m.rotation.x += dt * 12; } else s.m.lookAt(tmpV.copy(s.pos).add(s.vel));
    if (hero.rollT <= 0 && !hero.dead && s.pos.distanceTo(tmpV.copy(hero.pos).setY(hero.pos.y + 0.9)) < s.d.r + 0.75) { if (hurtHero(s.d.dmg, s.pos.clone().sub(s.vel))) { s.dead = true; } }
    else if (s.life <= 0 || s.pos.y < (voidBounds ? -80 : 0.02) || pointInBox(s.pos)) {
      s.dead = true;
      if (s.kind === 'bottle') { SFX.shatter(); emit(s.pos, 14, [0x3ac85a, 0xaaffaa], 4); }
      else emit(s.pos, 5, s.kind === 'bullet' ? 0xffe23a : 0xff3a1a, 3);
    }
  }
  for (const s of G.shots) if (s.dead && s.m.parent) scene.remove(s.m);
  G.shots = G.shots.filter(s => !s.dead);
}

// ------------------------------------------------------------------------------------------ time portals: appear, swirl, close; jump in to travel
const vortexMat = new THREE.ShaderMaterial({
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  uniforms: { time: { value: 0 }, cA: { value: new THREE.Color() }, cB: { value: new THREE.Color() }, open: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float time, open; uniform vec3 cA, cB; varying vec2 vUv;
    void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x);
      float sw = sin(a * 5.0 + r * 16.0 - time * 7.0) * 0.5 + 0.5, sw2 = sin(a * 3.0 - r * 9.0 + time * 4.0) * 0.5 + 0.5;
      vec3 c = mix(cA, cB, sw) * (0.35 + 1.1 * pow(sw2, 3.0)) * (0.35 + 0.8 * (1.0 - r));
      c += vec3(1.0) * smoothstep(0.3, 0.0, r) * (0.3 + 0.15 * sin(time * 9.0));
      float al = smoothstep(1.0, 0.85, r) * open; gl_FragColor = vec4(c * al, al); }`
});
function labelTexture(text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d');
  g.font = 'italic 900 110px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 28; g.fillStyle = color; g.fillText(text, 256, 74); g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.6; g.fillText(text, 256, 74);
  g.globalAlpha = 1; g.font = 'bold 26px Arial'; g.fillStyle = '#fff'; g.fillText('JUMP IN', 256, 142);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const portalGroup = new THREE.Group(); portalGroup.visible = false; scene.add(portalGroup);
const portalInner = new THREE.Group(); portalInner.position.y = 1.9; portalGroup.add(portalInner);
const pRingMat = glow(0xffffff, 2.5), pRing = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.13, 10, 48), pRingMat); portalInner.add(pRing);
const pRing2 = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.04, 6, 48), pRingMat); portalInner.add(pRing2);
for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 4), pRingMat); const a = i / 6 * Math.PI * 2; sp.position.set(Math.cos(a) * 1.85, Math.sin(a) * 1.85, 0); sp.rotation.z = a - Math.PI / 2; pRing2.add(sp); }
const pVortex = new THREE.Mesh(new THREE.CircleGeometry(1.48, 48), vortexMat); portalInner.add(pVortex);
const pLabel = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false, fog: false })); pLabel.scale.set(3.6, 1.125, 1); pLabel.position.y = 4.6; portalGroup.add(pLabel);
const pBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 60, 12, 1, true), additive(0xffffff, 0.14, { side: THREE.DoubleSide })); pBeam.position.y = 32; portalGroup.add(pBeam);
const pLight = new THREE.PointLight(0xffffff, 0, 16, 1.5); pLight.position.y = 1.9; portalGroup.add(pLight);
const portalCenter = new THREE.Vector3();
function bossEraKey() { return ERA_KEYS.find(k => ERAS[k].boss) ?? ERA_KEYS[ERA_KEYS.length - 1]; }
function openPortal() {
  const last = G.portals === PORTALS_NEEDED - 1;
  let dest;
  if (last) dest = bossEraKey();
  else {
    G.seenEras = G.seenEras || [G.era];
    const others = ERA_KEYS.filter(k => k !== G.era);
    if (DEMO) {
      const unseenMain = others.filter(k => !ERAS[k].placeholder && !G.seenEras.includes(k));
      const unseenBonus = others.find(k => ERAS[k].placeholder && !G.seenEras.includes(k));
      if (unseenMain.length) dest = unseenMain[0];
      else if (unseenBonus && G.seenEras.length >= 3) dest = unseenBonus;
      else dest = pick(others.filter(k => !ERAS[k].placeholder).length ? others.filter(k => !ERAS[k].placeholder) : others);
    } else dest = pick(others);
  }
  // spot: not too near, not too far. DEMO prefers a nearby ground-level rift so the autopilot actually jumps in.
  let cands = PORTAL_SPOTS.filter(s => s !== G.lastSpot && s.distanceTo(hero.pos) > (DEMO ? 7 : 10) && s.distanceTo(hero.pos) < (DEMO ? 26 : 34));
  if (DEMO && layoutId === 'bonus') {
    const walk = PORTAL_SPOTS.filter(s => s !== G.lastSpot).sort((a, b) => a.distanceTo(hero.pos) - b.distanceTo(hero.pos));
    const near = walk.filter(s => Math.abs(s.y - hero.pos.y) < 2.5 && s.distanceTo(hero.pos) > 6);
    cands = (near.length ? near : walk).slice(0, 3);
  } else if (DEMO) {
    const ground = cands.filter(s => Math.abs(s.y - Math.max(0, hero.pos.y)) < 1.4 && s.y < 4);
    const pool = (ground.length ? ground : cands.filter(s => s.y < 4)).sort((a, b) => a.distanceTo(hero.pos) - b.distanceTo(hero.pos));
    if (pool.length) cands = pool.slice(0, 2);
  }
  if (!cands.length) cands = PORTAL_SPOTS.filter(s => s !== G.lastSpot);
  const spot = DEMO ? cands[0] : pick(cands); G.lastSpot = spot;
  const E = ERAS[dest];
  G.portal = { spot, dest, state: 'opening', t: 0, life: DEMO ? 40 : 24 };
  portalGroup.position.copy(spot); portalGroup.rotation.y = Math.atan2(hero.pos.x - spot.x, hero.pos.z - spot.z); portalGroup.visible = true;
  vortexMat.uniforms.cA.value.set(E.palette.portal[0]); vortexMat.uniforms.cB.value.set(E.palette.portal[1]);
  pRingMat.color.set(E.palette.portal[0]).multiplyScalar(2.5); pBeam.material.color.set(E.palette.portal[1]); pLight.color.set(E.palette.portal[0]);
  if (pLabel.material.map) pLabel.material.map.dispose(); pLabel.material.map = labelTexture(String(E.year), E.palette.accent); pLabel.material.needsUpdate = true;
  portalCenter.copy(spot).setY(spot.y + 1.9);
  SFX.open(); SFX.warp(); showMsg('TIME PORTAL OPEN', '→ ' + E.year + '  ·  ' + E.name, 2.2);
  emit(portalCenter, 60, E.palette.portal, 9, { g: 0, life: 0.8 }); ring(tmpV.copy(spot).setY(spot.y + 0.1), E.palette.portal[1], 5, 0.6);
}
function closePortal(silent) { if (!G.portal) return; G.portal.state = 'closing'; G.portal.t = 0; if (!silent) { SFX.charge(); showMsg('PORTAL COLLAPSED', 'ANOTHER RIFT WILL OPEN', 1.6); } }
function updatePortals(dt) {
  if (G.boss || G.portals >= PORTALS_NEEDED || G.mode !== 'play') return;
  if (G.bonus && !G.bonus.done) return;   // survival: portal waits until the clock hits zero
  // If the fifth rift is due and we are already in 2199, start the boss here — never leave to fight it elsewhere.
  if (!G.portal && G.portals >= PORTALS_NEEDED - 1 && G.era === bossEraKey()) { startBoss(); return; }
  const P = G.portal;
  if (!P) {
    G.portalCD -= dt;
    const need = DEMO ? 2 : 3, wait = DEMO ? 2.2 : 12;
    if (G.portalCD <= 0 && (G.eraKills >= need || G.eraT > wait)) openPortal();
    return;
  }
  P.t += dt; vortexMat.uniforms.time.value += dt;
  let s = 1;
  if (P.state === 'opening') { const k = Math.min(1, P.t / 0.9); s = 1 + Math.sin(k * Math.PI * 1.5) * (1 - k) * 0.6; s *= k; if (k >= 1) { P.state = 'open'; P.t = 0; } }
  else if (P.state === 'open') { if (P.t > P.life) closePortal(); }
  else if (P.state === 'closing') { s = Math.max(0, 1 - P.t / 0.7); if (s <= 0) { portalGroup.visible = false; G.portal = null; G.portalCD = DEMO ? 1.5 : 4; G.eraKills = 99; return; } }
  const warn = P.state === 'open' && P.life - P.t < 5;
  portalInner.scale.setScalar(Math.max(0.001, s)); vortexMat.uniforms.open.value = s * (warn && Math.floor(G.t * 8) % 2 ? 0.5 : 1);
  pRing2.rotation.z += dt * 1.5; pRing.rotation.z -= dt * 0.6;
  pLabel.position.y = 4.6 + Math.sin(G.t * 2) * 0.15; pLabel.material.opacity = s * (warn && Math.floor(G.t * 6) % 2 ? 0.35 : 1);
  pLight.intensity = 20 * s * (0.8 + 0.2 * Math.sin(G.t * 11)); pBeam.material.opacity = 0.14 * s; pBeam.scale.x = pBeam.scale.z = 1 + 0.2 * Math.sin(G.t * 5);
  // particles spiralling into the vortex
  if (Math.random() < 0.9) {
    const a = Math.random() * Math.PI * 2, r = 2.6, y = portalGroup.rotation.y;
    const lp = tmpV.set(Math.cos(a) * r, Math.sin(a) * r, rnd(-0.3, 0.3)).applyAxisAngle(UP, y).add(portalCenter);
    const v = tmpV2.subVectors(portalCenter, lp).multiplyScalar(2.2);
    emit(lp, 1, ERAS[P.dest].palette.portal, 0.2, { vx: v.x, vz: v.z, up: v.y, g: 0, drag: 0, life: 0.5 });
  }
  if (P.t % 1 < dt && P.state === 'open') Snd.tone(110, 0.5, 'sine', 0.05, 90);   // hum
  // jump in!
  if (P.state !== 'closing' && s > 0.6 && !hero.onGround && !hero.dead) {
    const chest = tmpV.copy(hero.pos).setY(hero.pos.y + 1.0);
    if (chest.distanceTo(portalCenter) < (DEMO ? 2.8 : 2.1)) enterPortal();
  }
}

// ------------------------------------------------------------------------------------------ warp tunnel transition
const warpScene = new THREE.Scene(), warpCam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 400);
warpCam.position.set(0, 0.5, 3.4); warpCam.lookAt(0, 0, -10);
const tunnelMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, toneMapped: false,
  uniforms: { time: { value: 0 }, cA: { value: new THREE.Color() }, cB: { value: new THREE.Color() }, mixT: { value: 0 } },
  vertexShader: 'varying vec2 vUv; varying float vZ; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }',
  fragmentShader: `uniform float time, mixT; uniform vec3 cA, cB; varying vec2 vUv; varying float vZ;
    void main(){ float s = fract(vUv.y * 60.0 + time * 4.0); float bands = smoothstep(0.0, 0.08, s) * smoothstep(0.45, 0.15, s);
      float sw = sin(vUv.x * 6.2832 * 7.0 + vUv.y * 90.0 + time * 5.0);
      vec3 c = mix(cA, cB, clamp(mixT + 0.25 * sw, 0.0, 1.0)) * (0.08 + 0.75 * bands) + vec3(1.0) * pow(max(sw, 0.0), 16.0) * 0.35;
      c *= exp(-vZ * 0.02) * 1.1 + 0.05; gl_FragColor = vec4(c, 1.0); }`
});
const tunnelGeo = new THREE.CylinderGeometry(5, 5, 300, 40, 1, true); tunnelGeo.rotateX(Math.PI / 2); tunnelGeo.translate(0, 0, -140);
const tunnel = new THREE.Mesh(tunnelGeo, tunnelMat); warpScene.add(tunnel);
warpScene.add(new THREE.HemisphereLight(0xffffff, 0x442244, 1.4)); const warpKey = new THREE.PointLight(0xffffff, 40, 20); warpKey.position.set(0, 2, 3); warpScene.add(warpKey);
const SN = 300, sPos = new Float32Array(SN * 3); for (let i = 0; i < SN; i++) { const a = Math.random() * 6.28, r = rnd(1.5, 4.5); sPos[i * 3] = Math.cos(a) * r; sPos[i * 3 + 1] = Math.sin(a) * r; sPos[i * 3 + 2] = rnd(-150, 5); }
const sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
warpScene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({ size: 0.25, map: Tex.dot(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
const WARP_SUCK = 0.45, WARP_TUNNEL = 1.5;
function enterPortal() {
  const P = G.portal; G.mode = 'warp'; G.warpT = 0; G.warp = { from: G.era, dest: P.dest, spot: P.spot.clone(), inTunnel: false, start: hero.pos.clone() };
  SFX.warp(); G.shake = 0.3; hero.disc.state = 'held';
  for (const e of G.enemies) e.frozen = true;
}
function updateWarp(dt) {
  const W = G.warp; G.warpT += dt; const t = G.warpT;
  if (t < WARP_SUCK) {
    const k = t / WARP_SUCK; hero.pos.lerpVectors(W.start, tmpV.copy(portalCenter).setY(portalCenter.y - 0.9), k * k);
    H.root.scale.setScalar(1 - k * 0.8); H.root.rotation.y += dt * 18; updateDisc(dt);
    emit(portalCenter, 3, ERAS[W.dest].palette.portal, 3, { g: 0 });
  } else if (!W.inTunnel) {
    W.inTunnel = true; flash(0.55); warpScene.add(H.root); H.root.position.set(0, 0, 0); H.root.scale.setScalar(1); H.root.rotation.set(0, Math.PI, 0);
    warpScene.add(disc); chain.visible = false; H.shadow.visible = false;
    const a = ERAS[W.from].palette.portal, b = ERAS[W.dest].palette.portal; tunnelMat.uniforms.cA.value.set(a[0]); tunnelMat.uniforms.cB.value.set(b[0]);
    H.body.rotation.x = 0.45;
    if (H.wadget) { H.armR.sh.rotation.set(0.3, 0, -0.4); H.armL.sh.rotation.set(0.3, 0, 0.4); H.armR.el.rotation.x = 0.1; H.armL.el.rotation.x = 0.1; }
    H.legL.hip.rotation.x = 0.7; H.legR.hip.rotation.x = 0.7;
  } else {
    const k = (t - WARP_SUCK) / WARP_TUNNEL;
    tunnelMat.uniforms.time.value += dt; tunnelMat.uniforms.mixT.value = clamp(k * 1.4 - 0.2, 0, 1);
    tunnel.rotation.z += dt * 1.2; H.root.rotation.z = Math.sin(t * 3) * 0.3; H.root.position.y = Math.sin(t * 5) * 0.15;
    disc.position.set(0.5, 0.3, -1.4); disc.userData.spin.rotation.y += dt * 30;
    for (let i = 0; i < SN; i++) { sPos[i * 3 + 2] += dt * 120; if (sPos[i * 3 + 2] > 6) sPos[i * 3 + 2] -= 155; } sGeo.attributes.position.needsUpdate = true;
    warpCam.position.x = Math.sin(t * 2) * 0.4; warpCam.fov = 70 + k * 18; warpCam.updateProjectionMatrix();
    const y0 = ERAS[W.from].year, y1 = ERAS[W.dest].year; $('year').textContent = (typeof y0 === 'number' && typeof y1 === 'number') ? Math.round(lerp(y0, y1, clamp(k * 1.2, 0, 1))) : (k < 0.5 ? y0 : y1);
    if (Math.random() < 0.3) Snd.tone(rnd(200, 1600), 0.08, 'triangle', 0.03);
    if (k >= 1) arrive();
  }
}
function arrive() {
  const W = G.warp; flash(0.6); warpCam.fov = 75; warpCam.updateProjectionMatrix();
  scene.add(H.root); scene.add(disc); H.shadow.visible = true; H.root.rotation.set(0, hero.yaw, 0); H.root.scale.setScalar(1); H.body.rotation.set(0, 0, 0);
  for (const e of G.enemies) scene.remove(e.P.root); G.enemies = [];
  for (const s of G.shots) scene.remove(s.m); G.shots = [];
  for (const o of G.orbs) scene.remove(o.m); G.orbs = [];
  portalGroup.visible = false; G.portal = null;
  applyEra(W.dest);
  if (spawnPoints.length) {
    const s = spawnPoints.find(p => p.y > -0.3 && p.y < 1.0) || spawnPoints[0];
    hero.pos.copy(s); hero.pos.y = s.y + 0.6; hero.lastSafe.copy(hero.pos);
  } else {
    hero.pos.copy(W.spot).addScaledVector(tmpV.set(Math.sin(portalGroup.rotation.y), 0, Math.cos(portalGroup.rotation.y)), 1.2); hero.pos.y = W.spot.y + 0.6;
  }
  hero.vel.set(0, 7, 0); hero.onGround = false; hero.disc.state = 'held';
  G.portals++; G.eraT = 0; G.eraKills = 0; G.spawnT = 1.0; G.portalCD = DEMO ? 1.5 : 3; G.mode = 'play'; G.seenEras = (G.seenEras || [W.from]).concat([W.dest]);
  ring(tmpV.copy(hero.pos).setY(hero.pos.y + 0.1), ERAS[W.dest].palette.portal[1], 7, 0.6); emit(tmpV, 60, ERAS[W.dest].palette.portal, 8, { g: 0 });
  showMsg(String(ERAS[W.dest].year), ERAS[W.dest].name + '  ·  PORTALS ' + G.portals + '/' + PORTALS_NEEDED, 2.2);
  quip(pick(ERAS[W.dest].quips.arrive));
  if (G.portals >= PORTALS_NEEDED) startBoss();
}


// ------------------------------------------------------------------------------------------ THE OMEGA STEER
const shock = [];
function startBoss() {
  if (G.boss) return;
  const bk = bossEraKey();
  if (G.era !== bk) {
    applyEra(bk);
    hero.pos.set(0, 0.2, 20); hero.vel.set(0, 0, 0); hero.lastSafe.set(0, 0.2, 20);
  }
  const f = camForwardXZ(new THREE.Vector3()); let p = null;
  for (let d = 16; d > 6 && !p; d -= 2) for (let a = 0; a < 6 && !p; a++) {
    const q = tmpV.copy(hero.pos).addScaledVector(f.clone().applyAxisAngle(UP, (a % 2 ? 1 : -1) * Math.ceil(a / 2) * 0.5), d).setY(0);
    if (Math.hypot(q.x, q.z) < ARENA_R - 4 && !pointInBox(tmpV2.copy(q).setY(1), 2.5) && (hero.pos.y > 2 || clearLine(hero.pos, q, 0.3, 1.2))) p = q.clone();
  }
  if (!p) p = new THREE.Vector3(0, 0, -20);
  p.y = 28;
  const e = makeEnemy('steer', p); G.enemies.pop(); G.boss = e; e.spawnT = 0; e.P.root.scale.setScalar(e.baseScale);
  const bl = new THREE.PointLight(0xff2a1a, 25, 18, 1.4); bl.position.set(0, 0.8, 0.6); e.P.chest.add(bl);
  e.maxHp = e.hp = DEMO ? 10 : ENEMY_TYPES.steer.hp; e.intro = true; e.cool = 2.5; e.seq = 0;
  $('boss').style.display = 'block'; $('bossHp').style.width = '100%';
  showMsg('WARNING', 'THE OMEGA STEER INBOUND', 2.5); SFX.roar(); G.shake = 0.4;
}
function aiBoss(e, dt, c) {
  const P = e.P; e.want.set(0, 0, 0);
  if (e.intro) { if (e.onGround) { e.intro = false; SFX.stomp(); G.shake = 0.8; ring(tmpV.copy(e.pos).setY(0.2), 0xff3a1a, 14, 0.7); emit(e.pos, 60, [0xffaa3a, 0x888888], 10, { flat: true }); floatText(tmpV.copy(e.pos).setY(8), 'TARGET ACQUIRED: WADGET', '#ff4a3a', 18); } return; }
  const p2 = e.hp < e.maxHp / 2;
  faceTo(e, c.dir, dt, 3);
  if (c.d > 11 && !e.stomping) e.want.copy(c.dir).multiplyScalar(p2 ? 3.2 : 2.5);
  if (e.cool <= 0 && !e.stomping && !(e.burst > 0)) {
    const act = ['volley', 'stomp', 'volley', 'summon'][e.seq++ % 4]; e.cool = p2 ? 2.1 : 2.9;
    if (act === 'volley') { e.burst = p2 ? 4 : 3; e.burstT = 0.3; e.burstGap = 0.38; SFX.charge(); e.fireFn = () => { for (const m of [P.muzzle, P.canL, P.canR]) { m.getWorldPosition(handW); shootAt('bolt', handW, 21, 0.07); } }; }
    else if (act === 'stomp') { e.vel.y = 11; e.onGround = false; e.stomping = true; e.stompT = 0; }
    else if (act === 'summon') { const n = G.enemies.filter(o => o.type === 'sentinel').length; for (let i = 0; i < Math.min(2, 3 - n); i++) makeEnemy('sentinel', tmpV.copy(e.pos).add(tmpV2.set(i ? 4 : -4, 8, 0))); floatText(tmpV.copy(e.pos).setY(8), 'DEPLOYING SENTINELS.', '#ff4a3a', 16); }
  }
  if (e.stomping) { e.stompT += dt; if (e.onGround && e.stompT > 0.3) { e.stomping = false; SFX.stomp(); G.shake = 0.7; shock.push({ c: e.pos.clone(), r: 1, hit: false, m: null }); ring(tmpV.copy(e.pos).setY(0.15), 0xff3a1a, 18, 0.9); emit(e.pos, 50, [0xffaa3a, 0x777777], 9, { flat: true }); } }
  const sp = Math.hypot(e.vel.x, e.vel.z); e.phase += dt * (1 + sp * 0.9);
  animLimbs(P, e.phase, clamp(sp / 2.5, 0, 1) * 0.7);
  if (e.burst > 0) { P.armR.sh.rotation.x = -1.5; P.armR.el.rotation.x = 0; }
  if (e.stomping) { P.armL.sh.rotation.x = P.armR.sh.rotation.x = -2.6; }
  if (P.core) P.core.scale.setScalar(1 + 0.25 * Math.sin(e.t * (p2 ? 14 : 6)));
}
function updateShock(dt) {
  for (let i = shock.length - 1; i >= 0; i--) {
    const s = shock[i]; s.r += dt * 17;
    const d = Math.hypot(hero.pos.x - s.c.x, hero.pos.z - s.c.z);
    if (!s.hit && hero.onGround && hero.pos.y < s.c.y + 1 && Math.abs(d - s.r) < 0.9) { s.hit = true; hurtHero(16, s.c); }
    if (Math.random() < 0.9) { const a = Math.random() * 6.28; emit(tmpV.set(s.c.x + Math.cos(a) * s.r, s.c.y + 0.2, s.c.z + Math.sin(a) * s.r), 3, [0xff6a1a, 0xffaa3a], 2, { g: -2, life: 0.4 }); }
    if (s.r > 18) shock.splice(i, 1);
  }
}
function bossDeath(e) {
  G.bossDying = 2.6; SFX.bigboom(); $('boss').style.display = 'none';
  for (const o of G.enemies) killEnemy(o);
  floatText(tmpV.copy(e.pos).setY(8), 'MOO-TAL ERROR. ERR—', '#ff4a3a', 20);
}
function updateBossDeath(dt) {
  if (!(G.bossDying > 0)) return; const e = G.boss;
  G.bossDying -= dt; G.shake = 0.5;
  if (Math.random() < dt * 14) { const p = tmpV.copy(e.pos).add(tmpV2.set(rnd(-1.5, 1.5), rnd(0.5, 7), rnd(-1.5, 1.5))); emit(p, 30, [0xff6a1a, 0xffc23a, 0xffffff], 9); burstDebris(p, 6, e.def.debris, 9, 0.3); SFX.boom(); }
  e.P.root.rotation.z = Math.sin(G.t * 30) * 0.05; e.P.root.position.y -= dt * 0.6;
  if (G.bossDying <= 0) { flash(1); SFX.bigboom(); emit(tmpV.copy(e.pos).setY(3), 200, [0xff6a1a, 0xffc23a, 0xffffff], 16); burstDebris(tmpV, 40, e.def.debris, 14, 0.35); scene.remove(e.P.root); G.boss = null; endGame(true); }
}

// ------------------------------------------------------------------------------------------ game flow
let titleArmed = false;
function titleInput() {
  if (!titleArmed) { titleArmed = true; Snd.onTitle = true; Snd.init(); $('prompt').textContent = 'PRESS AGAIN TO START'; return; }   // 1st input: audio on + theme
  startGame();                                                                                                                    // 2nd input: play
}
function clearWorld() {
  for (const e of G.enemies) scene.remove(e.P.root); if (G.boss) scene.remove(G.boss.P.root);
  for (const s of G.shots) scene.remove(s.m); for (const o of G.orbs) scene.remove(o.m);
  Object.assign(G, { enemies: [], shots: [], orbs: [], boss: null, portal: null, bossDying: 0 }); shock.length = 0; portalGroup.visible = false;
}
function startGame() {
  clearWorld();
  Object.assign(G, { mode: 'play', score: 0, portals: 0, kills: 0, eraKills: 0, eraT: 0, spawnT: 1.5, portalCD: 0, combo: 0, comboT: 0, lastSpot: null, endT: 0 });
  applyEra(START_ERA); resetHero(new THREE.Vector3(0, 0, 30)); hero.yaw = Math.PI; camState.yaw = 0; camState.pitch = 0.38;
  camState.target.copy(hero.pos).setY(2.0); disc.visible = true; G.seenEras = [START_ERA];
  Snd.onTitle = false; SFX.start(); document.body.classList.add('playing'); $('end').style.display = 'none'; $('boss').style.display = 'none';
  showMsg('HUNT THE TIME PORTALS', 'JUMP INTO ' + PORTALS_NEEDED + ' RIFTS · THEN FACE THE OMEGA STEER', 3);
  quip('THE RIFTS ARE OPENING. HANG ON.');
  EraMusic.sync(); AP.reset();
}
function endGame(win) {
  if (G.mode === 'win' || G.mode === 'over') return;
  G.mode = win ? 'win' : 'over'; G.endT = 0;
  if (document.pointerLockElement) document.exitPointerLock();
  $('endTitle').textContent = win ? 'TIMELINE SECURED' : 'LOST IN TIME';
  $('endText').textContent = (win ? 'OMEGA STEER DESTROYED · ' : 'PORTALS ' + G.portals + '/' + PORTALS_NEEDED + ' · ') + 'SCORE ' + G.score;
  $('end').style.display = 'flex'; if (win) { SFX.win(); quip('TIME IS ON MY SIDE.'); }
}
function toTitle() {
  clearWorld(); G.mode = 'title'; G.titleT = 0; document.body.classList.remove('playing'); $('end').style.display = 'none';
  Snd.onTitle = true; if (Snd.unlocked) Snd.playTitle(); $('prompt').textContent = titleArmed ? 'PRESS AGAIN TO START' : 'TAP OR PRESS ANY KEY'; EraMusic.sync();
}
function updateSpawner(dt) {
  if (G.boss || G.mode !== 'play') return;
  const bonus = G.bonus && !G.bonus.done;
  G.spawnT -= dt; const maxAlive = (bonus ? (DEMO ? 6 : 7) : 4) + Math.min(3, G.portals);
  if (G.spawnT <= 0) { G.spawnT = bonus ? rnd(0.55, 1.1) : rnd(1.2, 2.4); if (G.enemies.length < maxAlive && Object.keys(ERAS[G.era].roster || {}).length) { if (spawnFromRoster()) SFX.spawn(); } }
}

// ------------------------------------------------------------------------------------------ demo autopilot (?demo): fights, navigates the arena graph, jumps into portals
const AP = {
  path: [], repath: 0, stuckT: 0, lastPos: new THREE.Vector3(), jumpT: 0, throwWait: 0, strafe: 1, strafeT: 0,
  reset() { this.path = []; this.repath = 0; this.stuckT = 0; },
  update(dt) {
    input.mx = input.my = 0; input.jump = input.roll = input.throw = false;
    if (hero.dead) return;
    const lock = findLock(); this.throwWait -= dt; this.repath -= dt; this.strafeT -= dt;
    let goal = null;
    if (G.portal && G.portal.state !== 'closing') goal = G.portal.spot;
    const want = new THREE.Vector3();
    if (goal) {
      const flat = Math.hypot(goal.x - hero.pos.x, goal.z - hero.pos.z), sameLevel = Math.abs(goal.y - hero.pos.y) < 1.2;
      if (sameLevel && flat < 6 && clearLine(hero.pos, goal, hero.pos.y + 0.01, 0.35)) {
        want.subVectors(goal, hero.pos).setY(0);   // final approach + leap into the vortex
        if (flat < 3.2 && hero.onGround && G.portal.state === 'open') input.jump = true;
        this.path = [];
      } else {
        if (this.repath <= 0 || !this.path.length) { this.path = navPath(hero.pos, goal); this.repath = 1.5; }
        while (this.path.length) {
          const n = this.path[0], d = Math.hypot(n.p.x - hero.pos.x, n.p.z - hero.pos.z);
          if (d < 1.1 && Math.abs(n.p.y - hero.pos.y) < 1.5) this.path.shift(); else break;
        }
        if (this.path.length) want.subVectors(this.path[0].p, hero.pos).setY(0); else want.subVectors(goal, hero.pos).setY(0);
      }
    } else if (G.enemies.length || G.boss) {
      // fight: keep a comfortable range from the nearest enemy and circle-strafe
      let near = null, nd = 1e9; for (const e of targets()) { const d = e.pos.distanceTo(hero.pos); if (d < nd) { nd = d; near = e; } }
      if (near && !near.def.fly && Math.abs(near.pos.y - hero.pos.y) < 1.5 && !clearLine(hero.pos, near.pos, hero.pos.y + 0.3, 0.3)) {
        if (this.repath <= 0 || !this.path.length) { this.path = navPath(hero.pos, near.pos); this.repath = 1.2; }
        while (this.path.length && Math.hypot(this.path[0].p.x - hero.pos.x, this.path[0].p.z - hero.pos.z) < 1.1) this.path.shift();
        if (this.path.length) want.subVectors(this.path[0].p, hero.pos).setY(0); else want.subVectors(near.pos, hero.pos).setY(0);
      } else if (near) {
        this.path = [];
        const to = tmpV.subVectors(near.pos, hero.pos).setY(0), d = to.length(); to.normalize();
        const ideal = near === G.boss ? 8 : 7;
        if (this.strafeT <= 0) { this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = rnd(1.5, 3); }
        want.copy(to).multiplyScalar(clamp((d - ideal) * 0.4, -1, 1)).add(tmpV2.set(-to.z, 0, to.x).multiplyScalar(this.strafe * 0.8));
      }
    } else want.set(-hero.pos.x, 0, -hero.pos.z).multiplyScalar(0.05);
    if (lock && hero.disc.state === 'held' && this.throwWait <= 0 && lock.pos.distanceTo(hero.pos) < 24) { this.aimAt = lock; input.throw = true; this.throwWait = 0.25; }
    // dodge incoming shots
    if (hero.onGround && hero.rollCD <= 0) for (const s of G.shots) { const d = s.pos.distanceTo(hero.pos); if (d < 4 && s.vel.dot(tmpV.subVectors(hero.pos, s.pos)) > 0) { input.roll = Math.random() < 0.5; break; } }
    // stuck? hop
    if (want.lengthSq() > 0.01) { this.stuckT += dt; if (this.stuckT > 1.0) { if (hero.pos.distanceTo(this.lastPos) < 0.6) { input.jump = true; this.repath = 0; } this.stuckT = 0; this.lastPos.copy(hero.pos); } }
    // DEMO/CAPTURE: gentle assist toward an open portal if the path stalls — no instant teleport.
    if (DEMO && G.portal && G.portal.state === 'open') {
      const s = G.portal.spot;
      const flat = Math.hypot(s.x - hero.pos.x, s.z - hero.pos.z);
      if (G.portal.t > 4 && flat > 3.2) {
        const pull = clamp((G.portal.t - 4) / 4, 0, 1);           // ramps in over ~4s
        const k = (1 - Math.exp(-dt * (1.2 + pull * 3))) * pull;
        hero.pos.x += (s.x - hero.pos.x) * k * 0.45;
        hero.pos.z += (s.z - hero.pos.z) * k * 0.45;
      }
      if (G.portal.t > 10 && flat < 5) enterPortal();
    }
    if (want.lengthSq() > 0.0001) {
      want.normalize();   // convert world direction into camera-relative stick input
      const f = camForwardXZ(tmpV3), r = tmpV2.set(-f.z, 0, f.x);
      input.my = want.dot(f); input.mx = want.dot(r);
    }
    this.goalDir = want.clone();
  }
};

// ------------------------------------------------------------------------------------------ camera
const ray = new THREE.Raycaster(); const camOff = new THREE.Vector3();
function updateCamera(dt) {
  input.lookIdle += dt;
  const moving = Math.hypot(hero.vel.x, hero.vel.z) > 2;
  if (DEMO) {
    // cinematic follow: look along travel, but swing to keep the current target in frame
    let f = null; const lock = findLock();
    if (G.boss && !G.boss.dead) f = tmpV.subVectors(G.boss.pos, hero.pos).setY(0);
    else if (G.portal && G.portal.state !== 'closing' && hero.pos.distanceTo(G.portal.spot) < 14) f = tmpV.subVectors(G.portal.spot, hero.pos).setY(0);
    else if (lock && !AP.path.length) f = tmpV.subVectors(lock.pos, hero.pos).setY(0);
    else if (AP.goalDir && AP.goalDir.lengthSq() > 0.1) f = tmpV.copy(AP.goalDir);
    if (f && f.lengthSq() > 0.5) camState.yaw = angLerp(camState.yaw, Math.atan2(-f.x, -f.z), 1 - Math.exp(-1.6 * dt));
    camState.pitch = damp(camState.pitch, G.boss ? 0.16 : 0.3, 2, dt);
  } else if (input.lookIdle > 1.5 && moving && hero.rollT <= 0) camState.yaw = angLerp(camState.yaw, hero.yaw + Math.PI, 1 - Math.exp(-0.9 * dt));
  const tgt = tmpV2.copy(hero.pos).setY(hero.pos.y + (G.boss ? 2.8 : 2.0));
  camState.target.x = damp(camState.target.x, tgt.x, 16, dt); camState.target.z = damp(camState.target.z, tgt.z, 16, dt); camState.target.y = damp(camState.target.y, tgt.y, 9, dt);
  const dist = G.boss ? 13 : camState.dist;
  camOff.set(Math.sin(camState.yaw) * Math.cos(camState.pitch), Math.sin(camState.pitch), Math.cos(camState.yaw) * Math.cos(camState.pitch));
  ray.set(camState.target, camOff); ray.far = dist;
  const hit = ray.intersectObject(layout.mesh, false)[0];
  const want = hit ? Math.max(1.2, hit.distance - 0.35) : dist;
  camState.curDist = want < camState.curDist ? want : damp(camState.curDist, want, 3, dt);
  camera.position.copy(camState.target).addScaledVector(camOff, camState.curDist);
  if (camera.position.y < 0.4) camera.position.y = 0.4;
  G.shake = Math.max(0, G.shake - dt * 1.8);
  if (G.shake > 0) camera.position.add(tmpV.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(G.shake * 0.35));
  camera.lookAt(camState.target);
}

// ------------------------------------------------------------------------------------------ HUD
const scr = {};
function updateHud(dt) {
  msgT -= dt; quipT -= dt; if (msgT <= 0) { $('msg').style.opacity = 0; $('sub').style.opacity = 0; } if (quipT <= 0) $('quip').style.opacity = 0;
  flashA = Math.max(0, flashA - dt * 1.8); hurtA = Math.max(0, hurtA - dt * 2); $('flash').style.opacity = flashA; $('hurt').style.opacity = hurtA;
  if (G.mode === 'title') return;
  $('hp').style.width = (100 * hero.hp / hero.maxHp) + '%';
  $('score').textContent = 'SCORE ' + G.score;
  $('portals').textContent = 'PORTALS ' + G.portals + '/' + PORTALS_NEEDED;
  let obj = 'HUNT THE TIME PORTALS', bar = -1;
  if (G.mode === 'warp' && G.warp) obj = 'TIME WARP → ' + ERAS[G.warp.dest].year;
  else if (G.boss) obj = 'DESTROY THE OMEGA STEER';
  else if (G.bonus && G.mode === 'play' && !G.bonus.done) {
    const t = Math.max(0, G.bonus.t), m = Math.floor(t / 60), s = Math.floor(t % 60);
    obj = 'SURVIVE  ' + m + ':' + String(s).padStart(2, '0'); bar = G.bonus.t / G.bonus.duration;
  }
  else if (G.portal && G.mode === 'play') { const left = G.portal.life - G.portal.t; obj = G.portal.state === 'closing' ? 'PORTAL COLLAPSING…' : 'JUMP INTO THE PORTAL → ' + ERAS[G.portal.dest].year + (G.portal.state === 'open' ? '  (' + Math.ceil(left) + 's)' : ''); bar = G.portal.state === 'open' ? left / G.portal.life : -1; }
  else obj = 'FIGHT · A RIFT IS FORMING…';
  $('objText').textContent = obj; $('pbar').style.display = bar >= 0 ? 'block' : 'none'; if (bar >= 0) $('pbarI').style.width = (bar * 100) + '%';
  // lock reticle
  const lock = G.mode === 'play' ? findLock() : null, ret = $('reticle');
  if (lock && hero.disc.state === 'held') { toScreen(center(lock, tmpV), scr); ret.style.display = scr.behind ? 'none' : 'block'; ret.style.left = scr.x + 'px'; ret.style.top = scr.y + 'px'; } else ret.style.display = 'none';
  // portal marker (clamped to screen edge)
  const mk = $('marker');
  if (G.portal && G.mode === 'play' && G.portal.state !== 'closing') {
    toScreen(tmpV.copy(G.portal.spot).setY(G.portal.spot.y + 5.6), scr);
    let x = scr.x, y = scr.y; if (scr.behind) { x = innerWidth - x; y = innerHeight - 40; }
    x = clamp(x, 50, innerWidth - 50); y = clamp(y, 60, innerHeight - 60);
    const d = hero.pos.distanceTo(G.portal.spot);
    mk.style.display = d < 9 && !scr.behind ? 'none' : 'block'; mk.style.left = x + 'px'; mk.style.top = y + 'px';
    $('markerYear').textContent = '⟁ ' + ERAS[G.portal.dest].year; $('markerDist').textContent = Math.round(d) + ' m';
  } else mk.style.display = 'none';
}

// ------------------------------------------------------------------------------------------ title scene: Wadget on the chained walrus, storm isle
const titleScene = new THREE.Scene(), titleCam = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 500);
titleScene.add(new THREE.HemisphereLight(0xb8d0c0, 0x101018, 1.15));
const tKey = new THREE.DirectionalLight(0xffead4, 2.9); tKey.position.set(-4, 8, 16);
const tFill = new THREE.PointLight(0xff2ad4, 8, 22, 1.4); tFill.position.set(6, 3, 8); titleScene.add(tFill); titleScene.add(tKey);
const tRim = new THREE.PointLight(0x5cff3a, 36, 40, 1.3); tRim.position.set(-2, 4, -6); titleScene.add(tRim);
const tFace = new THREE.PointLight(0xfff0d0, 22, 16, 1.5); tFace.position.set(1.2, 2.2, 3.4); titleScene.add(tFace);
const tFlash = new THREE.PointLight(0xa0ffc0, 0, 80, 1); tFlash.position.set(0, 12, -10); titleScene.add(tFlash);
const cloudMat = new THREE.ShaderMaterial({
  depthWrite: false, uniforms: { time: { value: 0 }, flash: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float time, flash; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n(p); p *= 2.03; a *= 0.5; } return v; }
    void main(){ vec2 p = vUv * vec2(6.0, 3.5); float c = fbm(p + vec2(time * 0.05, time * 0.02)); float c2 = fbm(p * 1.7 - vec2(time * 0.03, 0.0) + c);
      vec3 col = mix(vec3(0.01, 0.02, 0.03), vec3(0.04, 0.08, 0.06), pow(c2, 1.8));
      col = mix(col, vec3(0.18, 0.04, 0.12), pow(c2, 3.0) * 0.45);
      col += vec3(0.15, 0.8, 0.3) * pow(c2, 3.0) * flash;
      float veins = smoothstep(0.02, 0.0, abs(fbm(p * 2.5 + time * 0.1) - 0.5)) * 0.6;
      col += vec3(0.2, 0.7, 0.3) * veins * (0.15 + flash * 0.6);
      gl_FragColor = vec4(col, 1.0); }`
});
const clouds = new THREE.Mesh(new THREE.PlaneGeometry(220, 110), cloudMat); clouds.position.set(0, 10, -45); titleScene.add(clouds);
// glowing sea
const sea = new THREE.Mesh(new THREE.CircleGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x0a4a22, emissive: 0x1a8a3a, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.2 }));
sea.rotation.x = -Math.PI / 2; sea.position.y = -0.6; titleScene.add(sea);
// jagged rock the walrus stands on
const rockG = new THREE.Group(); rockG.position.set(0, -0.6, 0); titleScene.add(rockG);
const rockM = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1, flatShading: true });
for (let i = 0; i < 7; i++) {
  const r = new THREE.Mesh(new THREE.ConeGeometry(1.2 + (i % 3) * 0.4, 1.4 + (i % 2), 5), rockM);
  r.position.set((i - 3) * 0.7, 0.4, -0.4 + (i % 2) * 0.5); r.rotation.z = (i - 3) * 0.08; rockG.add(r);
}
const slab = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.5, 7), rockM); slab.position.y = 0.55; rockG.add(slab);
// distant volcano silhouettes
for (let i = 0; i < 4; i++) {
  const v = new THREE.Mesh(new THREE.ConeGeometry(4 + i, 10 + i * 3, 5), new THREE.MeshStandardMaterial({ color: 0x141010, roughness: 1, flatShading: true }));
  v.position.set(-18 + i * 12, 3, -30 - (i % 2) * 6); titleScene.add(v);
  const lava = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2, 5), glow(0xff4a1a, 2)); lava.position.set(v.position.x, v.position.y + 5 + i * 1.2, v.position.z); titleScene.add(lava);
}
const titleHero = buildHero(); titleHero.shadow.visible = false; titleHero.root.position.set(0, 0.9, 0.4); titleHero.root.rotation.y = 0.55; titleScene.add(titleHero.root);
const titleDisc = buildDisc(1.15); titleHero.discMount.add(titleDisc);
const bolts = [], boltMat = glow(0x7aff8a, 2.2);
function strike() {
  const geos = [], x0 = rnd(-40, 40); let p = new THREE.Vector3(x0, 40, rnd(-35, -20));
  const segs = (from, n, spread, w) => { let a = from.clone(); for (let i = 0; i < n; i++) { const b = a.clone().add(new THREE.Vector3(rnd(-spread, spread), -rnd(2, 4.5), rnd(-1, 1))); const g = new THREE.BoxGeometry(w, a.distanceTo(b), w); const m = new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()), new THREE.Vector3(1, 1, 1)); g.applyMatrix4(m); geos.push(g); if (Math.random() < 0.18 && w > 0.15) segs(b, 4, spread * 1.2, w * 0.5); a = b; } };
  segs(p, 14, 3, 0.18);
  const mesh = new THREE.Mesh(mergeGeos(geos), boltMat); titleScene.add(mesh); bolts.push({ mesh, t: 0.28 });
  cloudMat.uniforms.flash.value = 1; tFlash.intensity = 120;
}
function mergeGeos(list) { let n = 0; for (const g of list) n += g.attributes.position.count; const pos = new Float32Array(n * 3); const idx = []; let o = 0; for (const g of list) { pos.set(g.attributes.position.array, o * 3); for (const i of g.index.array) idx.push(i + o); o += g.attributes.position.count; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); return g; }
function updateTitle(dt) {
  G.titleT = (G.titleT || 0) + dt; const t = G.titleT;
  cloudMat.uniforms.time.value = t; cloudMat.uniforms.flash.value = Math.max(0, cloudMat.uniforms.flash.value - dt * 3); tFlash.intensity = Math.max(0, tFlash.intensity - dt * 500);
  if (Math.random() < dt * 1.1) strike();
  for (let i = bolts.length - 1; i >= 0; i--) { const b = bolts[i]; b.t -= dt; b.mesh.visible = Math.random() < 0.8; if (b.t <= 0) { titleScene.remove(b.mesh); b.mesh.geometry.dispose(); bolts.splice(i, 1); } }
  titleHero.root.position.y = 0.9 + Math.sin(t * 1.6) * 0.06;
  titleHero.root.rotation.y = 0.55 + Math.sin(t * 0.4) * 0.08;
  animWalrus(titleHero, t * 3, 0.45, t);
  titleDisc.userData.spin.rotation.y += dt * 9;
  sea.material.emissiveIntensity = 0.3 + 0.08 * Math.sin(t * 2);
  const asp = innerWidth / innerHeight, back = asp < 1 ? 14 / asp * 0.75 : 9.2;
  titleCam.position.set(3.4 + Math.sin(t * 0.2) * 0.5, 2.35, back); titleCam.lookAt(0.15, asp < 1 ? 1.35 : 1.45, 0.2);
  if (DEMO && t > 3.0 && !G.demoStarted) { G.demoStarted = true; startGame(); }
}

// ------------------------------------------------------------------------------------------ main loop
function update(dt) {
  G.t += dt; if (CAPTURE) Snd.update(dt);
  if (G.mode === 'title') { updateTitle(dt); updateParticles(dt); return; }
  for (const k of ERA_KEYS) if (eraRes[k].group.visible) eraRes[k].update(G.t, dt, sky);
  sky.material.uniforms.time.value = G.t; sky.position.copy(camera.position);
  if (G.mode === 'warp') { updateWarp(dt); updateParticles(dt); updateRings(dt); return; }
  if (G.mode === 'play') {
    if (DEMO) AP.update(dt); else readMove();
    G.eraT += dt; G.comboT -= dt;
    updateHero(dt); input.jump = input.roll = input.throw = false;
    updateBonus(dt); updateSpawner(dt); updateEnemies(dt); updatePortals(dt); updateShock(dt); updateBossDeath(dt);
  } else { G.endT += dt; if (DEMO && G.endT > 6 && !CAPTURE) toTitle(); }
  updateShots(dt); updateOrbs(dt); updateParticles(dt); updateDebris(dt); updateRings(dt);
  for (const p of pads) if (p.beam) p.beam.material.opacity = 0.06 + 0.04 * Math.sin(G.t * 4);
  if (G.mode === 'warp') return;
  updateCamera(dt);
}
function render() {
  let s = scene, c = camera;
  if (G.mode === 'title') { s = titleScene; c = titleCam; }
  else if (G.mode === 'warp' && G.warp && G.warp.inTunnel) { s = warpScene; c = warpCam; }
  const tt = G.mode === 'title';
  if (tt) { bloom.strength = 0.35; bloom.threshold = 0.82; renderer.toneMappingExposure = 0.95; }
  else { bloom.strength = ERAS[G.era].lights.bloom; bloom.threshold = 0.62; renderer.toneMappingExposure = ERAS[G.era].lights.exposure; }
  if (useBloom) { renderPass.scene = s; renderPass.camera = c; composer.render(); }
  else renderer.render(s, c);
}
let lastT = performance.now(), acc = 0, perfN = 0, perfSum = 0, fpsEl = null;
if (Q.has('fps')) { fpsEl = document.createElement('div'); fpsEl.style.cssText = 'position:fixed;left:8px;bottom:8px;font:12px monospace;color:#0f0;z-index:9'; document.body.appendChild(fpsEl); }
function loop(now) {
  requestAnimationFrame(loop);
  const rawDt = Math.min(0.5, Math.max(0, (now - lastT) / 1000)); let dt = Math.min(0.1, rawDt); lastT = now; acc += dt;
  const STEP_DT = 1 / 60; let n = 0;
  while (acc >= STEP_DT && n < 6) { update(STEP_DT); acc -= STEP_DT; n++; }
  if (n === 6) acc = 0;
  Snd.update(rawDt); updateHud(dt); updateFloats(dt); EraMusic.update(rawDt); render();
  // adaptive quality: drop bloom, then resolution, if we can't hold ~40fps
  if (G.mode === 'play') {
    perfSum += dt; perfN++;
    if (perfN >= 120) {
      const avg = perfSum / perfN; perfN = 0; perfSum = 0;
      if (fpsEl) fpsEl.textContent = (1 / avg).toFixed(0) + ' fps' + (useBloom ? ' bloom' : '') + ' pr ' + pixelRatio.toFixed(2);
      if (avg > 1 / 38 && !Q.has('hifx')) { if (useBloom) useBloom = false; else if (pixelRatio > 0.6) { pixelRatio = Math.max(0.6, pixelRatio * 0.8); renderer.setPixelRatio(pixelRatio); resize(); } }
    }
  }
}
addEventListener('resize', resize); resize();
applyEra(START_ERA); camera.position.set(0, 3, 40); camera.lookAt(0, 2, 0);
renderer.compile(scene, camera); renderer.compile(titleScene, titleCam);
if (CAPTURE) {
  // external driver: step the simulation at a fixed 60Hz, render on demand
  const capState = () => ({ mode: G.mode, era: G.era, portals: G.portals, enemies: G.enemies.map(e => e.type), boss: G.boss ? G.boss.hp : null, portal: G.portal ? G.portal.state : null, dest: G.portal && G.portal.dest, bonusT: G.bonus ? G.bonus.t : null, hp: hero.hp, t: G.t, hx: hero.pos.x, hy: hero.pos.y, hz: hero.pos.z, disc: hero.disc.state });
  window.__cap = {
    step(n) { for (let i = 0; i < n; i++) update(1 / 60); updateHud(n / 60); updateFloats(n / 60); render(); return capState(); },
    sim(n) { for (let i = 0; i < n; i++) update(1 / 60); return capState(); },
  };
} else requestAnimationFrame(loop);
window.__dbg = { G, hero, ERAS, ENEMY_TYPES, BONUS_KEY, installCustomEra, applyEra, startGame, openPortal, enterPortal, startBoss, makeEnemy, spawnFromRoster, camState, Snd, AP, get titleArmed() { return titleArmed; } };
