// Gezielte Repro/Verifikation der Playtester-Bugs A1 (Helfer-Zuordnung) + A4 (Tower-Slot-Tap)
// + Smoke-Check A3 (Hindernis-Ausweichen) und A5 (Gegner-Angriffs-Flag).
// Nutzt game-Internals (kein synthetischer Canvas-Pointer → keine Puppeteer-Quirks).
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8765/static/basebuilder.html?dev=1';
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--use-gl=swiftshader'],
    defaultViewport: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true } });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type()==='error' && !/Failed to load resource/.test(m.text())) errs.push('console: '+m.text()); });
  await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction(() => typeof game !== 'undefined' && game.s, { timeout: 10000 });

  const out = await page.evaluate(() => {
    const R = {};
    const s = game.s;
    // --- Mid-Game-State erzwingen: Intro/Tut überspringen, Stufe 5, Ressourcen, Helfer ---
    s.charChosen = true; s.char = 'krieger'; s.tutStep = 999; s.era = 4;
    game.s.store = Object.assign({}, s.store);
    for (const k of ['holz','stein','gold','korn','beeren','pilze','kristall']) s.store[k] = 99999;
    s.workerPool = 6;
    // ein paar Produzenten bauen (build = nächster BUILD_ORDER-Typ in ein freies Segment)
    for (let i=0;i<3;i++) game.buy('build');
    game.buildShop();
    R.builds = s.builds.map(b => b.type);
    R.workerPool = s.workerPool;

    // === A1: Hütten-Treffer-Test — löst ein Tap auf Hütte i auch hutIdx===i aus? ===
    // (repliziert die endPointer-Auswahl: nächste Hütte < 72px)
    R.A1_hitTest = [];
    for (let i=0;i<s.builds.length;i++){
      const sl = buildPos(s.builds[i]); if(!sl){ R.A1_hitTest.push({i,ok:false,reason:'no pos'}); continue; }
      let hutIdx=-1, hutD=72;
      for (let j=0;j<s.builds.length;j++){ const p=buildPos(s.builds[j]); if(!p)continue; const d=Math.hypot(sl.x-p.x,sl.y-p.y); if(d<hutD){ hutD=d; hutIdx=j; } }
      R.A1_hitTest.push({ i, resolved: hutIdx, ok: hutIdx===i });
    }
    // === A1: assign-Plumbing — panelFor=0, assign(1) → workers hoch + freeWorkers runter? ===
    game.panelFor = 0; const w0 = s.builds[0].workers||0, fw0 = freeWorkers(s);
    game.assign(1);
    R.A1_assign = { before:w0, after:s.builds[0].workers, freeBefore:fw0, freeAfter:freeWorkers(s),
                    ok: s.builds[0].workers===w0+1 && freeWorkers(s)===fw0-1 };

    // === A4: Tower-Slot-Tap — leerer Slot (Stufe 3+ → towersUnlocked) tappbar? ===
    R.A4_unlocked = towersUnlocked(s);
    R.A4_hitTest = [];
    for (let i=0;i<s.towerSlots.length;i++){
      const ts = s.towerSlots[i];
      // repliziere die tsIdx-Auswahl (dist<58, towerAt||towersUnlocked) + Dispatch-Priorität (op>ts>hut>base)
      let tsIdx=-1, tsD=58;
      for (let j=0;j<s.towerSlots.length;j++){ const t=s.towerSlots[j], d=Math.hypot(ts.x-t.x,ts.y-(t.y-12)); if(d<tsD && (towerAt(s,j)||towersUnlocked(s))){ tsD=d; tsIdx=j; } }
      // konkurriert ein Hütten-Treffer? (hut hat NIEDRIGERE Priorität, aber prüfen ob op/base den Slot klauen)
      const tappedBase = Math.hypot(ts.x-BASE.x, ts.y-BASE.y) < BASE_SOLID+85;
      R.A4_hitTest.push({ i, resolved: tsIdx, ok: tsIdx===i, baseSteals: tappedBase && tsIdx<0 });
    }
    // Slot 0 bebauen → wird er als 'tw' (gebaut) erkannt?
    game.panelFor = 'tb0';
    if (game.buildTower) { try { game.buildTower('kaempfer'); } catch(e){ R.A4_buildErr = e.message; } }
    R.A4_afterBuild = { towerAt0: !!towerAt(s,0), tType: (towerAt(s,0)||{}).type };

    // === A5: greift ein Gegner mit attacking-Flag an? ===
    // Gegner direkt am Helden platzieren, step() → sollte attacking=true setzen
    const P = s.player;
    s.enemies.push({ kind:'grunt', x:P.x+20, y:P.y, home:{x:P.x+20,y:P.y}, hp:50,max:50,base:50, face:-1, animT:0, atkT:0, hurtT:0, state:'chase', moving:false, evo:0, evoT:0 });
    const before = s.enemies[s.enemies.length-1].attacking;
    game.step(0.1);
    R.A5 = { flagBefore: before, flagAfter: s.enemies[s.enemies.length-1] && s.enemies[s.enemies.length-1].attacking };

    // === A3: Gegner hinter Felsen → läuft er drumrum (bewegt sich seitlich) statt fest? ===
    R.A3 = { hasObstacles: s.obstacles.length };
    // kleinsten Stein nehmen (Playtester meinte Felsen, nicht Seen)
    const smalls = s.obstacles.filter(o=>o.r<50).sort((a,b)=>a.r-b.r);
    if (smalls.length){
      const ob = smalls[0]; R.A3.testRockR = Math.round(ob.r);
      // Gegner exakt auf Linie vor dem Hindernis, Ziel dahinter
      const ang = Math.atan2(ob.y-BASE.y, ob.x-BASE.x);
      const e = { kind:'grunt', x: ob.x-Math.cos(ang)*(ob.r+30), y: ob.y-Math.sin(ang)*(ob.r+30),
                  tx: ob.x+Math.cos(ang)*(ob.r+30), ty: ob.y+Math.sin(ang)*(ob.r+30),
                  hp:50,max:50,base:50,face:1,animT:0,atkT:99,hurtT:0,state:'chase',moving:true,evo:0,evoT:0 };
      const x0=e.x, y0=e.y;
      // 140 Schritte moveToward Richtung Ziel (mit Avoidance) + collide rausdrücken
      for (let k=0;k<140;k++){ moveToward(e, e.tx, e.ty, 60, 0.1, s, 13); collide(s, e, 13); }
      const passed = Math.hypot(e.x-e.tx, e.y-e.ty);
      const lateral = Math.abs((e.x-x0)*Math.sin(ang) - (e.y-y0)*Math.cos(ang)); // seitliche Auslenkung
      R.A3.startDistToGoal = Math.round(Math.hypot(x0-e.tx, y0-e.ty));
      R.A3.endDistToGoal = Math.round(passed);
      R.A3.lateralDeflection = Math.round(lateral);
      R.A3.movedAround = passed < 40; // hat er das Ziel ~erreicht (drumrum)?
    }
    return R;
  });

  console.log(JSON.stringify(out, null, 2));
  console.log('\nPAGE-ERRORS:', errs.length ? errs : 'keine');
  await browser.close();
})().catch(e => { console.error('VERIFY ERROR:', e.message); process.exit(1); });
