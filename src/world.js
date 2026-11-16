// Arena layouts: default shared arena + the bonus Void Arena (Q3-style floating U). Colliders, jump pads, portal spots, nav.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { additive, glow, Tex } from './util.js';

export const ARENA_R = 46;
export const colliders = [];   // {min, max, kind, pad?, color?}
export const pads = [];        // {box, target: Vector3, mesh}
export const spawnPoints = []; // Vector3s on walkable surfaces (bonus / custom maps)
export const itemSpots = [];   // {p, type:'health'|'armor'}
export let layoutId = 'default';
export let defaultGround = 0;  // groundAt floor when no collider is under you (0 = default arena plane; -999 = void)
export let voidBounds = false; // if true, no circular ARENA_R wall — falling off is the void
const STEP = 0.45;

export function clearLayout() {
  colliders.length = 0; pads.length = 0; spawnPoints.length = 0; itemSpots.length = 0;
  nav.nodes.length = 0; nav.edges.length = 0;
}

function addBox(cx, y0, cz, w, h, d, kind = 'block', extra = {}) {
  const b = { min: new THREE.Vector3(cx - w / 2, y0, cz - d / 2), max: new THREE.Vector3(cx + w / 2, y0 + h, cz + d / 2), kind, ...extra };
  colliders.push(b); return b;
}
// stairs against a face: (fx,fz) = point on the face at ground, (dx,dz) = outward direction, rising y0 -> y1
function stairs(fx, fz, dx, dz, y0, y1, width) {
  const n = Math.ceil((y1 - y0) / 0.4 - 1e-6);
  for (let i = 0; i < n; i++) {
    const top = y0 + (i + 1) * (y1 - y0) / n, dist = (n - 1 - i) * 0.7 + 0.35;
    const cx = fx + dx * dist, cz = fz + dz * dist;
    addBox(cx, y0, cz, dx ? 0.7 : width, top - y0, dz ? 0.7 : width, 'step');
  }
}

export const LAYOUT = { towers: [[28, 28], [-28, 28], [28, -28], [-28, -28]], towerH: 8, towerW: 6 };
export function buildLayout() {
  // central ziggurat with straight staircases on +z and -z
  addBox(0, 0, 0, 14, 1.2, 14, 'zig'); addBox(0, 1.2, 0, 9, 1.2, 9, 'zig'); addBox(0, 2.4, 0, 5, 1.2, 5, 'zig');
  for (const s of [1, -1]) { stairs(0, 7 * s, 0, s, 0, 1.2, 3); stairs(0, 4.5 * s, 0, s, 1.2, 2.4, 3); stairs(0, 2.5 * s, 0, s, 2.4, 3.6, 3); }
  // ledges with stairs
  addBox(-22, 0, 0, 4, 3, 16, 'ledge'); stairs(-20, 5, 1, 0, 0, 3, 3);
  addBox(22, 0, -8, 4, 3, 12, 'ledge'); stairs(20, -4, -1, 0, 0, 3, 3);
  // towers + jump pads (pad sits toward the arena centre and launches you onto the roof)
  for (const [x, z] of LAYOUT.towers) {
    addBox(x, 0, z, LAYOUT.towerW, LAYOUT.towerH, LAYOUT.towerW, 'tower');
    const px = x - Math.sign(x) * 6.5, pz = z - Math.sign(z) * 6.5;
    const b = addBox(px, 0, pz, 2.4, 0.2, 2.4, 'pad');
    pads.push({ box: b, target: new THREE.Vector3(x, LAYOUT.towerH, z) });
  }
  // cover crates + low walls
  for (const [x, z] of [[-10, -14], [8, -20], [14, 10], [-12, 14], [-7, -27], [18, -24], [-28, -12], [27, 6], [-32, 14], [6, 26], [36, -6], [-38, 2], [-16, -34], [16, 36], [38, 14]]) addBox(x, 0, z, 2, 1.3, 2, 'crate');
  addBox(0, 0, -40, 10, 1.2, 1, 'wall'); addBox(-40, 0, -18, 1, 1.2, 8, 'wall'); addBox(40, 0, 24, 1, 1.2, 8, 'wall'); addBox(-12, 0, 38, 8, 1.2, 1, 'wall');
}

// portal spots (base point the portal stands on) – mutated when the layout swaps
const DEFAULT_SPOTS = [
  [0, 0, -31], [-22, 3, -2], [28, 8, 28], [31, 0, -17], [0, 3.6, 0], [-28, 8, -28], [-31, 0, 21], [12, 0, 21], [22, 3, -11], [-20, 0, -22]
];
export const PORTAL_SPOTS = DEFAULT_SPOTS.map(a => new THREE.Vector3(...a));
export function setPortalSpots(list) {
  PORTAL_SPOTS.length = 0;
  for (const a of list) PORTAL_SPOTS.push(a.isVector3 ? a : new THREE.Vector3(...a));
}

// ---------------------------------------------------------------- collision queries (shared by hero + enemies)
export function resolveHoriz(p, r, h) {
  for (const b of colliders) {
    if (p.y >= b.max.y - STEP * 0.98 || p.y + h <= b.min.y) continue;   // can step onto it / fully above or below
    const cx = Math.max(b.min.x, Math.min(p.x, b.max.x)), cz = Math.max(b.min.z, Math.min(p.z, b.max.z));
    let dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
    else {   // centre inside: push out along the shallowest axis
      const o = [p.x - b.min.x + r, b.max.x - p.x + r, p.z - b.min.z + r, b.max.z - p.z + r], m = Math.min(...o), i = o.indexOf(m);
      if (i === 0) p.x -= m; else if (i === 1) p.x += m; else if (i === 2) p.z -= m; else p.z += m;
    }
  }
  if (!voidBounds) { const d = Math.hypot(p.x, p.z); if (d > ARENA_R) { p.x *= ARENA_R / d; p.z *= ARENA_R / d; } }
}
// highest walkable surface under p (footprint radius fr) that is at most `up` above prevY
export function groundAt(p, prevY, up, fr = 0.25) {
  let g = defaultGround, box = null;
  for (const b of colliders) {
    if (p.x + fr < b.min.x || p.x - fr > b.max.x || p.z + fr < b.min.z || p.z - fr > b.max.z) continue;
    if (b.max.y <= prevY + up && b.max.y > g) { g = b.max.y; box = b; }
  }
  return { y: g, box };
}
export function pointInBox(p, pad = 0) {
  for (const b of colliders) if (p.x > b.min.x - pad && p.x < b.max.x + pad && p.y > b.min.y - pad && p.y < b.max.y + pad && p.z > b.min.z - pad && p.z < b.max.z + pad) return b;
  return null;
}
// is the straight walk a->b at height y free of blocking boxes? (samples)
export function clearLine(a, b, y, r = 0.6) {
  const n = Math.ceil(a.distanceTo(b) / 0.5), q = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    q.lerpVectors(a, b, i / n);
    for (const c of colliders) if (y < c.max.y - STEP && y + 1.5 > c.min.y && q.x > c.min.x - r && q.x < c.max.x + r && q.z > c.min.z - r && q.z < c.max.z + r) return false;
  }
  return true;
}

// ---------------------------------------------------------------- render meshes for the layout (era skins swap materials)
export function buildLayoutMeshes() {
  const geos = [], edgeGeos = [], col = new THREE.Color();
  const tint = { zig: 0.9, ledge: 0.8, tower: 1.0, crate: 0.7, wall: 0.75, step: 0.9, pad: 0.6, walk: 1.0, court: 1.05, upper: 0.95, bridge: 1.0, pillar: 0.7, curb: 0.85, neck: 1.0 };
  for (const b of colliders) {
    const s = new THREE.Vector3().subVectors(b.max, b.min), c = new THREE.Vector3().addVectors(b.max, b.min).multiplyScalar(0.5);
    const g = new THREE.BoxGeometry(s.x, s.y, s.z); g.translate(c.x, c.y, c.z);
    // scale UVs by face size so textures tile instead of stretching
    const uv = g.attributes.uv, nrm = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i));
      const w = ax > 0.5 ? s.z : s.x, h = ay > 0.5 ? s.z : s.y;
      uv.setXY(i, uv.getX(i) * w / 4, uv.getY(i) * h / 4);
    }
    if (b.color != null) col.set(b.color); else col.setScalar(tint[b.kind] || 1); const ca = new Float32Array(uv.count * 3); for (let i = 0; i < uv.count; i++) col.toArray(ca, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    geos.push(g); if (b.kind !== 'step') edgeGeos.push(new THREE.EdgesGeometry(g));
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial()); mesh.name = 'layout';
  const edges = new THREE.LineSegments(mergeGeometries(edgeGeos), new THREE.LineBasicMaterial({ color: 0x2af0ff, toneMapped: false }));
  // stairs edge highlight as thin glowing strips on each step's front
  for (const p of pads) {
    const c = new THREE.Vector3().addVectors(p.box.max, p.box.min).multiplyScalar(0.5);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24), glow(0x3affa0, 1.6)); disk.rotation.x = -Math.PI / 2; disk.position.set(c.x, p.box.max.y + 0.01, c.z);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 3, 16, 1, true), additive(0x3affa0, 0.18, { side: THREE.DoubleSide })); beam.position.set(c.x, p.box.max.y + 1.5, c.z);
    p.mesh = disk; p.beam = beam; mesh.add(disk, beam);
  }
  return { mesh, edges };
}

// ---------------------------------------------------------------- sky dome (gradient + optional striped synth sun)
export function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sun: { value: new THREE.Color() }, sunOn: { value: 0 }, flash: { value: 0 }, time: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top, horizon, bottom, sun; uniform float sunOn, flash, time; varying vec3 vP;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      void main(){
        float y = vP.y; vec3 c = y > 0.0 ? mix(horizon, top, pow(clamp(y * 2.2, 0.0, 1.0), 0.7)) : mix(horizon, bottom, clamp(-y * 6.0, 0.0, 1.0));
        vec2 sp = vec2(atan(vP.x, -vP.z), y);
        if (sunOn > 0.5) {
          vec2 d = vec2(sp.x * 1.0, sp.y - 0.12); float r = length(d);
          float stripes = step(0.0, sin((sp.y) * 160.0 + time * 2.0)) + step(0.11, sp.y);
          float disc = smoothstep(0.205, 0.2, r) * min(1.0, stripes);
          vec3 sc = mix(vec3(1.0, 0.2, 0.6), vec3(1.0, 0.85, 0.2), clamp((sp.y + 0.05) * 3.5, 0.0, 1.0));
          c = mix(c, sc * 0.8, disc * step(-0.02, sp.y)); c += sc * 0.1 * smoothstep(0.5, 0.0, r) * step(-0.02, sp.y);
        }
        vec2 g = floor(vec2(sp.x * 120.0, y * 120.0)); float st = step(0.996, h21(g)) * step(0.15, y);
        c += vec3(st) * (0.6 + 0.4 * sin(time * 3.0 + g.x));
        c += sun * flash * smoothstep(-0.1, 0.4, y);
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat); m.frustumCulled = false; m.renderOrder = -1;
  return m;
}

// ---------------------------------------------------------------- nav graph for the demo autopilot
export const nav = { nodes: [], edges: [] };   // node {p, id, links:[{to, pad}]}
export function buildNav() {
  nav.nodes.length = 0; nav.edges.length = 0;
  if (layoutId === 'bonus') { buildBonusNav(); return; }
  const add = (x, y, z) => { const n = { p: new THREE.Vector3(x, y, z), id: nav.nodes.length, links: [] }; nav.nodes.push(n); return n; };
  const link = (a, b, oneWay = false, pad = false) => { a.links.push({ to: b, pad }); if (!oneWay) b.links.push({ to: a, pad }); };
  const ground = [];
  for (let x = -42; x <= 42; x += 6) for (let z = -42; z <= 42; z += 6) {
    if (Math.hypot(x, z) > ARENA_R - 3) continue;
    const p = new THREE.Vector3(x, 0, z); if (colliders.some(b => b.kind !== 'pad' && x > b.min.x - 1.2 && x < b.max.x + 1.2 && z > b.min.z - 1.2 && z < b.max.z + 1.2)) continue;
    ground.push(add(x, 0, z));
  }
  for (const a of ground) for (const b of ground) if (a.id < b.id && a.p.distanceTo(b.p) < 8.6 && clearLine(a.p, b.p, 0)) link(a, b);
  const nearestGround = (x, z) => ground.slice().sort((a, b) => Math.hypot(a.p.x - x, a.p.z - z) - Math.hypot(b.p.x - x, b.p.z - z))[0];
  const hook = n => { for (const g of ground) if (g.p.distanceTo(n.p) < 9 && clearLine(n.p, g.p, 0)) link(n, g); };
  // ziggurat (both staircases)
  const zt = add(0, 3.6, 0);
  for (const s of [1, -1]) { const zb = add(0, 0, 10.2 * s); hook(zb); link(zb, zt); }
  // ledges
  const wb = add(-13.6, 0, 5), wt = add(-21, 3, 5), wt2 = add(-21.5, 3, -2); hook(wb); link(wb, wt); link(wt, wt2);
  const eb = add(13.6, 0, -4), et = add(21, 3, -4), et2 = add(21.5, 3, -11); hook(eb); link(eb, et); link(et, et2);
  // towers: pad launches up (one way); walk off the outer edge to come down
  for (const p of pads) {
    const c = new THREE.Vector3().addVectors(p.box.max, p.box.min).multiplyScalar(0.5);
    const pn = add(c.x, 0.2, c.z), top = add(p.target.x, p.target.y, p.target.z);
    hook(pn); link(pn, top, true, true);
    const sx = Math.sign(p.target.x), sz = Math.sign(p.target.z);
    const dropAt = add(p.target.x - sx * 6.5, 0, p.target.z + sz * 0.0); // fall off the side facing along x toward centre-ish
    dropAt.p.set(p.target.x, 0, p.target.z - sz * 5.2);   // beside the tower, toward the centre on z
    if (Math.hypot(dropAt.p.x, dropAt.p.z) > ARENA_R - 1) dropAt.p.multiplyScalar((ARENA_R - 2) / Math.hypot(dropAt.p.x, dropAt.p.z));
    hook(dropAt); link(top, dropAt, true);
  }
  nav.nearestGround = nearestGround;
}
// nearest node on the same level that we can walk to in a straight line
export function navNearest(p) {
  let best = null, bd = 1e9;
  for (const n of nav.nodes) {
    if (Math.abs(n.p.y - p.y) > 1.0) continue; const d = Math.hypot(n.p.x - p.x, n.p.z - p.z);
    if (d < bd && (d < 1.5 || clearLine(p, n.p, Math.max(p.y, n.p.y) + 0.01, 0.35))) { bd = d; best = n; }
  }
  if (!best) for (const n of nav.nodes) { const d = n.p.distanceTo(p); if (d < bd) { bd = d; best = n; } }
  return best;
}
export function navPath(from, to) {
  const a = navNearest(from), b = navNearest(to); if (!a || !b) return [];
  const dist = new Map([[a, 0]]), prev = new Map(), open = [a];
  while (open.length) {
    open.sort((x, y) => dist.get(x) - dist.get(y)); const n = open.shift(); if (n === b) break;
    for (const l of n.links) { const d = dist.get(n) + n.p.distanceTo(l.to.p); if (d < (dist.get(l.to) ?? 1e9)) { dist.set(l.to, d); prev.set(l.to, n); if (!open.includes(l.to)) open.push(l.to); } }
  }
  if (!dist.has(b)) return [];
  const path = []; for (let n = b; n; n = prev.get(n)) path.unshift(n);
  return path;
}


// ---------------------------------------------------------------- layout swap (default arena <-> bonus Void Arena)
export function useLayout(id) {
  if (layoutId === id && colliders.length) return false;
  clearLayout();
  if (id === 'bonus') buildBonusLayout();
  else buildDefaultBody();
  layoutId = id;
  buildNav();
  return true;
}

function buildDefaultBody() {
  defaultGround = 0; voidBounds = false;
  setPortalSpots(DEFAULT_SPOTS);
  // central ziggurat with straight staircases on +z and -z
  addBox(0, 0, 0, 14, 1.2, 14, 'zig'); addBox(0, 1.2, 0, 9, 1.2, 9, 'zig'); addBox(0, 2.4, 0, 5, 1.2, 5, 'zig');
  for (const s of [1, -1]) { stairs(0, 7 * s, 0, s, 0, 1.2, 3); stairs(0, 4.5 * s, 0, s, 1.2, 2.4, 3); stairs(0, 2.5 * s, 0, s, 2.4, 3.6, 3); }
  addBox(-22, 0, 0, 4, 3, 16, 'ledge'); stairs(-20, 5, 1, 0, 0, 3, 3);
  addBox(22, 0, -8, 4, 3, 12, 'ledge'); stairs(20, -4, -1, 0, 0, 3, 3);
  for (const [x, z] of LAYOUT.towers) {
    addBox(x, 0, z, LAYOUT.towerW, LAYOUT.towerH, LAYOUT.towerW, 'tower');
    const px = x - Math.sign(x) * 6.5, pz = z - Math.sign(z) * 6.5;
    const b = addBox(px, 0, pz, 2.4, 0.2, 2.4, 'pad');
    pads.push({ box: b, target: new THREE.Vector3(x, LAYOUT.towerH, z) });
  }
  for (const [x, z] of [[-10, -14], [8, -20], [14, 10], [-12, 14], [-7, -27], [18, -24], [-28, -12], [27, 6], [-32, 14], [6, 26], [36, -6], [-38, 2], [-16, -34], [16, 36], [38, 14]]) addBox(x, 0, z, 2, 1.3, 2, 'crate');
  addBox(0, 0, -40, 10, 1.2, 1, 'wall'); addBox(-40, 0, -18, 1, 1.2, 8, 'wall'); addBox(40, 0, 24, 1, 1.2, 8, 'wall'); addBox(-12, 0, 38, 8, 1.2, 1, 'wall');
}

// Keep the original name as a wrapper so existing startup calls still work.
// (buildLayout is already defined above — we don't redefine it.)

// ---------------------------------------------------------------- BONUS: Quake 3-style floating U / horseshoe in a starry void
const GREY = 0x8a8c90, COURT = 0xc4a07a, UPPER = 0x7a7c82, CURB = 0x5a5c60;
function addPad(cx, y0, cz, target, size = 2.6) {
  const b = addBox(cx, y0, cz, size, 0.18, size, 'pad', { color: 0xff7a18 });
  pads.push({ box: b, target: target.clone() });
  return b;
}
function curb(cx, y0, cz, w, d) { addBox(cx, y0, cz, w, 0.62, d, 'curb', { color: CURB }); }
function spot(...a) { const v = new THREE.Vector3(...a); spawnPoints.push(v); return v; }

function buildBonusLayout() {
  defaultGround = -999; voidBounds = true;
  const T = 2.0;            // walkway thickness; top of main deck is y = 0
  const y0 = -T;
  // back walkway (the bend of the U)
  addBox(0, y0, 16, 42, T, 11, 'walk', { color: GREY });
  // left arm
  addBox(-16.5, y0, 1, 11, T, 24, 'walk', { color: GREY });
  // right arm (longer, reaches toward the side platform)
  addBox(16.5, y0, -2, 11, T, 30, 'walk', { color: GREY });
  // short neck + small square side platform (bottom-right in the reference)
  addBox(16.5, y0, -18, 8, T, 5, 'neck', { color: GREY });
  addBox(17.5, y0, -23.5, 10, T, 8, 'walk', { color: GREY });
  // sunken pinkish courtyard in the mouth of the U (open hole in the very middle falls to the void)
  addBox(-6, -2.4, 2, 10, 1.2, 16, 'court', { color: COURT });   // left court
  addBox(6, -2.4, 2, 10, 1.2, 16, 'court', { color: COURT });    // right court
  addBox(0, -2.4, 8, 8, 1.2, 5, 'court', { color: COURT });      // back court strip
  addBox(0, -2.4, -4, 8, 1.2, 5, 'court', { color: COURT });     // front court strip
  // narrow bridge crossing the middle (walkway height)
  addBox(0, y0, 2, 24, T, 4.6, 'bridge', { color: GREY });
  // left upper balcony (pillared deck over the back half of the left arm)
  addBox(-16.5, 3.6, 8, 11, 0.5, 10, 'upper', { color: UPPER });
  // pillars under the balcony
  for (const [x, z] of [[-20, 12], [-13, 12], [-20, 5], [-13, 5]]) {
    addBox(x, 0, z, 1.1, 3.6, 1.1, 'pillar', { color: 0x6a6c70 });
  }
  // stairs up to the balcony: outward from its front face at z=3, toward -Z
  stairs(-16.5, 3, 0, -1, 0, 4.1, 4);
  // high floating platform (reached via jump pads), slightly over the back walkway
  addBox(0, 9.6, 11, 18, 0.55, 10, 'upper', { color: UPPER });
  // low outer curbs — high enough to stop a casual walk-off, low enough to jump
  curb(0, 0, 21.2, 40, 0.55);             // back outer
  curb(-21.7, 0, 1, 0.55, 22);            // left outer
  curb(21.7, 0, -2, 0.55, 28);            // right outer
  curb(-16.5, 0, -11.2, 10, 0.55);        // left front lip
  curb(22, 0, -27.3, 9, 0.55);            // side platform outer
  curb(12.4, 0, -23.5, 0.55, 7);          // side platform inner
  // jump pads: courtyard + side platform launch onto the floating upper deck
  const up = new THREE.Vector3(0, 10.15, 11);
  addPad(-5.5, -1.2, 6.5, up, 2.8);
  addPad(5.5, -1.2, 6.5, up, 2.8);
  addPad(0, -1.2, -4.5, up, 2.8);
  addPad(17.5, 0, -24.5, up, 3.2);
  // a mid pad on the back walkway also launches up (easy demo route)
  addPad(0, 0, 16, up, 2.6);

  setPortalSpots([
    [0, 0, 16], [-16.5, 0, -4], [16.5, 0, -8], [0, 0, 2],
    [17.5, 0, -22], [-16.5, 4.1, 6], [0, 10.15, 11], [0, -1.2, 0], [16.5, 0, 8]
  ]);
  // spawn / item points
  for (const a of [[0, 0, 17], [-16, 0, 0], [16, 0, 0], [16, 0, -10], [-16, 4.1, 8], [17.5, 0, -22], [0, -1.2, 6], [0, 10.15, 11], [12, 0, 16], [-12, 0, 16]]) spot(...a);
  const items = [
    [[-18, 0.9, 14], 'armor'], [[18, 0.9, 14], 'health'], [[0, -0.3, 8], 'health'],
    [[-5, -0.3, 0], 'armor'], [[17.5, 0.9, -22], 'health'], [[20, 0.9, -24], 'armor'],
    [[-16.5, 5.0, 10], 'armor'], [[-16.5, 5.0, 2], 'health'],
    [[-5, 11.1, 11], 'armor'], [[5, 11.1, 11], 'health'], [[8, 0.9, -8], 'health']
  ];
  for (const [pos, type] of items) itemSpots.push({ p: new THREE.Vector3(...pos), type });
}

function buildBonusNav() {
  const add = (x, y, z) => { const n = { p: new THREE.Vector3(x, y, z), id: nav.nodes.length, links: [] }; nav.nodes.push(n); return n; };
  const link = (a, b, oneWay = false, pad = false) => { a.links.push({ to: b, pad }); if (!oneWay) b.links.push({ to: a, pad }); };
  const nodes = [];
  const consider = (x, y, z) => {
    // must be standing on something
    const g = groundAt(new THREE.Vector3(x, y + 0.2, z), y + 0.2, 0.3, 0.4);
    if (g.y < -50 || Math.abs(g.y - y) > 0.6) return null;
    return add(x, g.y, z);
  };
  const samples = [];
  // back walkway
  for (let x = -18; x <= 18; x += 5) samples.push([x, 0, 16]);
  // arms
  for (let z = -8; z <= 10; z += 5) { samples.push([-16.5, 0, z]); samples.push([16.5, 0, z]); }
  samples.push([16.5, 0, -14]);
  // court
  for (const [x, z] of [[-6, 2], [6, 2], [0, 7], [0, -3], [-6, 7], [6, 7]]) samples.push([x, -1.2, z]);
  // bridge
  for (let x = -8; x <= 8; x += 5) samples.push([x, 0, 2]);
  // side platform
  samples.push([17.5, 0, -21], [17.5, 0, -24], [14, 0, -18]);
  // balcony
  for (const z of [12, 6, 0]) samples.push([-16.5, 4.1, z]);
  // upper platform
  for (const [x, z] of [[0, 11], [-6, 11], [6, 11], [0, 8], [0, 14]]) samples.push([x, 10.15, z]);
  const placed = [];
  for (const s of samples) { const n = consider(...s); if (n) placed.push(n); }
  for (const a of placed) for (const b of placed) {
    if (a.id >= b.id) continue;
    const dy = Math.abs(a.p.y - b.p.y), dist = a.p.distanceTo(b.p);
    if (dy < 0.7 && dist < 9 && clearLine(a.p, b.p, Math.max(a.p.y, b.p.y) + 0.05, 0.4)) link(a, b);
  }
  // stairs: link left arm near z=0 to balcony
  const arm = placed.filter(n => Math.abs(n.p.x + 16.5) < 3 && Math.abs(n.p.y) < 0.4 && Math.abs(n.p.z) < 6);
  const balc = placed.filter(n => n.p.y > 3.5 && n.p.y < 5);
  for (const a of arm) for (const b of balc) if (a.p.distanceTo(b.p) < 12) link(a, b);
  // jump pads: one-way up
  for (const p of pads) {
    const c = new THREE.Vector3().addVectors(p.box.max, p.box.min).multiplyScalar(0.5);
    c.y = p.box.max.y;
    let pn = placed.find(n => n.p.distanceTo(c) < 3 && Math.abs(n.p.y - c.y) < 1.2);
    if (!pn) pn = add(c.x, c.y, c.z);
    let top = placed.find(n => n.p.distanceTo(p.target) < 3);
    if (!top) top = add(p.target.x, p.target.y, p.target.z);
    link(pn, top, true, true);
  }
  // drop from upper platform onto the back walkway
  const ups = placed.filter(n => n.p.y > 9);
  const back = placed.filter(n => Math.abs(n.p.y) < 0.4 && n.p.z > 12);
  for (const u of ups) {
    const drop = back.slice().sort((a, b) => a.p.distanceTo(new THREE.Vector3(u.p.x, 0, u.p.z)) - b.p.distanceTo(new THREE.Vector3(u.p.x, 0, u.p.z)))[0];
    if (drop) link(u, drop, true);
  }
  nav.nearestGround = (x, z) => placed.slice().sort((a, b) => Math.hypot(a.p.x - x, a.p.z - z) - Math.hypot(b.p.x - x, b.p.z - z))[0];
}
