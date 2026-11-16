const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [w, h, n] of [[960, 540, 'land'], [390, 844, 'port']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8765/index.html?capture'); await p.waitForFunction(() => window.__cap);
    await p.evaluate(() => window.__cap.step(100)); await p.screenshot({ path: `/tmp/title_${n}.png` }); console.log(n, errs);
  }
  await b.close();
})();
