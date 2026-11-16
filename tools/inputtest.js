// Title two-step start, music fade in play, M mute, touch flow (first tap must not skip title), pointer-lock no errors.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } }); const err = [];
  p.on('pageerror', x => err.push(x.message)); p.on('console', m => m.type() === 'error' && err.push(m.text()));
  const st = () => p.evaluate(() => ({ mode: __dbg.G.mode, armed: __dbg.titleArmed, unlocked: __dbg.Snd.unlocked, src: __dbg.Snd.title && __dbg.Snd.title.currentSrc.split('/').pop(), paused: __dbg.Snd.title ? __dbg.Snd.title.paused : null, vol: __dbg.Snd.title ? +__dbg.Snd.title.volume.toFixed(2) : null, muted: __dbg.Snd.muted }));
  const r = {}; await p.goto(URL); await p.waitForTimeout(1500); r.load = await st();
  await p.mouse.click(480, 300); await p.waitForTimeout(1500); r.first = await st();
  await p.mouse.click(480, 300); await p.waitForTimeout(400); r.second = await st();
  await p.waitForTimeout(1800); r.inPlay = await st();
  await p.keyboard.press('KeyM'); await p.waitForTimeout(200); r.muted = await st();
  await p.keyboard.press('KeyM'); await p.waitForTimeout(200); r.unmuted = await st();
  await p.keyboard.press('KeyF'); await p.waitForTimeout(100); r.disc = await p.evaluate(() => __dbg.hero.disc.state);
  await p.keyboard.press('Space'); await p.waitForTimeout(150); r.jumpY = await p.evaluate(() => +__dbg.hero.pos.y.toFixed(2));
  await p.keyboard.press('ShiftLeft'); await p.waitForTimeout(100); r.roll = await p.evaluate(() => __dbg.hero.rollT > 0);
  console.log(JSON.stringify(r).replace(/\},"/g, '},\n"'));
  const c = await b.newContext({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } }); const t = await c.newPage();
  t.on('pageerror', x => err.push('touch ' + x.message)); t.on('console', m => m.type() === 'error' && err.push('touch ' + m.text()));
  await t.goto(URL); await t.waitForTimeout(1200); await t.tap('#c'); await t.waitForTimeout(500);
  const tap1 = await t.evaluate(() => ({ mode: __dbg.G.mode, armed: __dbg.titleArmed, touchUI: document.body.classList.contains('touch') }));
  await t.tap('#c'); await t.waitForTimeout(400); const tap2 = await t.evaluate(() => __dbg.G.mode);
  await t.waitForTimeout(1500); await t.tap('#bJump'); await t.waitForTimeout(300); const jy = await t.evaluate(() => +__dbg.hero.pos.y.toFixed(2));
  await t.screenshot({ path: '/tmp/touch.png' });
  console.log('touch', JSON.stringify({ tap1, tap2, jy })); console.log('ERR', JSON.stringify(err)); await b.close();
})();
