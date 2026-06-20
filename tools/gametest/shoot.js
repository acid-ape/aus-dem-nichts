// Visual + runtime test harness for basebuilder.html
// Launches installed Chrome headless via puppeteer-core, drives game states, screenshots each,
// and captures console errors / page exceptions. Usage: node shoot.js [url] [device]
const puppeteer = require('puppeteer-core');
const path = require('path');

const URL = process.argv[2] || 'http://127.0.0.1:8765/static/basebuilder.html';
const DEVICE = process.argv[3] || 'phone'; // phone | desktop
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.join(__dirname, 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const VIEW = DEVICE === 'desktop'
  ? { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false }
  : { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--use-gl=swiftshader', '--hide-scrollbars'],
    defaultViewport: VIEW,
  });
  const page = await browser.newPage();
  const nonOk = [];
  const ignorable = u => /favicon\.ico/.test(u); // browser-default request, not a game asset
  // generic "Failed to load resource" console errors are redundant with the response handler below (which knows the URL)
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console.error: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.status() >= 400) { nonOk.push(r.status() + ' ' + r.url()); if (!ignorable(r.url())) errors.push('HTTP ' + r.status() + ': ' + r.url()); } });
  page.on('requestfailed', r => { if (!ignorable(r.url())) errors.push('requestfailed: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)); });

  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${DEVICE}_${name}.png`) }); console.log('  shot', name); };
  // run a few animation frames so canvas reflects state
  const frames = (n = 8) => page.evaluate(n => new Promise(res => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

  console.log(`[${DEVICE}] loading ${URL}`);
  await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
  // wait until both tilesets are actually decoded
  await page.waitForFunction(
    () => typeof game !== 'undefined' && game.s && typeof A !== 'undefined' && A.era2 && A.era2.complete && A.era2.naturalWidth > 0 && A.hero0 && A.hero0.complete && A.holz && A.holz.complete,
    { timeout: 15000 });
  await sleep(700); await frames(20);
  await shot('01_start');

  // open shop, Held tab
  await page.evaluate(()=>document.getElementById('panel').classList.toggle('open')); await sleep(350); await frames();
  await shot('02_shop_held');
  // Dorf tab
  await page.evaluate(() => game.setTab('dorf')); await sleep(250); await frames();
  await shot('03_shop_dorf');

  // inject resources, buy a spread of upgrades, advance a couple eras
  await page.evaluate(() => {
    ALL.forEach(k => game.s.store[k] = 5000);
    ['cap','cap','cap','speed','speed','gather','gather'].forEach(id => game.buy(id)); // bump heroTier
    game.buy('worker'); game.buy('worker'); game.buy('sawmill'); game.buy('quarry');
    game.buyEra(); ALL.forEach(k => game.s.store[k] = 5000); game.buyEra(); // -> Burg
    game.setTab('dorf');
  });
  await sleep(300); await frames();
  await shot('04_shop_dorf_upgraded');
  // close shop -> look at the world (hero evolved, huts, era building, roads)
  await page.evaluate(()=>document.getElementById('panel').classList.toggle('open')); await sleep(300); await frames(16);
  await shot('05_world_upgraded');
  // zoom out to reveal the village border / roads
  for (let i = 0; i < 4; i++) { await page.click('#zoomOutBtn'); await sleep(120); }
  await frames(12); await shot('06_world_zoomout');
  // tap to move the hero, then a couple frames
  await page.mouse.click(VIEW.width * 0.7, VIEW.height * 0.4); await sleep(500); await frames(20);
  await shot('07_world_moving');
  // endgame: max era + many upgrades
  await page.evaluate(() => {
    ALL.forEach(k => game.s.store[k] = 999999);
    for (let i = 0; i < 8; i++) { ['cap','speed','gather'].forEach(id => game.buy(id)); }
    while (game.s.era < 4) { ALL.forEach(k => game.s.store[k] = 999999); game.buyEra(); }
    game.buy('steam'); game.buy('steam');
    for (let i = 0; i < 6; i++) { game.buy('sawmill'); game.buy('quarry'); }
    for (let i = 0; i < 3; i++) { ALL.forEach(k => game.s.store[k] = 999999); game.buy('expand'); } // erschliesse alle Gebiete
  });
  await sleep(300); await frames(16); await shot('08_endgame_world');
  // ganz rauszoomen um das expandierte Dorf (alle Gebiete) zu sehen
  for (let i = 0; i < 7; i++) { await page.click('#zoomOutBtn'); await sleep(100); }
  await frames(12); await shot('10_expanded_areas');
  await page.evaluate(() => document.getElementById('panel').classList.add('open'));
  await page.evaluate(() => game.setTab('held')); await sleep(250); await frames();
  await shot('09_endgame_shop_held');

  await browser.close();
  if (nonOk.length) { console.log(`\n[${DEVICE}] non-200 responses:`); nonOk.forEach(x => console.log('  - ' + x)); }
  console.log(`\n[${DEVICE}] DONE. Blocking errors: ${errors.length}`);
  errors.forEach(e => console.log('  !! ' + e));
  process.exit(errors.length ? 2 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e.message); process.exit(1); });
