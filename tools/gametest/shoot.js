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
    () => typeof game !== 'undefined' && game.s && typeof A !== 'undefined' && A.era2 && A.era2.complete && A.era2.naturalWidth > 0 && typeof U !== 'undefined' && U.warrior_red_idle && U.warrior_red_idle.complete && U.warrior_red_idle.naturalWidth > 0 && A.holz && A.holz.complete,
    { timeout: 15000 });
  await sleep(500);
  await shot('00_charselect'); // Charakter-Auswahl beim Start (neues Spiel)
  await page.evaluate(() => game.pickChar('krieger')); // Held wählen → Overlay zu, weiter im normalen Spiel
  await sleep(400); await frames(20);
  await shot('01_start'); // Burger-Menü eingeklappt (Default)
  // Burger öffnen → Button-Stack sichtbar (für die Zoom-Klicks weiter unten + Verifikation)
  await page.click('#menuBtn'); await sleep(250); await frames();
  await shot('01b_menu_open');

  // open shop, Held tab
  await page.evaluate(()=>document.getElementById('panel').classList.toggle('open')); await sleep(350); await frames();
  await shot('02_shop_held');
  // Dorf tab
  await page.evaluate(() => game.setTab('dorf')); await sleep(250); await frames();
  await shot('03_shop_dorf');

  // inject resources, buy hero upgrades, hire workers, build huts, advance eras
  await page.evaluate(() => {
    ALL.forEach(k => game.s.store[k] = 5000);
    ['cap','cap','cap','speed','speed','gather','gather'].forEach(id => game.buy(id)); // bump heroTier
    game.buy('hire'); game.buy('hire'); game.buy('hire'); // workerPool -> 3
    game.buy('build'); // Holzfäller (era 1)
    game.buyEra(); ALL.forEach(k => game.s.store[k] = 5000); // -> Dorf
    game.buyEra(); ALL.forEach(k => game.s.store[k] = 5000); // -> Burg
    game.buy('build'); // Steinbruch (era 2)
    game.setTab('dorf');
  });
  await sleep(300); await frames();
  await shot('04_shop_dorf_upgraded');
  // open the first hut's management panel, upgrade it + assign a worker
  await page.evaluate(() => {
    game.s.player.x = game.s.player.tx = game.s.segSlots[game.s.builds[0].seg].x;
    game.s.player.y = game.s.player.ty = game.s.segSlots[game.s.builds[0].seg].y;
    game.openPanelFor(0);
    game.upgBuild('tempo'); game.upgBuild('menge'); game.assign(1);
  });
  await sleep(300); await frames();
  await shot('04b_hut_panel');
  // close shop -> look at the world (hero evolved, huts, era building, roads)
  await page.evaluate(()=>document.getElementById('panel').classList.toggle('open')); await sleep(300); await frames(16);
  await shot('05_world_upgraded');
  // zoom out to reveal the village border / roads
  await page.evaluate(() => { for (let i = 0; i < 4; i++) game.zoom = Math.max(0.06, game.zoom / 1.18); }); await sleep(120);
  await frames(12); await shot('06_world_zoomout');
  // tap to move the hero, then a couple frames
  await page.mouse.click(VIEW.width * 0.7, VIEW.height * 0.4); await sleep(500); await frames(20);
  await shot('07_world_moving');
  // endgame: max era + many upgrades
  await page.evaluate(() => {
    game.panelFor = 'castle';
    ALL.forEach(k => game.s.store[k] = 999999);
    for (let i = 0; i < 8; i++) { ['cap','speed','gather'].forEach(id => game.buy(id)); }
    while (game.s.era < 6) { ALL.forEach(k => game.s.store[k] = 999999); game.buyEra(); }   // bis Stufe 7 (era6)
    game.buy('steam'); game.buy('steam');
    for (let i = 0; i < 6; i++) { ALL.forEach(k => game.s.store[k] = 999999); game.buy('hire'); } // workerPool -> 9
    for (let i = 0; i < 6; i++) { ALL.forEach(k => game.s.store[k] = 999999); game.buy('build'); } // alle 6 Hütten (inkl. Schmiede + Juwelier-Ketten)
    for (let i = 0; i < 3; i++) { ALL.forEach(k => game.s.store[k] = 999999); game.buy('expand'); } // erschliesse alle Gebiete
    for (let i = 0; i < 3; i++) { ALL.forEach(k => game.s.store[k] = 999999); game.buy('buildpost'); } // Kürbis/Pilz/Beeren-Sammler (mid:6246/6313)
    if (game.s.outposts) game.s.outposts.forEach(o => { o.store = Math.round(outpostCap(o) * 0.7); }); // teilweise gefüllt für den Screenshot
    // verteile Arbeiter auf die Hütten + rüste sie hoch
    game.s.builds.forEach((b, i) => { game.panelFor = i; game.assign(1); game.assign(1); game.upgBuild('tempo'); game.upgBuild('menge'); });
    game.panelFor = 'castle';
  });
  await sleep(300); await frames(16); await shot('08_endgame_world');
  // ganz rauszoomen um das expandierte Dorf (alle Gebiete) zu sehen
  await page.evaluate(() => { for (let i = 0; i < 7; i++) game.zoom = Math.max(0.06, game.zoom / 1.18); }); await sleep(100);
  await frames(12); await shot('10_expanded_areas');
  await page.evaluate(() => document.getElementById('panel').classList.add('open'));
  await page.evaluate(() => game.setTab('held')); await sleep(250); await frames();
  await shot('09_endgame_shop_held');

  // achievements overlay (endgame state has unlocked several)
  await page.evaluate(() => { document.getElementById('panel').classList.remove('open'); game.toggleAch(true); });
  await sleep(300); await frames();
  await shot('11_achievements');
  await page.evaluate(() => game.toggleAch(false));

  // functional assertions: production scales, save round-trips the new model
  const checks = await page.evaluate(() => {
    const out = [];
    // per-era upgrade caps hold (mid:6033)
    game.panelFor = 0; const b0 = game.s.builds[0];
    for (let i = 0; i < 25; i++) { ALL.forEach(k => game.s.store[k] = 999999); game.upgBuild('tempo'); game.upgBuild('menge'); }
    out.push(['tempo capped at era+1', b0.tempo <= game.s.era + 1]);
    out.push(['menge capped at era+1', b0.menge <= game.s.era + 1]);
    for (let i = 0; i < 25; i++) { ALL.forEach(k => game.s.store[k] = 999999); game.buy('hire'); game.assign(1); }
    out.push(['workers capped per era', b0.workers <= Math.min(4, game.s.era + 1)]);
    out.push(['achievements unlocked in endgame', game.s.achieved.length >= 4]);
    // Produktionskette: Schmiede verbraucht Holz+Stein, produziert Gold (mid:6037 Phase B)
    const sm = game.s.builds.find(b => b.type === 'schmiede');
    if (sm) {
      ALL.forEach(k => game.s.store[k] = 0); game.s.store.holz = 100; game.s.store.stein = 100;
      const g0 = game.s.store.gold, h0 = game.s.store.holz, st0 = game.s.store.stein;
      for (let i = 0; i < 30; i++) produce(game.s, sm, 0.2); // ~6s simulieren
      out.push(['Schmiede produziert Gold', game.s.store.gold > g0]);
      out.push(['Schmiede verbraucht Holz', game.s.store.holz < h0]);
      out.push(['Schmiede verbraucht Stein', game.s.store.stein < st0]);
      // Input-Deckel: ohne Input kein Output
      game.s.store.holz = 0; game.s.store.stein = 0; const gx = game.s.store.gold;
      for (let i = 0; i < 10; i++) produce(game.s, sm, 0.2);
      out.push(['Schmiede stoppt ohne Input', Math.abs(game.s.store.gold - gx) < 0.001]);
    } else out.push(['Schmiede gebaut', false]);
    game.panelFor = 'castle';
    // Helden-Upgrades pro Zeitalter gecapped (mid:6042)
    game.s.era = 1; game.s.capLvl = 0;
    for (let i = 0; i < 30; i++) { ALL.forEach(k => game.s.store[k] = 999999); game.buy('cap'); }
    out.push(['hero upgrade capped per era', game.s.capLvl <= heroMaxLvl(game.s)]);
    // Kamera: moveTo aktiviert Follow wieder; freier Schwenk bleibt stehen (mid:6040)
    moveTo({ x: game.s.player.x + 200, y: game.s.player.y });
    out.push(['moveTo re-enables camFollow', game.camFollow === true]);
    game.camFollow = false; game.camGoal.x = 600; game.camGoal.y = 600; game.s.cam.x = 600; game.s.cam.y = 600;
    for (let i = 0; i < 25; i++) game.step(0.1); // Held läuft, Kamera darf NICHT zu ihm snappen
    out.push(['free-look camera stays put', Math.abs(game.s.cam.x - 600) < 70 && game.camFollow === false]);
    // freie Arbeiter: Schwarm == freier Pool, Zuweisen verkleinert ihn, Abliefern füllt das Lager (mid:6048)
    game.s.builds.forEach(b => b.workers = 0); game.s.workerPool = 4; game.step(0.1);
    out.push(['free walkers match free pool', game.s.freeWalkers.length === 4]);
    game.panelFor = 0; game.assign(1); game.assign(1); game.step(0.1);
    out.push(['assigning shrinks the walker swarm', game.s.freeWalkers.length === freeWorkers(game.s)]);
    game.s.freeWalkers = [{ x: BASE.x, y: BASE.y, tx: BASE.x, ty: BASE.y, carry: 3, type: 'holz', state: 'return', target: null }];
    game.s.workerPool = assignedWorkers(game.s) + 1; const wh0 = game.s.store.holz; updateFreeWalkers(game.s, 0.1);
    out.push(['walker delivers carry to store', game.s.store.holz >= wh0 + 3 - 0.01]);
    // Level-Design: Biome initialisiert + jeder Knoten liegt in einem Biom, das seinen Typ führt (mid:6049)
    out.push(['biomes initialised (6 sectors)', Array.isArray(game.s.biomes) && game.s.biomes.length === 6]);
    const misplaced = game.s.nodes.filter(n => !(BIOMES[biomeAt(game.s, n.x, n.y)].res[n.type])).length;
    out.push(['resource nodes sit in matching biome', misplaced === 0]);
    // Terrain-Bedeutung + Verteilung (mid:6060)
    out.push(['sand patches exist (Inland-Seen entfernt, runde Karte)', game.s.sand.length >= 3]);
    if (game.s.sand.length) { const B = game.s.sand[0]; out.push(['onSand detects sand', onSand(game.s, B.x, B.y) === true]); }
    if (game.s.lakes.length) { const L = game.s.lakes[0], o = { x: L.x, y: L.y }; collide(game.s, o, 13);
      out.push(['water is impassable (pushes out)', dist(o.x, o.y, L.x, L.y) > 1]); }
    out.push(['terrain spreads beyond start area', game.s.lakes.concat(game.s.sand).some(B => dist(B.x, B.y, BASE.x, BASE.y) > 600)]);
    const b = game.s.builds[0];
    const base = buildRate(game.s, { type: b.type, tempo: 0, menge: 0, workers: 0 });
    const boosted = buildRate(game.s, b);
    out.push(['production scales with upgrades/workers', boosted > base]);
    out.push(['all 6 hut types built', game.s.builds.length === 6]);
    // 2-stufige Kette: Juwelier verbraucht Gold+Stein, produziert Kristall (mid:6046 Phase B)
    const jw = game.s.builds.find(b => b.type === 'juwelier');
    if (jw) {
      ALL.forEach(k => game.s.store[k] = 0); game.s.store.gold = 100; game.s.store.stein = 100;
      const kr0 = game.s.store.kristall, gd0 = game.s.store.gold;
      for (let i = 0; i < 30; i++) produce(game.s, jw, 0.2);
      out.push(['Juwelier produziert Kristall', game.s.store.kristall > kr0]);
      out.push(['Juwelier verbraucht Gold', game.s.store.gold < gd0]);
    } else out.push(['Juwelier gebaut', false]);
    out.push(['workers assigned', assignedWorkers(game.s) > 0]);
    out.push(['freeWorkers never negative', freeWorkers(game.s) >= 0]);
    // Inland-Seen + Flüsse wieder eingestreut (mid:6213)
    out.push(['Inland-Seen wieder vorhanden', Array.isArray(game.s.lakes) && game.s.lakes.length >= 3]);
    // Gegner-Spawn läuft noch nach dem Maßstab-Rework (mid:6213)
    game.s.enemies = []; game.s.era = 2; game.s.areas = 2;
    const spOk = spawnEnemy(game.s, 'grunt');
    out.push(['spawnEnemy platziert einen Gegner', spOk === true && game.s.enemies.length === 1]);
    if (game.s.enemies.length) { const e = game.s.enemies[0]; out.push(['Gegner spawnt außerhalb des No-Spawn-Rings', dist(e.x, e.y, BASE.x, BASE.y) >= enemyNoSpawn(game.s) - 1]); }
    game.s.enemies = []; game.s.spawnT = 0; for (let i = 0; i < 200; i++) game.step(0.1);
    out.push(['Spawn-Scheduler erzeugt Gegner über Zeit', game.s.enemies.length > 0]);
    // Gegner-Cap skaliert mit Map-Größe (mid:6233): Gebiet 4 muss deutlich über das alte Cap (10) hinaus füllen
    game.s.enemies = []; game.s.spawnT = 0; game.s.era = 4; game.s.areas = 4; for (let i = 0; i < 1400; i++) game.step(0.1);
    out.push(['Gegner-Cap skaliert mit Map (Gebiet 4 > altes Cap 10)', game.s.enemies.length > 10]);
    // Außenposten-Sammler (mid:6246)
    game.s.era = 4; game.s.areas = 4; game.s.outposts = []; ALL.forEach(k => game.s.store[k] = 99999);
    game.buy('buildpost');   // baut den nächsten Außenposten (Pilz)
    out.push(['Außenposten gebaut', game.s.outposts.length === 1]);
    if (game.s.outposts.length) {
      const o = game.s.outposts[0], res = OUTPOST_TYPES[o.type].res;
      out.push(['Außenposten außerhalb des Dorfs', dist(o.x, o.y, BASE.x, BASE.y) > OUTER_R]);
      game.s.player.x = game.s.player.tx = BASE.x; game.s.player.y = game.s.player.ty = BASE.y; o.store = 0;
      for (let i = 0; i < 120; i++) game.step(0.1);   // Held an der Basis → kein Abholen, nur Akkumulation
      out.push(['Außenposten sammelt über Zeit', o.store > 0]);
      out.push(['Außenposten-Store unter Cap gedeckelt', o.store <= outpostCap(o) + 0.01]);
      o.store = outpostCap(o); const before = game.s.store[res] || 0;
      game.s.player.x = game.s.player.tx = o.x; game.s.player.y = game.s.player.ty = o.y; game.step(0.1);   // Held hin → abholen
      out.push(['Abholen füllt das Lager', (game.s.store[res] || 0) > before]);
      out.push(['Außenposten nach Abholen geleert', o.store < 1]);
      const r0 = outpostRate(o), c0 = outpostCap(o); o.tempoLvl++; o.mengeLvl++;
      out.push(['Tempo-Upgrade hebt Sammelrate', outpostRate(o) > r0]);
      out.push(['Menge-Upgrade hebt Cap', outpostCap(o) > c0]);
    }
    // Dorfgrenze auf die äußere Linie OUTER_R erweitert (mid:6280): Heilung reicht bis OUTER_R, nicht weit darüber
    game.s.enemies = []; game.s.player.hpmax = 100;
    game.s.player.hp = 50; game.s.player.x = game.s.player.tx = BASE.x + OUTER_R - 25; game.s.player.y = game.s.player.ty = BASE.y;
    for (let i = 0; i < 30; i++) updateCombat(game.s, 0.1);
    out.push(['Heilung reicht bis zur äußeren Dorflinie (OUTER_R)', game.s.player.hp > 50]);
    game.s.player.hp = 50; game.s.player.x = game.s.player.tx = BASE.x + OUTER_R + 140; game.s.player.y = game.s.player.ty = BASE.y;
    for (let i = 0; i < 30; i++) updateCombat(game.s, 0.1);
    out.push(['keine Heilung außerhalb des Dorfs', Math.abs(game.s.player.hp - 50) < 0.01]);
    // Deko + Ressourcen-Knoten dürfen NICHT auf Sand oder Wasser liegen (mid:6260)
    out.push(['keine Deko auf Sand', game.s.deco.filter(d => onSand(game.s, d.x, d.y)).length === 0]);
    out.push(['keine Knoten auf Sand', game.s.nodes.filter(n => onSand(game.s, n.x, n.y)).length === 0]);
    out.push(['keine Knoten im Wasser', game.s.nodes.filter(n => game.s.lakes.some(L => dist(n.x, n.y, L.x, L.y) < L.r)).length === 0]);
    // Türme (mid:6357/6359)
    game.s.towers = []; game.s.enemies = []; ALL.forEach(k => game.s.store[k] = 999999);
    game.panelFor = 'tb3'; game.buildTower('kaempfer');
    out.push(['Turm gebaut + Einheit gespawnt', game.s.towers.length === 1 && !!game.s.towers[0].unit]);
    if (game.s.towers.length && game.s.towers[0].unit) {
      const tw = game.s.towers[0], u = tw.unit;
      game.s.enemies = [{ kind: 'grunt', x: u.x + 30, y: u.y, home: { x: u.x + 30, y: u.y }, hp: 40, max: 40, base: 40, face: -1, animT: 0, atkT: 0, hurtT: 0, state: 'idle', moving: false, evo: 0, evoT: 0 }];
      const ehp0 = game.s.enemies[0].hp; for (let i = 0; i < 60; i++) updateTroops(game.s, 0.1);
      out.push(['Turm-Einheit kämpft (Gegner nimmt Schaden)', game.s.enemies[0].hp < ehp0]);
      game.s.player.x = u.x + 9999;
      out.push(['Gegner zielt auf nächste Turm-Einheit', enemyTarget(game.s, game.s.enemies[0]) === u]);
      game.panelFor = 'tw3'; const m0 = tw.mode; game.toggleTowerMode(); out.push(['Modus-Toggle (Wache/Folgen)', tw.mode !== m0]);
      const hp0 = towerHp(tw); game.upgTower(); out.push(['Turm-Upgrade hebt HP', towerHp(tw) > hp0]);
    }
    game.s.towers = []; game.panelFor = 'tb5'; game.buildTower('bogen'); const bt = game.s.towers[0];
    if (bt && bt.unit) { game.s.enemies = [{ kind: 'grunt', x: bt.unit.x + 130, y: bt.unit.y, home: { x: bt.unit.x + 130, y: bt.unit.y }, hp: 60, max: 60, base: 60, face: -1, animT: 0, atkT: 0, hurtT: 0, state: 'idle', moving: false, evo: 0, evoT: 0 }];
      for (let i = 0; i < 40; i++) updateTroops(game.s, 0.1); out.push(['Bogenschütze trifft auf Distanz', game.s.enemies[0].hp < 60]); }
    // save round-trip
    saveGame(game.s);
    const raw = localStorage.getItem(SAVE_KEY);
    const restored = stateFromSave(JSON.parse(raw).d);
    out.push(['save restores huts', restored.builds.length === game.s.builds.length]);
    out.push(['save restores workerPool', restored.workerPool === game.s.workerPool]);
    out.push(['save restores outposts', restored.outposts.length === game.s.outposts.length]);
    out.push(['save restores towers', restored.towers.length === game.s.towers.length]);
    return out;
  });
  checks.forEach(([name, ok]) => { if (!ok) errors.push('assertion FAILED: ' + name); else console.log('  ok ' + name); });

  await browser.close();
  if (nonOk.length) { console.log(`\n[${DEVICE}] non-200 responses:`); nonOk.forEach(x => console.log('  - ' + x)); }
  console.log(`\n[${DEVICE}] DONE. Blocking errors: ${errors.length}`);
  errors.forEach(e => console.log('  !! ' + e));
  process.exit(errors.length ? 2 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e.message); process.exit(1); });
