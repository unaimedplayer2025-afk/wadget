// Model QA: line up every enemy type in front of the camera in its own era.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/index.html?capture'); await p.waitForFunction(() => window.__cap);
  await p.evaluate(() => window.__cap.step(240));
  for (const [era, types] of [[65, ['zdino', 'zdino', 'zdino']], [1885, ['bandit', 'bandit', 'bandit']], [2199, ['cowterm', 'sentinel', 'cowterm', 'steer']]]) {
    await p.evaluate(([era, types]) => {
      const D = __dbg, T = D.G.enemies; for (const e of T) e.P.root.parent.remove(e.P.root); D.G.enemies.length = 0;
      D.applyEra(era); D.hero.pos.set(0, 0, 32); D.hero.yaw = Math.PI; D.camState.yaw = 0; D.camState.pitch = 0.15;
      types.forEach((t, i) => { const x = (i - (types.length - 1) / 2) * (t === 'steer' ? 3 : 1.8) + (t === 'steer' ? 3 : 0); const e = D.makeEnemy(t, new (D.hero.pos.constructor)(x, t === 'sentinel' ? 2.5 : 0, t === 'steer' ? 16 : 27)); e.spawnT = 0; e.P.root.scale.setScalar(e.baseScale); e.def = Object.assign({}, e.def, { ai: () => {} }); e.yaw = 0; });
      D.hero.pos.set(0, 0, 31);
    }, [era, types]);
    await p.evaluate(() => { const D = __dbg; D.G.mode = 'play'; });
    // step without autopilot moving too much: freeze hero
    await p.evaluate(() => { const D = __dbg; D.hero.vel.set(0,0,0); });
    const s = await p.evaluate(() => { const D = __dbg; const fr = D.hero.pos.clone(); for (let i = 0; i < 20; i++) { D.hero.pos.copy(fr); window.__cap.step(1); } return 1; });
    await p.screenshot({ path: `/tmp/models_${era}.png` });
  }
  console.log('errors', errs);
  await b.close();
})();
