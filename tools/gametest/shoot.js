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
  await shot('00_intro'); // Story-Intro beim Start (neues Spiel, mid:6449)
  // Onboarding sauber durchlaufen: Intro zu → Klasse + Name bestätigen → Tutorial als erledigt markieren (für die folgenden Shots)
  await page.evaluate(() => { document.getElementById('introOverlay').classList.remove('open'); game.pendingChar='krieger'; game.nameBuf='HELD'; game.confirmName(); game.s.tutStep=99; game.renderTutStep();
    Object.keys(TUT).forEach(k=>game.s.tutShown[k]=true); game.tutQueue=[]; game.tutOpen=false; document.getElementById('tutOverlay').classList.remove('open'); });   // keine Tutorial-Overlays in den Screenshots (mid:6516)
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
    game.s.workerPool = 3; // direkt setzen (Worker-Cap = 1/Stufe, mid:7246 — Setup umgeht die Pacing-Sperre)
    // Redesign: Sammler sind Außenposten; erstes Dorf-Gebäude = Schmiede (era3).
    // Setup-Aufstiege via applyAscend (umgeht die neue Nacht→Tag-Cinematic, die buyEra verzögert; mid:7251)
    game.buy('buildpost'); // Holz-Sammler (era 0)
    applyAscend(game.s, 1); ALL.forEach(k => game.s.store[k] = 5000); // -> Stufe 2
    game.buy('buildpost'); // Kürbis-Sammler (era 1)
    applyAscend(game.s, 2); ALL.forEach(k => game.s.store[k] = 5000); // -> Stufe 3
    game.buy('buildpost'); // Stein-Sammler (era 2)
    applyAscend(game.s, 3); ALL.forEach(k => game.s.store[k] = 5000); // -> Stufe 4
    game.buy('build'); // Schmiede (era 3) — erstes Dorf-Gebäude
    game.setTab('dorf');
  });
  await sleep(300); await frames();
  await shot('04_shop_dorf_upgraded');
  // open the first hut's management panel, upgrade it (M3: Hütten haben keine Arbeiter mehr)
  await page.evaluate(() => {
    game.s.player.x = game.s.player.tx = game.s.segSlots[game.s.builds[0].seg].x;
    game.s.player.y = game.s.player.ty = game.s.segSlots[game.s.builds[0].seg].y;
    game.openPanelFor(0);
    game.upgBuild('tempo'); game.upgBuild('menge');
  });
  await sleep(300); await frames();
  await shot('04b_hut_panel');
  // close shop -> look at the world (hero evolved, huts, era building, roads)
  await page.evaluate(()=>document.getElementById('panel').classList.toggle('open')); await sleep(300); await frames(16);
  await shot('05_world_upgraded');
  // zoom out to reveal the village border / roads
  await page.evaluate(() => { for (let i = 0; i < 4; i++) game.zoom = Math.max(0.06, game.zoom / 1.18); }); await sleep(120);
  await frames(12); await shot('06_world_zoomout');
  // weit raus über den Ozean — Wolken + Strand + Wasserfelsen sichtbar (mid:6503); kleine Insel (areas=1) = viel Ozean
  await page.evaluate(() => { game.s.areas = 1; game.zoom = 0.32; }); await sleep(150);
  await frames(16); await shot('06c_ocean_clouds');
  await page.evaluate(() => { game.s.areas = 4; game.zoom = 0.6; });
  // Plateau-Nahaufnahme (mid:6523): Kamera auf ein Gebirgs-Plateau, moderater Zoom
  await page.evaluate(() => { if (game.s.plateaus && game.s.plateaus.length) { const P = game.s.plateaus[0]; game.s.cam.x = P.x; game.s.cam.y = P.y; game.camFollow = false; game.zoom = 0.7; } });
  await sleep(200); await frames(12); await shot('06d_plateau');
  // tap to move the hero, then a couple frames
  await page.mouse.click(VIEW.width * 0.7, VIEW.height * 0.4); await sleep(500); await frames(20);
  await shot('07_world_moving');
  // Gegner-Showcase (Enemy-Pack, mid:6564): Goblin/Speer-Goblin/Troll nebeneinander
  await page.evaluate(() => { game.s.era = 4; game.s.enemies = [];
    const B = BASE, mk=(kind,dx)=>({kind,x:B.x+dx,y:B.y-120,home:{x:B.x+dx,y:B.y-120},hp:ETYPES[kind].hp,max:ETYPES[kind].hp,base:ETYPES[kind].hp,face:-1,animT:0,atkT:0,hurtT:0,state:'idle',moving:false,evo:0,evoT:0});
    game.s.enemies.push(mk('grunt',-220),mk('brute',0),mk('miniboss',260));
    game.s.player.x=game.s.player.tx=B.x; game.s.player.y=game.s.player.ty=B.y+40; game.s.cam.x=B.x; game.s.cam.y=B.y-90; game.camFollow=false; game.zoom=0.62; });
  await sleep(300); await frames(16); await shot('07b_enemies');
  // Truppen-Bau-Menü: korrekte Icons + „Truppe bauen" (mid:6588)
  await page.evaluate(() => { game.s.era = 4; game.s.towers = []; game.openPanelFor('tb3'); document.getElementById('panel').classList.add('open'); });
  await sleep(300); await frames(8); await shot('07c_truppenmenu');
  await page.evaluate(() => { document.getElementById('panel').classList.remove('open'); game.panelFor = 'castle'; });
  // 4 Truppen nebeneinander — Größen-Vergleich (mid:6611)
  await page.evaluate(() => { game.s.era = 5; game.s.towers = []; game.s.enemies = [];
    ['kaempfer','bogen','lance','monk'].forEach((ty,i)=>{ const t={seg:i*3,type:ty,lvl:0,mode:'wache',downT:0}; spawnTroop(game.s,t); game.s.towers.push(t); });
    game.s.towers.forEach((t,i)=>{ const u=t.unit; u.x=u.tx=BASE.x-150+i*100; u.y=u.ty=BASE.y-30; });
    game.s.player.x=game.s.player.tx=BASE.x+220; game.s.player.y=game.s.player.ty=BASE.y-30;
    game.s.cam.x=BASE.x+30; game.s.cam.y=BASE.y-30; game.camFollow=false; game.zoom=0.62; });
  await sleep(300); await frames(10); await shot('07d_truppen');
  // endgame: max era + many upgrades
  await page.evaluate(() => {
    game.panelFor = 'castle';
    ALL.forEach(k => game.s.store[k] = 999999);
    for (let i = 0; i < 8; i++) { ['cap','speed','gather'].forEach(id => game.buy(id)); }
    while (game.s.era < 19) { ALL.forEach(k => game.s.store[k] = 999999); game.buyEra();   // gated → zahlt + startet Nacht
      if (game.s.phase === 'night') { game.s.enemies = game.s.enemies.filter(e => !e.night); game.step(0.05); } }   // Nacht sofort gewinnen → Aufstieg (Redesign §4)
    game.buy('steam'); game.buy('steam');
    for (let i = 0; i < 6; i++) { ALL.forEach(k => game.s.store[k] = 999999); game.buy('hire'); } // workerPool -> 9
    for (let i = 0; i < 6; i++) { ALL.forEach(k => game.s.store[k] = 999999); game.buy('build'); } // alle 6 Hütten (inkl. Schmiede + Juwelier-Ketten)
    for (let i = 0; i < 3; i++) { ALL.forEach(k => game.s.store[k] = 999999); game.buy('expand'); } // erschliesse alle Gebiete
    for (let i = 0; i < 3; i++) { ALL.forEach(k => game.s.store[k] = 999999); game.buy('buildpost'); } // Kürbis/Pilz/Beeren-Sammler (mid:6246/6313)
    if (game.s.outposts) game.s.outposts.forEach(o => { o.store = Math.round(outpostCap(o, game.s) * 0.7); }); // teilweise gefüllt für den Screenshot
    // rüste die Hütten hoch (M3: keine Hütten-Arbeiter mehr); Pawns in die Sammler
    game.s.builds.forEach((b, i) => { game.panelFor = i; game.upgBuild('tempo'); game.upgBuild('menge'); });
    (game.s.outposts || []).forEach((o, i) => { game.panelFor = 'op' + i; game.assignOutpost(1); game.assignOutpost(1); });
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

  // Nacht-Modus Screenshot: Stufe 3, Nacht starten, abgedunkelte Karte + Welle + Dorf-Panel
  await page.evaluate(() => {
    game.s.era = 6; game.s.phase = 'day'; game.s.enemies = []; game.s.areas = 1;   // era6: Aufstieg auf Stufe 7 = 1. Nacht (Redesign §4)
    game.s.store.pilze = 200; game.s.healBought = 0; ALL.forEach(k => game.s.store[k] = 999999); game.s.pendingEra = null; game.s.pendingCost = null;
    game.s.player.x = game.s.player.tx = BASE.x; game.s.player.y = game.s.player.ty = BASE.y + 40;
    game.buyEra(); game.s.baseHP = Math.round((game.s.baseHPmax || 100) * 0.45);   // zahlt + startet Nacht; Dorf angeschlagen
    game.s.cam.x = BASE.x; game.s.cam.y = BASE.y; game.camFollow = false; game.zoom = 0.6;   // Dorf-Mitte → Fackeln sichtbar
  });
  await sleep(400); await frames(20); await shot('12_nacht');

  // Tutorial-Tooltip Screenshot (mid:6438)
  await page.evaluate(() => { document.getElementById('panel').classList.remove('open'); game.s.tutShown = {}; game.tutQueue = []; game.tutOpen = false; game.s.tutStep = 99; game.queueTut('night1'); });
  await sleep(300); await frames(8); await shot('13_tutorial');

  // Onboarding-Screenshots (mid:6449/6450): Intro, Klassenwahl, Namens-Picker, interaktiver Schritt
  await page.evaluate(() => { document.getElementById('tutOverlay').classList.remove('open'); game.introIdx = 1; game.renderIntro(); document.getElementById('introOverlay').classList.add('open'); });
  await sleep(250); await frames(6); await shot('14_intro');
  await page.evaluate(() => { document.getElementById('introOverlay').classList.remove('open'); game.showCharSelect(); });
  await sleep(250); await frames(6); await shot('15_charselect');
  await page.evaluate(() => { document.getElementById('charSelect').classList.remove('open'); game.pendingChar = 'lanzer'; game.showNamePicker(); game.nameBuf = 'ANZU'; game.renderName(); });
  await sleep(250); await frames(6); await shot('16_namepicker');
  await page.evaluate(() => { document.getElementById('nameOverlay').classList.remove('open'); game.s.charChosen = true; game.s.tutStep = 1; game.renderTutStep(); });
  await sleep(250); await frames(6); await shot('17_tutstep');
  await page.evaluate(() => { document.getElementById('tutStepCard').classList.remove('show'); });

  // functional assertions: production scales, save round-trips the new model
  const checks = await page.evaluate(() => {
    const out = [];
    // per-era upgrade caps hold (mid:6033)
    game.panelFor = 0; const b0 = game.s.builds[0];
    for (let i = 0; i < 25; i++) { ALL.forEach(k => game.s.store[k] = 999999); game.upgBuild('tempo'); game.upgBuild('menge'); }
    out.push(['tempo capped at era+1', b0.tempo <= game.s.era + 1]);
    out.push(['menge capped at era+1', b0.menge <= game.s.era + 1]);
    for (let i = 0; i < 25; i++) { ALL.forEach(k => game.s.store[k] = 999999); game.buy('hire'); }
    out.push(['huts carry no workers (M3)', game.s.builds.every(b => !b.workers)]);
    if (!game.s.outposts || !game.s.outposts.length) game.s.outposts = [{ type: 'korn', x: BASE.x + 200, y: BASE.y, store: 0, tempoLvl: 0, mengeLvl: 0, workers: 0 }];
    game.panelFor = 'op0'; for (let i = 0; i < 10; i++) game.assignOutpost(1);
    out.push(['Sammler-Arbeiter gedeckelt (max 4)', game.s.outposts[0].workers <= 4]);
    game.panelFor = 0;
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
    // Schmiede-Kampf-Upgrades: Cap zählt AB Freischaltung (era4) → kein Nachhol-Dump (mid:7557)
    game.s.era = 4; game.s.atkLvl = 0;
    for (let i = 0; i < 30; i++) { ALL.forEach(k => game.s.store[k] = 999999); game.buy('angriff'); }
    out.push(['Kampf-Upgrade nicht auf einmal nachholbar (Cap ab Schmiede)', game.s.atkLvl === combatMaxLvl(game.s) && game.s.atkLvl < heroMaxLvl(game.s)]);
    // Balance-Umbau (mid:7578): absoluter Schaden, lineare Gegner, keine Evo, Sammler-Cap ab Bau-Stufe
    { const fs = freshState(); out.push(['Held-Schaden absolut (Basis 10)', fs.atk === 10]); }
    { const s2 = game.s; s2.atk = 10; s2.atkLvl = 0; s2.era = 5; ALL.forEach(k => s2.store[k] = 999999); game.buy('angriff'); out.push(['Angriff-Upgrade +5 absolut', s2.atk === 15]); }
    out.push(['Keine Einheiten-Evolution mehr (maxEvo 0)', maxEvo(game.s) === 0]);
    out.push(['Gegner-HP linear pro Stufe (Grunt St5 = 68)', (ETYPES.grunt.hp + ETYPES.grunt.hpEra * 4) === 68]);
    { const o = { type: 'korn', buildEra: 4 }; game.s.era = 4; out.push(['Sammler-Cap ab Bau-Stufe (frisch gebaut = 1)', sammlerMax(o, game.s) === 1]); game.s.era = 6; out.push(['Sammler-Cap waechst nach Bau (+2 Stufen = 3)', sammlerMax(o, game.s) === 3]); }
    // Kamera: moveTo aktiviert Follow wieder; freier Schwenk bleibt stehen (mid:6040)
    moveTo({ x: game.s.player.x + 200, y: game.s.player.y });
    out.push(['moveTo re-enables camFollow', game.camFollow === true]);
    game.camFollow = false; game.camGoal.x = 600; game.camGoal.y = 600; game.s.cam.x = 600; game.s.cam.y = 600;
    for (let i = 0; i < 25; i++) game.step(0.1); // Held läuft, Kamera darf NICHT zu ihm snappen
    out.push(['free-look camera stays put', Math.abs(game.s.cam.x - 600) < 70 && game.camFollow === false]);
    // freie Arbeiter: Schwarm == freier Pool, Zuweisen verkleinert ihn, Abliefern füllt das Lager (mid:6048)
    game.s.builds.forEach(b => b.workers = 0);
    if (!game.s.outposts || !game.s.outposts.length) game.s.outposts = [{ type: 'korn', x: BASE.x + 200, y: BASE.y, store: 0, tempoLvl: 0, mengeLvl: 0, workers: 0 }];
    game.s.outposts.forEach(o => o.workers = 0); game.s.workerPool = 4; game.step(0.1);   // alle Sammler leeren → freier Pool == Schwarm
    out.push(['free walkers match free pool', game.s.freeWalkers.length === 4]);
    game.panelFor = 'op0'; game.assignOutpost(1); game.assignOutpost(1); game.step(0.1);
    out.push(['assigning to Sammler shrinks the walker swarm', game.s.freeWalkers.length === freeWorkers(game.s)]);
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
    out.push(['production scales with upgrades (Tempo/Menge)', boosted > base]);
    out.push(['all 6 hut types built', game.s.builds.length === 6]);
    // 2-stufige Kette: Juwelier verbraucht Gold+Stein, produziert Kristall (mid:6046 Phase B)
    // Redesign 2026-06-24: Marktplatz (type-key 'juwelier') produziert Edelstein statt Kristall (P1 interim-Konverter)
    const jw = game.s.builds.find(b => b.type === 'juwelier');
    if (jw) {
      // §9: 3-Modus-Tausch — Combo (Holz+Stein+Gold) → Edelstein, höherer Modus = besserer Kurs
      jw.marktMode = 1;
      ALL.forEach(k => game.s.store[k] = 0); game.s.store.holz = 1000; game.s.store.stein = 1000; game.s.store.gold = 1000;
      const ed0 = game.s.store.edelstein, gd0 = game.s.store.gold, hz0 = game.s.store.holz;
      for (let i = 0; i < 30; i++) produce(game.s, jw, 0.2);
      out.push(['Marktplatz produziert Edelstein', game.s.store.edelstein > ed0]);
      out.push(['Marktplatz verbraucht Roh-Combo (Holz+Gold)', game.s.store.gold < gd0 && game.s.store.holz < hz0]);
      const ratio = (mode) => { jw.marktMode = mode; ALL.forEach(k => game.s.store[k] = 0); game.s.store.holz = 1e5; game.s.store.stein = 1e5; game.s.store.gold = 1e5; for (let i = 0; i < 50; i++) produce(game.s, jw, 0.2); return game.s.store.edelstein / (1e5 - game.s.store.gold); };
      out.push(['Markt-Modus 3 = besserer Kurs als Modus 1', ratio(3) > ratio(1)]);
      out.push(['Markt-Modus-Cap (era<13→1, era>=15→3)', marktMaxMode({ era: 12 }) === 1 && marktMaxMode({ era: 19 }) === 3]);
    } else out.push(['Marktplatz gebaut', false]);
    // Ökonomie-Redesign Datenlayer (P1)
    out.push(['20 Stufen definiert', ERAS.length === 20]);
    out.push(['edelstein in Ressourcen', ALL.includes('edelstein')]);
    out.push(['kristall + beeren entfernt', !ALL.includes('kristall') && !ALL.includes('beeren')]);
    out.push(['eraCost für alle 19 Aufstiege definiert', Array.from({length:19}, (_,i)=>i+1).every(e => eraCost(e) && Object.keys(eraCost(e)).length > 0)]);
    out.push(['Pawns im Sammler zählen als assigned (M3)', assignedWorkers(game.s) > 0]);
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
      out.push(['Außenposten-Store unter Cap gedeckelt', o.store <= outpostCap(o, game.s) + 0.01]);
      o.store = outpostCap(o, game.s); const before = game.s.store[res] || 0;
      game.s.player.x = game.s.player.tx = o.x; game.s.player.y = game.s.player.ty = o.y; game.step(0.1);   // Held hin → abholen
      out.push(['Abholen füllt das Lager', (game.s.store[res] || 0) > before]);
      out.push(['Außenposten nach Abholen geleert', o.store < 1]);
      // per-Sammler Upgrades (mid:7518: jeder levelt für sich)
      const r0 = outpostRate(o, game.s), c0 = outpostCap(o, game.s); o.tempoLvl = (o.tempoLvl || 0) + 1; o.mengeLvl = (o.mengeLvl || 0) + 1;
      out.push(['Sammler-Tempo (per-Outpost) hebt Rate', outpostRate(o, game.s) > r0]);
      out.push(['Sammler-Cap (per-Outpost) hebt Lager', outpostCap(o, game.s) > c0]);
      const rw0 = outpostRate(o, game.s); o.workers = 2;   // Pawns ändern die Rate NICHT mehr (mid:7249)
      out.push(['Pawn ändert die Sammelrate nicht', Math.abs(outpostRate(o, game.s) - rw0) < 1e-9]);
      const savedBuilds = game.s.builds; game.s.builds = [];   // Konsum-Gebäude (Schmiede etc.) raus → saubere Messung der Heim-Lieferung
      o.store = 0; o._home = 0; game.s.player.x = game.s.player.tx = BASE.x; game.s.player.y = game.s.player.ty = BASE.y;   // Held weg vom Sammler
      const homeBefore = game.s.store[res] || 0;
      for (let i = 0; i < 80; i++) game.step(0.1);   // 8s: Pawn soll automatisch einen Teil heimbringen
      out.push(['Pawn liefert automatisch heim (ohne Held)', (game.s.store[res] || 0) > homeBefore]);
      out.push(['Sammler füllt sich trotz Pawn weiter', o.store > 0]);
      game.s.builds = savedBuilds; o.workers = 0; o._home = 0;
    }
    // §10: KEINE Auto-Heilung mehr — auch im Dorf regeneriert der Held nicht passiv (Heilung läuft über Food-Crafting)
    game.s.enemies = []; game.s.player.hpmax = 100;
    game.s.player.hp = 50; game.s.player.x = game.s.player.tx = BASE.x; game.s.player.y = game.s.player.ty = BASE.y;
    for (let i = 0; i < 30; i++) updateCombat(game.s, 0.1);
    out.push(['Keine passive Heilung im Dorf (§10)', Math.abs(game.s.player.hp - 50) < 0.01]);
    // Deko + Ressourcen-Knoten dürfen NICHT auf Sand oder Wasser liegen (mid:6260)
    out.push(['keine Deko auf Sand', game.s.deco.filter(d => onSand(game.s, d.x, d.y)).length === 0]);
    out.push(['keine Knoten auf Sand', game.s.nodes.filter(n => onSand(game.s, n.x, n.y)).length === 0]);
    out.push(['keine Knoten im Wasser', game.s.nodes.filter(n => game.s.lakes.some(L => dist(n.x, n.y, L.x, L.y) < L.r)).length === 0]);
    // Türme (mid:6357/6359/6385)
    game.s.era = 6; game.s.towers = []; game.s.enemies = []; ALL.forEach(k => game.s.store[k] = 999999);
    game.panelFor = 'tb3'; game.buildTower('kaempfer');
    out.push(['Truppe gebaut + Einheit gespawnt', game.s.towers.length === 1 && !!game.s.towers[0].unit]);
    if (game.s.towers.length && game.s.towers[0].unit) {
      const tw = game.s.towers[0], u = tw.unit;
      game.s.enemies = [{ kind: 'grunt', x: u.x + 30, y: u.y, home: { x: u.x + 30, y: u.y }, hp: 40, max: 40, base: 40, face: -1, animT: 0, atkT: 0, hurtT: 0, state: 'idle', moving: false, evo: 0, evoT: 0 }];
      const ehp0 = game.s.enemies[0].hp; for (let i = 0; i < 60; i++) updateTroops(game.s, 0.1);
      out.push(['Truppe kämpft (Gegner nimmt Schaden)', game.s.enemies[0].hp < ehp0]);
      game.s.player.x = u.x + 9999;
      out.push(['Gegner zielt auf nächste Truppe', enemyTarget(game.s, game.s.enemies[0]) === u]);
      // 3-Modus-Cycle §5b: wache → folgen → posten → wache
      game.panelFor = 'tw3'; const m0 = tw.mode; game.toggleTowerMode();
      out.push(['3-Modus wache→folgen', m0 === 'wache' && tw.mode === 'folgen']);
      game.toggleTowerMode(); out.push(['3-Modus folgen→posten', tw.mode === 'posten']);
      game.toggleTowerMode(); out.push(['3-Modus posten→wache', tw.mode === 'wache']);
      // §5: globales Truppen-Upgrade (Kaserne) statt per-Truppe
      const hp0 = towerHp(tw, game.s); ALL.forEach(k => game.s.store[k] = 999999); game.upgTroopGlobal('hp');
      out.push(['Globales Truppen-HP-Upgrade hebt HP', towerHp(tw, game.s) > hp0 && game.s.troopHpLvl === 1]);
      const at0 = towerAtk(tw, game.s); game.upgTroopGlobal('atk');
      out.push(['Globales Truppen-Schaden-Upgrade hebt Schaden', towerAtk(tw, game.s) > at0 && game.s.troopAtkLvl === 1]);
    }
    game.s.towers = []; game.panelFor = 'tb5'; game.buildTower('bogen'); const bt = game.s.towers[0];
    if (bt && bt.unit) { game.s.enemies = [{ kind: 'grunt', x: bt.unit.x + 130, y: bt.unit.y, home: { x: bt.unit.x + 130, y: bt.unit.y }, hp: 60, max: 60, base: 60, face: -1, animT: 0, atkT: 0, hurtT: 0, state: 'idle', moving: false, evo: 0, evoT: 0 }];
      for (let i = 0; i < 40; i++) updateTroops(game.s, 0.1); out.push(['Bogenschütze trifft auf Distanz', game.s.enemies[0].hp < 60]); }
    // Slot-Staffel §5b: Truppen ab Kaserne (era4), S5:2·S7:3·S11:6·S13:8·S19:12
    out.push(['Truppen erst ab Kaserne (era4)', towerAllowance({era:3})===0 && towersUnlocked({era:4})===true]);
    out.push(['Slot-Staffel (era4:2,era6:3,era10:6,era12:8,era18:12)', towerAllowance({era:4})===2 && towerAllowance({era:6})===3 && towerAllowance({era:10})===6 && towerAllowance({era:12})===8 && towerAllowance({era:18})===12]);
    game.s.era = 4; game.s.towers = []; game.s.enemies = []; ALL.forEach(k => game.s.store[k] = 999999);
    game.panelFor = 'tb0'; game.buildTower('kaempfer'); game.panelFor = 'tb2'; game.buildTower('bogen');
    out.push(['Stufe 5: 2 Truppen baubar', game.s.towers.length === 2]);
    game.panelFor = 'tb4'; game.buildTower('kaempfer');
    out.push(['Stufe 5: 3. Truppe blockiert (Limit 2)', game.s.towers.length === 2]);
    game.s.era = 6; game.panelFor = 'tb4'; game.buildTower('kaempfer');
    out.push(['Stufe 7: 3. Truppe erlaubt (Limit 3)', game.s.towers.length === 3]);
    // Mönch (Stufe 7) heilt; Lanze (Stufe 13) baubar
    game.s.era = 12; game.s.towers = []; game.s.enemies = []; ALL.forEach(k => game.s.store[k] = 999999); game.panelFor = 'tb1'; game.buildTower('lance'); game.panelFor = 'tb9'; game.buildTower('monk');
    out.push(['Lanze (S13) + Mönch baubar', game.s.towers.length === 2 && game.s.towers.every(t => t.unit)]);
    const mt = game.s.towers.find(t => t.type === 'monk');
    if (mt && mt.unit) { game.s.player.hpmax = 100; game.s.player.hp = 40; game.s.player.x = game.s.player.tx = mt.unit.x + 20; game.s.player.y = game.s.player.ty = mt.unit.y;
      for (let i = 0; i < 60; i++) updateTroops(game.s, 0.1); out.push(['Mönch heilt verwundeten Verbündeten', game.s.player.hp > 40]); }
    // Kampf-Panda (Stufe 18 / era17, 5. Truppe)
    game.s.era = 17; game.s.towers = []; ALL.forEach(k => game.s.store[k] = 999999); game.panelFor = 'tb6'; game.buildTower('panda');
    out.push(['Kampf-Panda baubar (Stufe 18)', game.s.towers.length === 1 && game.s.towers[0].type === 'panda' && !!game.s.towers[0].unit]);
    // --- Nacht-Gating (Redesign §4): Aufstieg auf Stufe 7 (era6)+ = überstandene Nacht; Stufe 2-6 nacht-frei ---
    game.s.era = 5; game.s.phase = 'day'; game.s.enemies = []; game.s.areas = 2; game.s.builds = []; ALL.forEach(k => game.s.store[k] = 999999); game.s.pendingEra = null; game.s.pendingCost = null;
    out.push(['Stufe 2-6 nicht nacht-gated', !nightGated(1) && !nightGated(5)]);
    out.push(['Aufstieg auf Stufe 7 nacht-gated', nightGated(6) === true]);
    const holzA = game.s.store.holz;
    game.buyEra();   // era5 → next 6 (Stufe 7): gated → zahlt + startet Nacht
    out.push(['gated Aufstieg zahlt + startet Nacht', game.s.phase === 'night' && game.s.pendingEra === 6 && game.s.store.holz < holzA]);
    out.push(['Aufstieg während Nacht blockiert', (game.buyEra(), game.s.era === 5)]);
    game.s.enemies = game.s.enemies.filter(e => !e.night); game.step(0.05);   // Welle besiegt → überstanden
    out.push(['Nacht überstanden → Aufstieg vollzogen (Stufe 7)', game.s.phase === 'day' && game.s.era === 6]);
    // Verlust-Strafe (§4): 20% Preis zurück, Stufe bleibt, Dorf heilt (mit Reparatur >=50%)
    game.s.era = 6; game.s.phase = 'day'; game.s.enemies = []; game.s.areas = 2; game.s.builds = [{ type: 'reparatur', seg: 0, tempo: 0, menge: 0, workers: 0 }]; ALL.forEach(k => game.s.store[k] = 999999); game.s.pendingEra = null; game.s.pendingCost = null;
    const holzB = game.s.store.holz; game.buyEra();   // zahlt für Stufe 8, startet Nacht
    const paidHolz = game.s.pendingCost ? game.s.pendingCost.holz : 0;
    game.s.baseHPmax = 100; game.s.baseHP = 0; game.step(0.05);   // Dorf überrannt → verloren
    out.push(['Nacht verloren → Stufe bleibt (kein Game-Over)', game.s.era === 6 && game.s.phase === 'day']);
    out.push(['Nacht verloren → 20% Preis zurück', Math.abs(game.s.store.holz - (holzB - paidHolz * 0.8)) < 1]);
    out.push(['Nacht verloren → Dorf heilt mit Reparatur >=50%', game.s.baseHP >= 50]);
    // --- Nacht-KI: Welle marschiert aufs Hauptgebäude, zieht Dorf-Leben; Held lenkt ab; Überrannt ohne Reparatur = 100% reset ---
    game.s.era = 6; game.s.phase = 'day'; game.s.enemies = []; game.s.towers = []; game.s.builds = []; game.s.areas = 2; ALL.forEach(k => game.s.store[k] = 999999); game.s.pendingEra = null; game.s.pendingCost = null;
    game.s.player.x = game.s.player.tx = BASE.x + 99999; game.s.player.y = game.s.player.ty = BASE.y;   // Held weit weg → keine Aggro
    game.startNight();   // → buyEra → Nacht
    game.s.baseHP = game.s.baseHPmax || 100; const bhp0 = game.s.baseHP;
    game.s.enemies = game.s.enemies.slice(0, 1);   // 1 Gegner direkt ans Hauptgebäude
    const ne = game.s.enemies[0]; ne.x = BASE.x + 30; ne.y = BASE.y; ne.atkT = 0;
    for (let i = 0; i < 6; i++) game.step(0.1);
    out.push(['Nacht-Welle zieht Dorf-Leben ab (kein Verteidiger)', game.s.baseHP < bhp0 && game.s.phase === 'night']);
    game.s.player.x = game.s.player.tx = ne.x + 20; game.s.player.y = game.s.player.ty = ne.y;   // Held in Aggro-Reichweite
    out.push(['Nacht-Gegner lässt sich von Held ablenken', nightTarget(game.s, ne) === game.s.player]);
    game.s.player.x = game.s.player.tx = BASE.x + 99999; game.s.baseHP = 1;   // Held wieder weg, Dorf fast tot
    game.s.enemies.forEach(e => { e.x = BASE.x + 20; e.y = BASE.y; e.atkT = 0; });
    for (let i = 0; i < 16; i++) game.step(0.1);
    out.push(['Dorf überrannt ohne Reparatur → 100% reset, Stufe bleibt', game.s.phase === 'day' && game.s.era === 6 && game.s.baseHP === (game.s.baseHPmax || 100)]);
    // --- cP-gekoppelte Nacht-Wellen (Kampf-Punkte, mid:7039): Welle skaliert mit Spieler-cP ---
    game.s.era = 10; game.s.troopAtkLvl = 0; game.s.troopHpLvl = 0; game.s.player.hpmax = 100; game.s.atk = 1; game.s.endlessActive = false; game.s.endlessNights = 0;
    const cp0 = playerCombatCP(game.s); game.s.troopAtkLvl = 5; game.s.troopHpLvl = 5;
    out.push(['Spieler-cP steigt mit globalen Truppen-Upgrades', playerCombatCP(game.s) > cp0]);
    // Welle skaliert per Gesamt-cP (nicht Anzahl — zähere Gegner = weniger Stück fürs selbe cP)
    const waveCP = () => game.s.enemies.filter(e => e.night).reduce((a, e) => a + enemyCP(e.kind, game.s.era), 0);
    game.s.phase = 'day'; game.s.enemies = []; spawnNightWave(game.s); const w1 = waveCP();
    game.s.phase = 'day'; game.s.enemies = []; game.s.era = 16; spawnNightWave(game.s); const w2 = waveCP();
    out.push(['cP-Welle skaliert mit Stufe (era16-cP > era10-cP)', w2 > w1 && w1 > 0]);
    out.push(['enemyCP/troopCP in cP definiert', enemyCP('grunt', 10) > 0 && troopCP({ type: 'kaempfer' }, game.s) > 0]);
    // --- Gegner-Vielfalt (Enemy-Pack): späte Wellen mischen Spinne + Totenkopf ---
    game.s.era = 16; game.s.phase = 'day'; game.s.enemies = []; game.s.endlessActive = false; game.s.endlessNights = 0; spawnNightWave(game.s);
    const kinds = new Set(game.s.enemies.filter(e => e.night).map(e => e.kind));
    out.push(['Späte Welle mischt mehrere Gegner-Typen', kinds.size >= 3]);
    out.push(['Spinne + Totenkopf in der späten Welle', kinds.has('spider') && kinds.has('skull')]);
    out.push(['enemyCP für neue Typen definiert', enemyCP('spider', 10) > 0 && enemyCP('skull', 10) > 0]);
    // --- Spezial-Attacken §5: Wirbelschlag (AoE) + Sturmangriff (Dash), cP-basierte Werte ---
    game.s.era = 14; game.s.skillWirbel = true; game.s.skillSturm = true; game.s.wirbelCd = 0; game.s.sturmCd = 0; game.s.atk = 1; game.s.phase = 'day';
    game.s.player.x = game.s.player.tx = BASE.x; game.s.player.y = game.s.player.ty = BASE.y; game.s.player.face = 1;
    const mkE = (dx) => ({ kind: 'grunt', x: BASE.x + dx, y: BASE.y, home: { x: BASE.x + dx, y: BASE.y }, hp: 500, max: 500, base: 500, face: -1, animT: 0, atkT: 0, hurtT: 0, state: 'idle', moving: false, evo: 0, evoT: 0 });
    game.s.enemies = [mkE(50), mkE(600)];
    const eNah = game.s.enemies[0].hp; game.useWirbel();
    out.push(['Wirbelschlag trifft nahen Gegner', game.s.enemies[0].hp < eNah]);
    out.push(['Wirbelschlag setzt Cooldown', game.s.wirbelCd > 0]);
    out.push(['Wirbelschlag verschont fernen Gegner (AoE-Radius)', game.s.enemies[1].hp === 500]);
    game.s.player.x = game.s.player.tx = BASE.x; game.s.enemies = [mkE(600)]; game.s.sturmCd = 0;
    const farHp = game.s.enemies[0].hp, px0 = game.s.player.x; game.useSturm();
    out.push(['Sturmangriff dasht den Helden zum Ziel', Math.abs(game.s.player.x - px0) > 100]);
    out.push(['Sturmangriff trifft Gegner im Pfad', game.s.enemies[0].hp < farHp]);
    game.s.skillWirbel = false; game.s.wirbelCd = 0; const eLock = game.s.enemies[0].hp; game.useWirbel();
    out.push(['Spezial-Attacke gesperrt ohne Freischaltung', game.s.enemies[0].hp === eLock]);
    // --- Kürbis-Suppe (mid:7506): kochen in der Burg → tragen → blauer Heil-Button verbraucht 1 ---
    game.s.era = 9; game.s.player.hpmax = 200; game.s.player.hp = 50; game.s.player.x = game.s.player.tx = BASE.x; game.s.player.y = game.s.player.ty = BASE.y;
    ALL.forEach(k => game.s.store[k] = 0); game.s.enemies = []; game.s.phase = 'day'; game.s.soup = 0; game.s.soupCapLvl = 0;
    for (let i = 0; i < 30; i++) game.step(0.1);   // im Dorf, ohne Suppe → HP darf NICHT steigen (kein Auto-Heal)
    out.push(['Kein Auto-Heal mehr (HP steigt nicht ohne Suppe)', game.s.player.hp <= 50]);
    game.s.store.korn = 100; game.cookSoup();
    out.push(['Suppe kochen hebt den Vorrat', game.s.soup === 1]);
    out.push(['Suppe kochen kostet Kürbis', game.s.store.korn < 100]);
    const fhp0 = game.s.player.hp; game.soupHeal();
    out.push(['Blauer Heil-Button heilt den Helden', game.s.player.hp > fhp0]);
    out.push(['Heilen verbraucht eine Suppe', game.s.soup === 0]);
    game.s.player.hp = game.s.player.hpmax; game.s.soup = 1; game.soupHeal();
    out.push(['Heilen bei voller HP verbraucht nichts', game.s.soup === 1]);
    game.s.store.korn = 9999; for (let i = 0; i < 99; i++) game.cookSoup();
    out.push(['Suppen-Vorrat ist gedeckelt (Default 3)', game.s.soup === 3]);
    game.s.store.korn = 9999; game.s.store.pilze = 9999; game.upgSoupCap();
    out.push(['Heiler-Upgrade hebt den Vorrats-Cap', game.s.soupCapLvl === 1]);
    // --- Endgame §12: Stufe 20 → Sieg + Bestenliste + Endless ---
    game.s.era = 18; game.s.phase = 'day'; game.s.enemies = []; game.s.builds = []; game.s.won = false; game.s.wonShown = false; game.s.endless = false; game.s.endlessNights = 0; game.s.endlessActive = false; game.s.playerName = 'TEST'; ALL.forEach(k => game.s.store[k] = 999999); game.s.pendingEra = null; game.s.pendingCost = null;
    game.buyEra();   // era18→19 (Stufe 20): gated → Nacht
    game.s.enemies = game.s.enemies.filter(e => !e.night); game.step(0.05);   // überstanden → applyAscend(19) = Sieg
    out.push(['Stufe 20 erreicht → Sieg-Flag + Endless frei', game.s.era === 19 && game.s.won === true && game.s.endless === true]);
    out.push(['Sieg → Bestenliste-Eintrag', lbLoad().some(e => e.n === 'TEST' && e.s === 20)]);
    game.s.phase = 'day'; game.s.enemies = []; game.endlessNight();
    out.push(['Endlos-Nacht startet (Welle)', game.s.phase === 'night' && game.s.endlessActive === true && game.s.enemies.some(e => e.night)]);
    game.s.enemies = game.s.enemies.filter(e => !e.night); game.step(0.05);
    out.push(['Endlos-Nacht überstanden → Score +1', game.s.endlessNights === 1 && game.s.phase === 'day']);
    // --- Dorf-Heilung gegen Pilze, steigender Preis (mid:6431) ---
    game.s.era = 4; game.s.baseHP = 30; game.s.baseHPmax = 100; game.s.healBought = 0; game.s.store.pilze = 999;
    const hc0 = healCost(game.s); game.healVillage();
    out.push(['Dorf-Heilung füllt Lebensleiste', game.s.baseHP === game.s.baseHPmax]);
    out.push(['Dorf-Heilung kostet Pilze', game.s.store.pilze === 999 - hc0]);
    out.push(['Heilung wird mit jedem Kauf teurer', healCost(game.s) > hc0]);
    // --- Onboarding: 3 Schadensklassen + Boni, Bad-Word-Filter, Namens-Picker (mid:6449) ---
    out.push(['3 Start-Klassen = Schadensklassen', Object.keys(CHARS).join(',') === 'krieger,archer,lanzer']);
    out.push(['Bad-Word-Filter blockt', isBadName('FICK') === true && isBadName('SHIT') === true]);
    out.push(['saubere Kürzel erlaubt', isBadName('ANZU') === false && isBadName('LUCY') === false]);
    game.s.heroRangeMul = 1; game.s.atk = 1; CHARS.archer.apply(game.s); out.push(['Archer-Bonus: größere Reichweite', game.s.heroRangeMul > 1]);
    game.s.atk = 1; CHARS.lanzer.apply(game.s); out.push(['Lanzer-Bonus: mehr Angriff', game.s.atk > 1]);
    game.s.def = 0; CHARS.krieger.apply(game.s); out.push(['Krieger-Bonus: mehr Rüstung', game.s.def >= 2]);
    game.s.charChosen = false; game.pendingChar = 'archer'; game.nameBuf = '';
    ['T', 'E', 'S', 'T'].forEach(c => game.nameKey(c));
    out.push(['Namens-Picker baut 4-Kürzel', game.nameBuf === 'TEST']);
    game.confirmName();
    out.push(['Name bestätigt → gespeichert + Klasse gesetzt', game.s.playerName === 'TEST' && game.s.char === 'archer' && game.s.charChosen === true]);
    // --- Interaktives Basis-Tutorial (mid:6450): Schritt rückt erst nach ausgeführter Aktion ---
    game.s.charChosen = true; game.s.tutStep = 0; game.s.tutMoved = false; game.s.tutHarvested = false; game.s.firstDeposit = false; game.s.tutMenu = false;
    game.checkTut(); out.push(['Tutorial-Schritt wartet auf Aktion', game.s.tutStep === 0]);
    game.s.tutMoved = true; game.checkTut(); out.push(['Schritt rückt nach „laufen"', game.s.tutStep === 1]);
    game.s.tutHarvested = true; game.checkTut(); out.push(['Schritt rückt nach „sammeln"', game.s.tutStep === 2]);
    game.s.firstDeposit = true; game.checkTut(); out.push(['Schritt rückt nach „abladen"', game.s.tutStep === 3]);
    game.s.tutMenu = true; game.checkTut(); out.push(['Schritt rückt nach „Burg öffnen"', game.s.tutStep === 4]);
    game.s.capLvl = 1; game.checkTut(); out.push(['Schritt rückt nach „Upgrade kaufen"', game.s.tutStep === 5]);
    game.s.tutBag = true; game.checkTut(); out.push(['Basis-Tutorial abgeschlossen', game.s.tutStep >= TUT_STEPS.length]);
    // --- Kontext-Tooltips (mid:6438): erst NACH dem Basis-Tutorial, einmalig ---
    game.s.tutShown = {}; game.tutQueue = []; game.tutOpen = false; game.s.era = 4; game.checkTut();   // Truppen-Tooltip ab Kaserne (era4, Redesign §5b)
    out.push(['Context-Tooltip feuert nach Basis-Tutorial (Truppen)', game.s.tutShown.towers === true]);
    // Onboarding-Tooltips für die neuen Systeme (Steffen mid:7095) — je beim Erst-Kontakt
    game.s.charChosen = true; game.s.tutStep = 99;
    game.s.tutShown = {}; game.s.player.hp = 50; game.s.player.hpmax = 100; game.checkTut();
    out.push(['Onboarding: Food-Heilung bei erster Verletzung', game.s.tutShown.food === true]);
    game.s.tutShown = {}; game.s.player.hp = 100; game.s.towers = [{ seg: 0, type: 'kaempfer' }]; game.checkTut();
    out.push(['Onboarding: Truppen-Modus bei erster Truppe', game.s.tutShown.troopmode === true]);
    game.s.tutShown = {}; game.s.towers = []; game.s.builds = [{ type: 'juwelier', seg: 0 }]; game.checkTut();
    out.push(['Onboarding: Marktplatz beim Bauen', game.s.tutShown.markt === true]);
    game.s.tutShown = {}; game.s.builds = []; game.s.skillWirbel = true; game.checkTut();
    out.push(['Onboarding: Spezial-Attacke beim Freischalten', game.s.tutShown.skills === true]);
    out.push(['Tutorial-Stand wird gespeichert', (saveGame(game.s), JSON.parse(localStorage.getItem(SAVE_KEY)).d.tutShown.towers === true)]);
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
