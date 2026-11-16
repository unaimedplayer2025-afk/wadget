// Fast deterministic-step run of the ?capture demo: logs events; optional screenshots at milestones.
const { chromium } = require('playwright');
const STEP = +(process.argv[2] || 4), SHOTS = process.argv[3] === 'shots';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  await p.goto('http://localhost:8765/index.html?capture&seed=' + (process.env.SEED || 7)); await p.waitForFunction(() => window.__cap);
  let last = '', t0 = Date.now(); const shots = {};
  for (let f = 0; f < 60 * 120 / STEP; f++) {
    const s = await p.evaluate(n => window.__cap.step(n), STEP);
    const key = [s.mode, s.era, s.portals, s.portal, s.boss != null].join('|');
    if (key !== last) { console.log((s.t).toFixed(1).padStart(6), key, 'hp', Math.round(s.hp), 'en', s.enemies.join(',')); last = key; }
    if (SHOTS) {
      const tag = s.mode === 'play' && s.enemies.length >= 2 ? 'fight' + s.era : s.mode === 'warp' ? 'warp' : s.portal === 'open' ? 'portal' + s.portals : s.boss != null ? 'boss' : null;
      if (tag && !shots[tag] && s.t > 5) { shots[tag] = 1; await p.screenshot({ path: `/tmp/run${process.env.SEED||7}_${tag}.png` }); }
    }
    if (s.mode === 'win' || s.mode === 'over') { console.log('END', s.mode, s.t.toFixed(1)); break; }
  }
  console.log('wall', ((Date.now() - t0) / 1000).toFixed(0), 's  errors', errs.length, errs.slice(0, 8).join('\n'));
  await b.close();
})();
