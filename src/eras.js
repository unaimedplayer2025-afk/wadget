// ERAS: data-driven table. Each entry = year, palette, fog, sky, lights, enemy roster, music hook, quips and a
// `build()` that makes the era's props/skins. To add a year: add an entry (and any new enemy types in main.js ENEMY_TYPES).
//
// BONUS / CUSTOM MAP HOOK  (era key 9999, ERAS.BONUS_KEY)
// The Void Arena (Q3-style floating U) and a timed wave-survival round ship by default.
// To swap in another map or rules later:
//   1. import { installCustomEra, BONUS_KEY } from './eras.js'  (or __dbg.installCustomEra)
//   2. installCustomEra({ layout: 'bonus'|'default', build: yourBuildFn, roster: { type: weight },
//        music: 'audio/bonus',   // base path; .ogg / .mp3 picked via canPlayType
//        bonus: { type: 'survival'|'timed'|'hunt', duration: 60, goal: 20 },
//        name, year, tagline, quips })
//   3. Add new enemy types to ENEMY_TYPES in main.js.
//   4. For a custom collision layout, add a builder in world.js and register it in useLayout().
//   5. If you have a glTF/GLB, load it inside build() and return { group, groundMat, layoutMat, edges, update }.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const merge = list => mergeGeometries(list.map(g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; }));
import { rnd, pick, std, glow, additive, Tex, rimify } from './util.js';
import { colliders, ARENA_R } from './world.js';

const freeSpot = (minR, maxR, pad = 1.5) => {
  for (let k = 0; k < 40; k++) {
    const a = Math.random() * Math.PI * 2, r = rnd(minR, maxR), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!colliders.some(b => x > b.min.x - pad && x < b.max.x + pad && z > b.min.z - pad && z < b.max.z + pad)) return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(0, 0, ARENA_R);
};
const boxGeo = (x, y, z, w, h, d, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(ry); g.translate(x, y + h / 2, z); return g; };

export const BONUS_KEY = 9999;
export const ERAS = {
  65: {
    year: 'PRE', name: 'STORM ISLE', tagline: 'THE FIRST RIFT',
    palette: { accent: '#5cff3a', accent2: '#ff2ad4', portal: [0x5cff3a, 0xff2ad4], hud: '#7aff5a' },
    fog: { color: 0x042010, density: 0.016 },
    sky: { top: 0x061018, horizon: 0x3a1020, bottom: 0x04180c, sun: 0xff6a3a, sunOn: 0 },
    lights: { hemi: [0x6aff8a, 0x1a0808, 0.95], dir: [0xffc8a0, 1.15, [-18, 28, 8]], exposure: 1.05, bloom: 0.55 },
    roster: { zdino: 5 },
    spawnFx: 'rift',
    music: null,   // hook: e.g. 'audio/prehistoria.ogg' – loops during this era when set
    quips: { arrive: ['STORM ISLE. THE SEA IS GLOWING.', 'ZOMBIE DINOS. OF COURSE.', 'HOLD ON, BIG GUY.'], kill: ['BACK TO THE BONE PILE.', 'CHOMP THIS.', 'EXTINCT. AGAIN.'] },
    build: buildPre
  },
  1885: {
    year: 1885, name: 'IRON PRAIRIE', tagline: 'ROBOT TRAIN BANDITS',
    palette: { accent: '#ffb02a', accent2: '#c8e8ff', portal: [0xffb02a, 0xc07030], hud: '#ffc04a' },
    fog: { color: 0x3a2614, density: 0.012 },
    sky: { top: 0x1a0e18, horizon: 0xff6a2a, bottom: 0x4a2010, sun: 0xffc040, sunOn: 1 },
    lights: { hemi: [0xffc090, 0x3a1808, 1.0], dir: [0xffe0b0, 1.35, [20, 28, -10]], exposure: 1.12, bloom: 0.7 },
    roster: { bandit: 5 },
    spawnFx: 'dust',
    music: null,
    quips: { arrive: ['1885. SMELLS LIKE COAL AND OIL.', 'ROBOT BANDITS ON THE IRON ROAD.', 'THIS TOWN AIN\'T BIG ENOUGH.'], kill: ['RUST IN PEACE.', 'WANTED: DEAD.', 'OFF THE RAILS.'] },
    build: buildPrairie
  },
  2199: {
    year: 2199, name: 'THE SOURCE GRID', tagline: 'THERE IS NO STEAK',
    palette: { accent: '#39ff6a', accent2: '#c8ffd8', portal: [0x39ff6a, 0xa0ffc0], hud: '#39ff6a' },
    fog: { color: 0x020805, density: 0.018 },
    sky: { top: 0x000000, horizon: 0x052010, bottom: 0x010302, sun: 0x39ff6a, sunOn: 0 },
    lights: { hemi: [0x4aff80, 0x021008, 0.8], dir: [0xa8ffc0, 0.95, [10, 32, -16]], exposure: 1.02, bloom: 0.42 },
    roster: { cowterm: 3, sentinel: 4 },
    spawnFx: 'code',
    music: null,
    boss: 'steer',
    quips: { arrive: ['2199. THE GRID HAS COWS.', 'SENTINELS IN THE CODE RAIN.', 'FOLLOW THE WHITE WALRUS.'], kill: ['UNPLUGGED.', 'THERE IS NO STEAK.', 'BACK TO THE SOURCE.'] },
    build: buildGrid
  },
  9999: {
    year: 'BONUS', name: 'VOID ARENA', tagline: 'SURVIVE THE WAVES',
    palette: { accent: '#ff9a3a', accent2: '#7af0ff', portal: [0xff9a3a, 0x7af0ff], hud: '#ffb06a' },
    fog: { color: 0x02040a, density: 0.004 },
    sky: { top: 0x02040a, horizon: 0x10182a, bottom: 0x000000, sun: 0xffe0a0, sunOn: 0 },
    lights: { hemi: [0xd0d8e8, 0x10141c, 1.15], dir: [0xfff4e0, 1.55, [8, 28, 12]], exposure: 1.18, bloom: 0.4 },
    roster: { zdino: 2, bandit: 2, cowterm: 2, sentinel: 3 },
    spawnFx: 'rift',
    music: null,         // null = default gameplay track (audio/gameplay.{ogg,mp3})
    layout: 'bonus',
    placeholder: false,
    bonus: { type: 'survival', duration: 60 },
    customMapUrl: null,
    quips: { arrive: ['VOID ARENA. DON\'T LOOK DOWN.', 'JUMP PADS TO THE UPPER DECK.', 'BONUS ROUND. SURVIVE THE WAVES.'], kill: ['SPLAT.', 'OFF THE EDGE.', 'ONE LESS IN THE VOID.'] },
    build: buildBonus
  }
};
export const ERA_KEYS = Object.keys(ERAS).map(Number);

// Swap in John's custom map / bonus rules without touching the other eras.
export function installCustomEra(opts = {}) {
  const E = ERAS[BONUS_KEY];
  Object.assign(E, opts);
  if (opts.build) E.placeholder = false;
  if (opts.placeholder === false) E.placeholder = false;
  return E;
}

// ------------------------------------------------------------------------------------------ PREHISTORIA / STORM ISLE
function buildPre() {
  const group = new THREE.Group(), anim = [];
  const sea = Tex.sea(40);
  const groundMat = new THREE.MeshStandardMaterial({ map: sea, emissiveMap: sea, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.15, color: 0x8aff9a });
  const rock = Tex.rock(); rock.wrapS = rock.wrapT = THREE.RepeatWrapping;
  const layoutMat = new THREE.MeshStandardMaterial({ map: rock, color: 0x3a322c, vertexColors: true, roughness: 0.95, emissive: 0x0a1808, emissiveIntensity: 0.15 });
  // volcanoes on the horizon
  const cones = [], lava = [];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + rnd(-0.1, 0.1), r = rnd(62, 82), h = rnd(22, 44), w = rnd(10, 18);
    const g = new THREE.ConeGeometry(w, h, 6); g.translate(Math.cos(a) * r, h * 0.45, Math.sin(a) * r); cones.push(g);
    const lg = new THREE.ConeGeometry(w * 0.28, h * 0.22, 5); lg.translate(Math.cos(a) * r, h * 0.85, Math.sin(a) * r); lava.push(lg);
  }
  group.add(new THREE.Mesh(merge(cones), new THREE.MeshStandardMaterial({ map: rock, color: 0x2a201c, roughness: 1, flatShading: true })));
  const lavaMesh = new THREE.Mesh(merge(lava), glow(0xff4a1a, 2.2)); group.add(lavaMesh);
  // jagged rocks in/around the arena
  const jag = [];
  for (let i = 0; i < 50; i++) {
    const p = freeSpot(8, ARENA_R + 8, 1.2), s = rnd(0.6, 2.4);
    const g = new THREE.ConeGeometry(s * 0.7, s * 2.2, 5); g.rotateX(rnd(-0.2, 0.2)); g.rotateZ(rnd(-0.2, 0.2)); g.translate(p.x, s * 0.9, p.z); jag.push(g);
  }
  group.add(new THREE.Mesh(merge(jag), new THREE.MeshStandardMaterial({ map: rock, color: 0x2a2622, roughness: 1, flatShading: true })));
  // lava pools (glow discs just outside play)
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.4, r = ARENA_R + 6;
    const d = new THREE.Mesh(new THREE.CircleGeometry(rnd(2, 4), 16), glow(0xff3a10, 1.8)); d.rotation.x = -Math.PI / 2; d.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r); group.add(d);
  }
  // rain
  const RN = 900, rp = new Float32Array(RN * 3), rseed = [];
  for (let i = 0; i < RN; i++) rseed.push({ x: rnd(-70, 70), z: rnd(-70, 70), y: rnd(0, 28), sp: rnd(18, 32) });
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: 0xaad8ff, size: 0.12, transparent: true, opacity: 0.55, depthWrite: false })); rain.frustumCulled = false; group.add(rain);
  // lightning flash on the sky + a point light
  const flashL = new THREE.PointLight(0xa0ffc0, 0, 80, 1.4); flashL.position.set(0, 20, -20); group.add(flashL);
  let flashT = 0;
  // distant eruption puffs
  const smokeTex = Tex.smoke(), smokes = [];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2, r = rnd(62, 82), h = rnd(22, 40);
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x3a3230, transparent: true, depthWrite: false, opacity: 0.5 }));
    group.add(m); smokes.push({ m, x: Math.cos(a) * r, z: Math.sin(a) * r, h, ph: Math.random(), sp: rnd(0.04, 0.08) });
  }
  const update = (t, dt, sky) => {
    for (let i = 0; i < RN; i++) { const s = rseed[i]; let y = (s.y - t * s.sp) % 28; if (y < 0) y += 28; rp[i * 3] = s.x; rp[i * 3 + 1] = y; rp[i * 3 + 2] = s.z; }
    rg.attributes.position.needsUpdate = true;
    flashT -= dt;
    if (flashT < -rnd(2.5, 6)) { flashT = 0.18; flashL.position.set(rnd(-40, 40), 18, rnd(-40, 40)); }
    const fl = Math.max(0, flashT) * 8;
    flashL.intensity = fl * 40; if (sky) sky.material.uniforms.flash.value = fl * 0.35;
    lavaMesh.material.color.setRGB(2.2, 0.3 + 0.2 * Math.sin(t * 5), 0.1);
    for (const s of smokes) { const k = (t * s.sp + s.ph) % 1; s.m.position.set(s.x, s.h + k * 10, s.z); const sc = 4 + k * 8; s.m.scale.set(sc, sc, 1); s.m.material.opacity = 0.4 * Math.sin(k * Math.PI); }
  };
  return { group, groundMat, layoutMat, edges: { color: 0x1a4018, visible: false }, update };
}

// ------------------------------------------------------------------------------------------ IRON PRAIRIE / 1885
function buildPrairie() {
  const group = new THREE.Group(), anim = [];
  const dirt = Tex.prairie(28);
  const groundMat = new THREE.MeshStandardMaterial({ map: dirt, roughness: 1, metalness: 0, color: 0xc8a060 });
  const wood = Tex.wood(); wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  const layoutMat = new THREE.MeshStandardMaterial({ map: wood, color: 0x8a6a3a, vertexColors: true, roughness: 0.9 });
  // mesas
  const mesas = [];
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2 + rnd(-0.08, 0.08), r = rnd(58, 78), w = rnd(8, 16), h = rnd(8, 22);
    mesas.push(boxGeo(Math.cos(a) * r, 0, Math.sin(a) * r, w, h, w * 0.8, -a));
    mesas.push(boxGeo(Math.cos(a) * r, h * 0.7, Math.sin(a) * r, w * 1.15, h * 0.18, w * 0.95, -a));
  }
  group.add(new THREE.Mesh(merge(mesas), new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 1, flatShading: true })));
  // cacti
  const cactus = [], cactArm = [];
  for (let i = 0; i < 22; i++) {
    const p = freeSpot(8, ARENA_R + 4, 1.5), h = rnd(1.6, 3.2);
    const g = new THREE.CylinderGeometry(0.16, 0.2, h, 6); g.translate(p.x, h / 2, p.z); cactus.push(g);
    if (Math.random() < 0.7) { const a = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6); a.rotateZ(Math.PI / 2); a.translate(p.x + 0.5, h * 0.6, p.z); cactArm.push(a); }
  }
  group.add(new THREE.Mesh(merge(cactus.concat(cactArm)), std(0x2a6a28, { roughness: 0.8, flatShading: true })));
  // fence posts around a stretch
  const posts = [];
  for (let i = 0; i < 18; i++) { const a = -0.8 + i * 0.09, r = ARENA_R - 1; const g = new THREE.BoxGeometry(0.15, 1.3, 0.15); g.translate(Math.cos(a) * r, 0.65, Math.sin(a) * r); posts.push(g); }
  group.add(new THREE.Mesh(merge(posts), new THREE.MeshStandardMaterial({ map: wood, color: 0x6a4a22, roughness: 0.9 })));
  // railroad around the perimeter + a looping robot train
  const ties = [], rails = [];
  const TRACK_R = ARENA_R + 5, TIES = 80;
  for (let i = 0; i < TIES; i++) {
    const a = i / TIES * Math.PI * 2, x = Math.cos(a) * TRACK_R, z = Math.sin(a) * TRACK_R;
    const g = new THREE.BoxGeometry(1.6, 0.1, 0.28); g.rotateY(-a); g.translate(x, 0.06, z); ties.push(g);
  }
  group.add(new THREE.Mesh(merge(ties), new THREE.MeshStandardMaterial({ map: wood, color: 0x5a3a18, roughness: 0.9 })));
  const railM = std(0x888890, { metalness: 0.95, roughness: 0.3 });
  for (const off of [-0.45, 0.45]) {
    const pts = []; for (let i = 0; i <= 80; i++) { const a = i / 80 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * (TRACK_R + off), 0.16, Math.sin(a) * (TRACK_R + off))); }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const g = new THREE.TubeGeometry(curve, 80, 0.05, 5, true);
    group.add(new THREE.Mesh(g, railM));
  }
  // robot train (engine + 2 cars) that circles the track
  const train = new THREE.Group(); group.add(train);
  const iron = std(0x3a3a42, { metalness: 0.9, roughness: 0.35 }), brass = std(0xb8863a, { metalness: 1, roughness: 0.3 }), dark = std(0x1a1a1e, { metalness: 0.8, roughness: 0.4 });
  const engine = new THREE.Group(); train.add(engine);
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.2, 10), iron); boiler.rotation.z = Math.PI / 2; boiler.position.set(0, 0.7, 0); engine.add(boiler);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.2), iron); cab.position.set(1.3, 0.95, 0); engine.add(cab);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.8, 8), dark); stack.position.set(-0.6, 1.5, 0); engine.add(stack);
  const cowc = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.7, 4), brass); cowc.rotation.z = -Math.PI / 2; cowc.position.set(-1.3, 0.45, 0); engine.add(cowc);
  const glowEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), glow(0xff9a2a, 3)); glowEye.position.set(-1.15, 0.85, 0.25); engine.add(glowEye);
  const glowEye2 = glowEye.clone(); glowEye2.position.z = -0.25; engine.add(glowEye2);
  const cars = [];
  for (let i = 0; i < 2; i++) {
    const car = new THREE.Group(); const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.1), iron); box.position.y = 0.7; car.add(box);
    car.userData.offset = 2.6 + i * 2.2; train.add(car); cars.push(car);
  }
  const smokeTex = Tex.smoke(), puffs = [];
  for (let i = 0; i < 8; i++) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x4a4a4a, transparent: true, depthWrite: false, opacity: 0 })); group.add(m); puffs.push({ m, ph: i / 8 }); }
  // tumbleweeds
  const weeds = [];
  for (let i = 0; i < 6; i++) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), new THREE.MeshBasicMaterial({ color: 0x8a6a32, wireframe: true }));
    const p = freeSpot(10, ARENA_R - 4, 1); w.position.copy(p).setY(0.35); group.add(w); weeds.push({ m: w, a: Math.random() * 6, r: p.length(), sp: rnd(0.15, 0.35) });
  }
  const update = (t) => {
    const a = t * 0.22, x = Math.cos(a) * TRACK_R, z = Math.sin(a) * TRACK_R;
    engine.position.set(x, 0, z); engine.rotation.y = -a + Math.PI / 2;
    for (const car of cars) {
      const a2 = a - car.userData.offset / TRACK_R;
      car.position.set(Math.cos(a2) * TRACK_R, 0, Math.sin(a2) * TRACK_R); car.rotation.y = -a2 + Math.PI / 2;
    }
    engine.updateMatrixWorld(true); const sp = new THREE.Vector3(); stack.getWorldPosition(sp);
    for (const p of puffs) { const k = (t * 0.35 + p.ph) % 1; p.m.position.set(sp.x, sp.y + k * 4, sp.z); const sc = 0.6 + k * 2.5; p.m.scale.set(sc, sc, 1); p.m.material.opacity = 0.45 * (1 - k); }
    for (const w of weeds) { w.a += w.sp * 0.016; w.m.position.set(Math.cos(w.a) * w.r, 0.35, Math.sin(w.a) * w.r); w.m.rotation.x = w.a * 4; w.m.rotation.z = w.a * 2; }
  };
  return { group, groundMat, layoutMat, edges: { color: 0x5a3a14, visible: false }, update };
}

// ------------------------------------------------------------------------------------------ 2199 SOURCE GRID
function buildGrid() {
  const group = new THREE.Group(), anim = [];
  const grid = Tex.matrix(40);
  const groundMat = new THREE.MeshStandardMaterial({ map: grid, emissiveMap: grid, emissive: 0xffffff, emissiveIntensity: 0.32, roughness: 0.45, metalness: 0.35, color: 0x6ad88a });
  const layoutMat = new THREE.MeshStandardMaterial({ color: 0x0a1a10, vertexColors: true, roughness: 0.4, metalness: 0.55, emissive: 0x031a08, emissiveIntensity: 0.22 });
  // digital towers / monoliths on the horizon
  const towers = [], edges = [];
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2 + rnd(-0.04, 0.04), r = rnd(58, 78), w = rnd(4, 10), h = rnd(16, 50);
    const g = boxGeo(Math.cos(a) * r, 0, Math.sin(a) * r, w, h, w, -a); towers.push(g); if (i % 2 === 0) edges.push(new THREE.EdgesGeometry(g));
  }
  group.add(new THREE.Mesh(merge(towers), new THREE.MeshStandardMaterial({ color: 0x06140c, emissive: 0x0a3a18, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.6 })));
  group.add(new THREE.LineSegments(merge(edges), new THREE.LineBasicMaterial({ color: new THREE.Color(0x39ff6a).multiplyScalar(1.4), toneMapped: false })));
  // code-rain columns (falling green glyphs as points / streaks)
  const CN = 400, cp = new Float32Array(CN * 3), cseed = [];
  for (let i = 0; i < CN; i++) cseed.push({ x: rnd(-80, 80), z: rnd(-80, 80), y: rnd(0, 40), sp: rnd(6, 14) });
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.BufferAttribute(cp, 3));
  const code = new THREE.Points(cg, new THREE.PointsMaterial({ color: 0x39ff6a, size: 0.35, map: Tex.dot(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  code.frustumCulled = false; group.add(code);
  // floating glyph planes
  const glyphs = [];
  const chars = '01ABCDEFΔΣΩ';
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2, r = rnd(40, 70);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.2), new THREE.MeshBasicMaterial({ map: Tex.sign(chars[i % chars.length] + ' ' + chars[(i + 3) % chars.length] + chars[(i + 7) % chars.length], '#39ff6a'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.position.set(Math.cos(a) * r, rnd(8, 22), Math.sin(a) * r); m.lookAt(0, m.position.y, 0); group.add(m); glyphs.push({ m, ph: Math.random() });
  }
  // green fill lights
  const l1 = new THREE.PointLight(0x39ff6a, 10, 36, 1.6); l1.position.set(-12, 6, -8);
  const l2 = new THREE.PointLight(0x39ff6a, 8, 32, 1.6); l2.position.set(14, 5, 10); group.add(l1, l2);
  const update = (t) => {
    for (let i = 0; i < CN; i++) { const s = cseed[i]; let y = (s.y - t * s.sp) % 40; if (y < 0) y += 40; cp[i * 3] = s.x; cp[i * 3 + 1] = y; cp[i * 3 + 2] = s.z; }
    cg.attributes.position.needsUpdate = true;
    for (const g of glyphs) { g.m.material.opacity = 0.45 + 0.55 * Math.abs(Math.sin(t * 3 + g.ph * 9)); g.m.position.y += Math.sin(t * 0.6 + g.ph) * 0.01; }
    l1.intensity = 9 + 3 * Math.sin(t * 2); l2.intensity = 7 + 2.5 * Math.sin(t * 2.4 + 1);
  };
  return { group, groundMat, layoutMat, edges: { color: 0x39ff6a, visible: true }, update };
}

// ------------------------------------------------------------------------------------------ BONUS / VOID ARENA props (lamps, beams, rails)
// Collision, jump pads, portal spots and the U-platform itself live in world.js (buildBonusLayout).
function buildBonus() {
  const group = new THREE.Group();
  const conc = Tex.concrete(); conc.wrapS = conc.wrapT = THREE.RepeatWrapping;
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 }); // hidden in this era
  const layoutMat = new THREE.MeshStandardMaterial({ map: conc, color: 0xffffff, vertexColors: true, roughness: 0.85, metalness: 0.15 });
  const iron = std(0x4a4c50, { metalness: 0.8, roughness: 0.4 });
  const lampGlass = glow(0xfff2c8, 2.2);
  // lamp posts along the outer edges
  const lampPos = [
    [0, 0, 21], [-18, 0, 20], [18, 0, 20], [-21, 0, 8], [-21, 0, -6],
    [21, 0, 8], [21, 0, -10], [22, 0, -23], [13, 0, -27], [-13, 0, -10], [8, 0, 21]
  ];
  const lamps = [];
  lampPos.forEach((p, i) => {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]); group.add(g);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 6), iron); pole.position.y = 1.6; g.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), lampGlass); head.position.y = 3.3; g.add(head);
    const l = new THREE.PointLight(0xffe8b0, i % 2 ? 10 : 14, 20, 1.6); l.position.y = 3.3; g.add(l); lamps.push(l);
  });
  // light beams under the floating upper platform
  const beams = [];
  for (const x of [-5.5, -1.8, 1.8, 5.5]) {
    const cg = new THREE.CylinderGeometry(0.55, 1.3, 9.4, 10, 1, true);
    const beam = new THREE.Mesh(cg, additive(0xf0f4ff, 0.18, { side: THREE.DoubleSide }));
    beam.position.set(x, 4.9, 11); group.add(beam); beams.push(beam);
  }
  // short rail stubs on the upper platform
  const rail = [];
  for (const [x, z] of [[-8, 15.8], [0, 15.8], [8, 15.8], [-8, 6.2], [8, 6.2]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), iron); p.position.set(x, 10.7, z); group.add(p);
  }
  const update = (t) => {
    for (const l of lamps) l.intensity = 11 + 2 * Math.sin(t * 3 + l.id);
    for (const b of beams) b.material.opacity = 0.14 + 0.05 * Math.sin(t * 2 + b.position.x);
  };
  return { group, groundMat, layoutMat, edges: { color: 0x2a2c30, visible: false }, update };
}
