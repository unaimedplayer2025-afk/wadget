// Smoke test: load, collect console errors, start game via two inputs, run a bit, screenshot.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.screenshot({ path: '/tmp/r_title.png' }); if (!(await p.evaluate(() => !!window.__dbg))) { console.log(errs.join('\n')); await b.close(); return; }
  await p.keyboard.press('KeyQ'); await p.waitForTimeout(500);
  const a1 = await p.evaluate(() => ({ mode: __dbg.G.mode, armed: __dbg.titleArmed, unlocked: __dbg.Snd.unlocked, playing: __dbg.Snd.title && !__dbg.Snd.title.paused }));
  await p.keyboard.press('KeyQ'); await p.waitForTimeout(300);
  const a2 = await p.evaluate(() => __dbg.G.mode);
  await p.keyboard.down('KeyW'); await p.waitForTimeout(1500); await p.keyboard.up('KeyW');
  await p.waitForTimeout(3000);
  await p.screenshot({ path: '/tmp/r_play.png' });
  const st = await p.evaluate(() => ({ mode: __dbg.G.mode, en: __dbg.G.enemies.map(e => e.type), pos: __dbg.hero.pos.toArray().map(v => +v.toFixed(2)), titleVol: __dbg.Snd.titleVol, fr: 0 }));
  console.log(JSON.stringify({ a1, a2, st }));
  console.log('ERRORS', errs.length, '\n' + errs.join('\n'));
  await b.close();
})();
