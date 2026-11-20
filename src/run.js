// Run state machine: rounds, shots, rewards, shop, victory, endless continuation.
// Every operation validates first, then mutates, then saves — so a reload never repeats a payout.
var AP = AP || {};

AP.Run = (function () {
  var C = AP.CFG, R = AP.Rng, P = AP.Physics;

  function mainRounds() { return C.actsMain * C.roundsPerAct; }

  // ---------- creation ----------
  function create(code, profile, dev) {
    code = R.normalizeCode(code) || R.newCode();
    var run = {
      v: AP.VERSION, code: code, seed: R.hash('run', code), dev: !!dev,
      pool: AP.Content.poolFor(profile, dev),
      deck: [], nextBallId: 1, artifacts: [], coins: C.economy.startCoins,
      roundIndex: 0, phase: 'aim', round: null, reward: null, shop: null,
      mainVictory: false, extraRounds: 0, totalScore: 0, bestShot: 0,
      earned: [], lastBreakdown: null, created: Date.now()
    };
    C.colors.forEach(function (col) {
      for (var i = 0; i < 3; i++) run.deck.push(newBall(run, { color: col }));
    });
    startRound(run);
    return run;
  }

  function newBall(run, p) {
    return { id: run.nextBallId++, color: p.color, material: p.material || 'normal', effect: p.effect || 'none', value: p.value || C.ballBaseValue };
  }

  // ---------- round structure ----------
  function bossFor(run, act) {
    var prev = act > 0 ? bossFor(run, act - 1) : null;
    var r = R.stream(run.seed, 'boss', act);
    var opts = (act === 0 ? C.firstActBosses : C.bossOrder).filter(function (b) { return b !== prev; });
    return opts[r.int(opts.length)];
  }

  function baseTarget(i) {
    var n = mainRounds();
    if (i < n) return C.targets[i];
    var t = C.targets[n - 1];
    for (var k = n; k <= i; k++) t = Math.ceil(t * C.endlessMult);
    return Math.min(t, C.maxScore);
  }

  function roundInfo(run, i) {
    var act = Math.floor(i / C.roundsPerAct), slot = i % C.roundsPerAct;
    var bossId = slot === 2 ? bossFor(run, act) : null;
    var b = bossId ? C.bosses[bossId] : null;
    var target = Math.min(C.maxScore, Math.ceil(baseTarget(i) * (b ? b.targetMult : 1)));
    return {
      index: i, act: act, slot: slot,
      kind: slot === 0 ? 'Обычный' : slot === 1 ? 'Усиленный' : 'Босс',
      target: target, bossId: bossId,
      shots: C.shotsPerRound + (b && b.shotsDelta ? b.shotsDelta : 0),
      endless: i >= mainRounds(),
      closedPocket: bossId === 'closed' ? R.stream(run.seed, 'closed', i).int(6) : null
    };
  }

  function startRound(run) {
    var info = roundInfo(run, run.roundIndex);
    run.round = {
      index: info.index, target: info.target, shotsMax: info.shots, shotsLeft: info.shots, score: 0,
      bossId: info.bossId, closedPocket: info.closedPocket, rack: 0, shotNo: 0,
      doublerUsed: false, nextCopyId: 1000, table: null, rerack: false
    };
    rack(run, false);
    run.phase = 'aim';
  }

  function rack(run, keepCue) {
    var rd = run.round;
    var lay = AP.Layouts.build(run.deck, run.seed, rd.index, rd.rack);
    var balls = run.deck.map(function (b) {
      var p = lay.pos[b.id];
      return { id: b.id, x: p.x, y: p.y, color: b.color, material: b.material, effect: b.effect, value: b.value, isCopy: false };
    });
    var cue = keepCue && rd.table ? rd.table.cue : null;
    rd.table = { balls: balls, cue: null, layout: lay.variant.id, family: lay.variant.family, cueHome: lay.cue };
    var w = world(run);
    var c = P.cue(w);
    var spot = null;
    if (cue && P.freeSpot(w, cue.x, cue.y, c, 6)) spot = cue;
    if (!spot) spot = P.nearestFree(w, lay.cue.x, lay.cue.y, c, 6) || lay.cue;
    rd.table.cue = { x: spot.x, y: spot.y };
  }

  function tableFor(run) { return P.makeTable(run.round.closedPocket); }

  // Physics world for the current table snapshot.
  function world(run) {
    var t = run.round.table;
    var balls = [P.makeBall({ id: 0, kind: 'cue', x: t.cue ? t.cue.x : t.cueHome.x, y: t.cue ? t.cue.y : t.cueHome.y })];
    t.balls.forEach(function (b) { balls.push(P.makeBall({ id: b.id, x: b.x, y: b.y, color: b.color, material: b.material, effect: b.effect, value: b.value, isCopy: b.isCopy, srcId: b.srcId })); });
    if (!t.cue) balls.shift();
    return P.newWorld(tableFor(run), balls);
  }

  function shiftColor(run) {
    var rd = run.round;
    if (rd.bossId !== 'shift') return null;
    var present = C.colors.filter(function (c) { return rd.table.balls.some(function (b) { return b.color === c; }); });
    if (!present.length) present = C.colors;
    return R.stream(run.seed, 'shift', rd.index, rd.shotNo).pick(present);
  }

  function bossCtx(run) {
    var id = run.round.bossId;
    return id ? { id: id, color: shiftColor(run) } : null;
  }

  // ---------- shots ----------
  function launch(run, angle, power) {
    if (run.phase !== 'aim' || run.round.shotsLeft <= 0) return null;
    save(run);                           // snapshot before the shot (§16.2)
    var w = world(run);
    var boss = bossCtx(run);
    run.round.shotsLeft--;
    run.phase = 'moving';
    var shot = AP.Rules.startShot({ world: w, artifacts: run.artifacts, round: run.round, boss: boss, nextCopyId: run.round.nextCopyId }, angle, power);
    shot.bossCtx = boss;
    return shot;
  }

  // After the shot has stopped. Returns a report for the UI.
  function resolve(run, shot, profile) {
    var rd = run.round, w = shot.world;
    var coins = AP.Rules.coinsFor(shot.pocketed, run.artifacts);
    run.coins += coins;
    var res = AP.Rules.score({ pocketed: shot.pocketed, artifacts: run.artifacts, coins: run.coins, boss: shot.bossCtx, power: shot.power, cuePocketed: shot.cuePocketed });
    res.coins = coins;
    rd.score = Math.min(C.maxScore, rd.score + res.total);
    run.totalScore = Math.min(C.maxScore, run.totalScore + res.total);
    run.bestShot = Math.max(run.bestShot, res.total);
    rd.shotNo++;
    rd.nextCopyId = shot.nextCopyId;

    // table snapshot from the world
    var balls = [];
    w.balls.forEach(function (b) {
      if (b.kind !== 'color' || !b.onTable) return;
      balls.push({ id: b.id, x: b.x, y: b.y, color: b.color, material: b.material, effect: b.effect, value: b.value, isCopy: b.isCopy, srcId: b.srcId });
    });
    rd.table.balls = balls;
    var c = P.cue(w);
    if (shot.cuePocketed || !c || !c.onTable) {
      var tmp = world(run); var tc = P.cue(tmp);
      var spot = P.nearestFree(tmp, rd.table.cueHome.x, rd.table.cueHome.y, tc, 4) || rd.table.cueHome;
      rd.table.cue = { x: spot.x, y: spot.y };
    } else rd.table.cue = { x: c.x, y: c.y };

    // achievements (§12.1)
    var ach = [];
    var pockets = {}; shot.pocketed.forEach(function (p) { pockets[p.pocket] = 1; });
    if (Object.keys(pockets).length >= 2) ach.push('twoPockets');
    var cols = {}; shot.pocketed.forEach(function (p) { cols[p.color] = 1; });
    if (cols.red && cols.blue && cols.yellow) ach.push('fullSpectrum');
    if (run.coins >= 10) ach.push('clubCash');
    if (!balls.length) ach.push('cleanCloth');
    var fresh = grant(run, profile, ach);
    if (profile && !run.dev) profile.records.bestShot = Math.max(profile.records.bestShot || 0, res.total);

    if (shot.emergency && AP.Store) AP.Store.saveDiag({ when: Date.now(), code: run.code, round: rd.index, shot: rd.shotNo, why: shot.emergency, v: AP.VERSION });

    var report = { result: res, coins: coins, achievements: fresh, emergency: shot.emergency, cuePocketed: shot.cuePocketed, won: false, lost: false, rerack: false };
    run.lastBreakdown = { lines: res.lines, total: res.total, coins: coins, journal: AP.Rules.journal(res) };

    // end-of-shot order (§6.3): score → win → shots left → re-rack
    if (rd.score >= rd.target) {
      report.won = true;
      if (!run.mainVictory && rd.index === mainRounds() - 1) {
        run.mainVictory = true;
        run.phase = 'victory';
        if (profile && !run.dev) profile.records.wins = (profile.records.wins || 0) + 1;
        report.mainVictory = true;
      } else {
        if (rd.index >= mainRounds()) run.extraRounds = rd.index - mainRounds() + 1;
        enterReward(run, profile);
        (run.rewardAch || []).forEach(function (a) { fresh.push(a); });
      }
    } else if (rd.shotsLeft <= 0) {
      report.lost = true;
      run.phase = 'lost';
      if (profile && !run.dev && run.mainVictory) profile.records.bestExtraRounds = Math.max(profile.records.bestExtraRounds || 0, run.extraRounds);
    } else {
      if (!balls.length) { rd.rack++; rack(run, true); report.rerack = true; }
      run.phase = 'aim';
    }
    if (profile && !run.dev) AP.Store.saveProfile(profile);
    save(run);
    return report;
  }

  function grant(run, profile, ids) {
    var fresh = [];
    ids.forEach(function (id) {
      if (run.earned.indexOf(id) < 0) run.earned.push(id);
      if (!profile || run.dev) return;
      if (!profile.achievements[id]) { profile.achievements[id] = new Date().toISOString(); fresh.push(id); }
    });
    return fresh;
  }

  // ---------- rewards ----------
  function enterReward(run, profile) {
    var rd = run.round;
    var bonus = Math.min(C.economy.maxShotBonus, rd.shotsLeft * C.economy.perShotLeft);
    run.coins += C.economy.winCoins + bonus;
    run.reward = {
      forRound: rd.index, money: C.economy.winCoins, bonus: bonus,
      options: genReward(run), boss: !!rd.bossId
    };
    run.phase = 'reward';
    run.rewardAch = run.coins >= 10 ? grant(run, profile, ['clubCash']) : [];
  }

  function opt(kind, props) { var o = { kind: kind }; for (var k in props) o[k] = props[k]; return o; }

  function validOption(run, o) {
    var deck = run.deck;
    switch (o.kind) {
      case 'artifact': return run.pool.artifacts.indexOf(o.art) >= 0 && run.artifacts.indexOf(o.art) < 0;
      case 'effect': return deck.some(function (b) { return b.effect !== o.effect; });
      case 'material': return run.pool.materials.indexOf(o.material) >= 0 && deck.some(function (b) { return b.material !== o.material; });
      case 'recolor': return deck.some(function (b) { return b.color !== o.color; });
      case 'value': return deck.length > 0;
      case 'newBall': return deck.length < C.deck.max;
      case 'coins': return true;
    }
    return false;
  }

  function ballTargetOk(run, o, b) {
    if (!b) return 'нет шара';
    if (o.kind === 'effect' && b.effect === o.effect) return 'уже ' + C.effects[o.effect].name;
    if (o.kind === 'material' && b.material === o.material) return 'уже ' + C.materials[o.material].name;
    if (o.kind === 'recolor' && b.color === o.color) return 'уже ' + C.colorNames[o.color];
    return null;
  }

  function needsBall(o) { return o.kind === 'effect' || o.kind === 'material' || o.kind === 'recolor' || o.kind === 'value'; }

  function randomBallProps(r, run, fixed) {
    var p = { color: r.pick(C.colors), material: 'normal', effect: 'none' };
    for (var k in fixed) p[k] = fixed[k];
    return p;
  }

  function genReward(run) {
    var r = R.stream(run.seed, 'reward', run.round.index);
    var physics = [
      opt('artifact', { art: 'shockwave' }), opt('artifact', { art: 'doubler' }),
      opt('effect', { effect: 'explosive' }), opt('effect', { effect: 'explosive' }),
      opt('newBall', { ball: randomBallProps(r, run, { effect: 'explosive' }) })
    ];
    var score = [
      opt('artifact', { art: 'echo' }), opt('artifact', { art: 'bumper' }), opt('artifact', { art: 'cascade' }),
      opt('artifact', { art: 'prism' }), opt('artifact', { art: 'sniper' }), opt('artifact', { art: 'railmaster' }),
      opt('artifact', { art: 'carom' }), opt('artifact', { art: 'softhand' }), opt('artifact', { art: 'ram' }),
      opt('artifact', { art: 'daredevil' }), opt('recolor', { color: r.pick(C.colors) }),
      opt('value', { amount: C.economy.valueUp }), opt('material', { material: 'crystal' }),
      opt('newBall', { ball: randomBallProps(r, run, {}) })
    ];
    // first reward: the score card is always a path that boosts plain single pots, so a new player has one
    if (run.round.index === 0) score = [opt('artifact', { art: 'sniper' }), opt('artifact', { art: 'softhand' })];
    var econ = [
      opt('coins', { amount: C.economy.fallbackCoins }), opt('material', { material: 'gold' }),
      opt('artifact', { art: 'goldvein' }), opt('artifact', { art: 'capital' }),
      opt('newBall', { ball: randomBallProps(r, run, { material: 'gold' }) })
    ];
    var out = [];
    [['physics', physics], ['score', score], ['econ', econ]].forEach(function (pair) {
      var valid = pair[1].filter(function (o) {
        return validOption(run, o) && !out.some(function (x) { return x.kind === 'artifact' && o.kind === 'artifact' && x.art === o.art; });
      });
      var o = valid.length ? r.pick(valid) : opt('coins', { amount: C.economy.fallbackCoins, fallback: true });
      o.cat = pair[0];
      out.push(o);
    });
    return out;
  }

  // Apply an option. args: { ballId, replace (artifact id) }. Returns error text or null.
  function applyOption(run, o, args) {
    args = args || {};
    if (!validOption(run, o)) return 'вариант недоступен';
    var b = null;
    if (needsBall(o)) {
      b = run.deck.filter(function (x) { return x.id === args.ballId; })[0];
      var why = ballTargetOk(run, o, b);
      if (why) return why;
    }
    if (o.kind === 'artifact' && run.artifacts.length >= C.artifactSlots) {
      if (!args.replace || run.artifacts.indexOf(args.replace) < 0) return 'слоты заняты — выберите, что заменить';
    }
    // validated — mutate
    switch (o.kind) {
      case 'artifact':
        if (run.artifacts.length >= C.artifactSlots) run.artifacts.splice(run.artifacts.indexOf(args.replace), 1);
        run.artifacts.push(o.art); break;
      case 'effect': b.effect = o.effect; break;
      case 'material': b.material = o.material; break;
      case 'recolor': b.color = o.color; break;
      case 'value': b.value += o.amount; break;
      case 'newBall': run.deck.push(newBall(run, o.ball)); break;
      case 'coins': run.coins += o.amount; break;
    }
    return null;
  }

  function chooseReward(run, index, args, profile) {
    if (run.phase !== 'reward' || !run.reward) return 'нет награды';
    var o = run.reward.options[index];
    if (!o) return 'нет варианта';
    var err = applyOption(run, o, args);
    if (err) return err;
    var wasBoss = run.reward.boss;
    run.reward = null;
    var ach = run.coins >= 10 ? grant(run, profile, ['clubCash']) : [];
    if (profile && !run.dev && ach.length) AP.Store.saveProfile(profile);
    if (wasBoss) enterShop(run); else nextRound(run);
    save(run);
    return null;
  }

  function nextRound(run) {
    run.roundIndex++;
    startRound(run);
  }

  // ---------- shop ----------
  function enterShop(run) {
    run.shop = { refreshCount: 0, refreshPrice: C.economy.prices.refresh, offers: [] };
    run.shop.offers = genShop(run);
    run.phase = 'shop';
  }

  function genShop(run) {
    var pr = C.economy.prices;
    var r = R.stream(run.seed, 'shop', run.round.index, run.shop.refreshCount);
    var offers = [];
    var arts = run.pool.artifacts.filter(function (a) { return run.artifacts.indexOf(a) < 0; });
    if (arts.length) offers.push(opt('artifact', { art: r.pick(arts), price: pr.artifact }));
    var ballOpts = [
      opt('newBall', { ball: randomBallProps(r, run, { effect: r() < 0.5 ? 'explosive' : 'none', material: r.pick(run.pool.materials) }), price: pr.ball }),
      opt('effect', { effect: 'explosive', price: pr.mod }),
      opt('material', { material: r.pick(run.pool.materials.filter(function (m) { return m !== 'normal'; })), price: pr.mod }),
      opt('recolor', { color: r.pick(C.colors), price: pr.mod }),
      opt('value', { amount: C.economy.valueUp, price: pr.mod })
    ].filter(function (o) { return validOption(run, o); });
    if (ballOpts.length) offers.push(r.pick(ballOpts));
    return offers;
  }

  function shopBuy(run, index, args, profile) {
    if (run.phase !== 'shop') return 'магазин закрыт';
    var o = run.shop.offers[index];
    if (!o || o.sold) return 'нет предложения';
    if (run.coins < o.price) return 'не хватает монет';
    var err = applyOption(run, o, args);
    if (err) return err;
    run.coins -= o.price;
    o.sold = true;
    save(run);
    return null;
  }

  function shopSell(run, art) {
    if (run.phase !== 'shop') return 'магазин закрыт';
    var i = run.artifacts.indexOf(art);
    if (i < 0) return 'нет артефакта';
    run.artifacts.splice(i, 1);
    run.coins += C.economy.prices.sell;
    save(run);
    return null;
  }

  function shopRemove(run, ballId) {
    if (run.phase !== 'shop') return 'магазин закрыт';
    if (run.deck.length <= C.deck.min) return 'в наборе минимум ' + C.deck.min + ' шаров';
    if (run.coins < C.economy.prices.remove) return 'не хватает монет';
    var i = run.deck.findIndex(function (b) { return b.id === ballId; });
    if (i < 0) return 'нет шара';
    run.deck.splice(i, 1);
    run.coins -= C.economy.prices.remove;
    save(run);
    return null;
  }

  function shopRefresh(run) {
    if (run.phase !== 'shop') return 'магазин закрыт';
    if (run.coins < run.shop.refreshPrice) return 'не хватает монет';
    run.coins -= run.shop.refreshPrice;
    run.shop.refreshCount++;
    run.shop.refreshPrice += C.economy.prices.refreshStep;
    run.shop.offers = genShop(run);
    save(run);
    return null;
  }

  function shopLeave(run) {
    if (run.phase !== 'shop') return 'магазин закрыт';
    run.shop = null;
    nextRound(run);
    save(run);
    return null;
  }

  // ---------- victory ----------
  function victoryContinue(run, profile) {
    if (run.phase !== 'victory') return 'нет победы';
    run.continued = true;
    enterReward(run, profile);
    save(run);
    return null;
  }
  function victoryFinish(run) {
    if (run.phase !== 'victory') return 'нет победы';
    run.phase = 'finished';
    save(run);
    return null;
  }

  // last ball of a base colour about to disappear?
  function lastOfColor(run, ballId) {
    var b = run.deck.filter(function (x) { return x.id === ballId; })[0];
    if (!b) return false;
    return run.deck.filter(function (x) { return x.color === b.color; }).length === 1;
  }

  function save(run) { if (AP.Store) AP.Store.saveRun(run); }

  function load() {
    var r = AP.Store.loadRun();
    if (!r || r.v !== AP.VERSION || !r.round) return null;
    if (r.phase === 'moving') r.phase = 'aim';   // should not happen: we never save while moving
    return r;
  }

  return {
    create: create, roundInfo: roundInfo, mainRounds: mainRounds, bossFor: bossFor, baseTarget: baseTarget,
    world: world, launch: launch, resolve: resolve, shiftColor: shiftColor, bossCtx: bossCtx,
    chooseReward: chooseReward, validOption: validOption, ballTargetOk: ballTargetOk, needsBall: needsBall,
    shopBuy: shopBuy, shopSell: shopSell, shopRemove: shopRemove, shopRefresh: shopRefresh, shopLeave: shopLeave,
    victoryContinue: victoryContinue, victoryFinish: victoryFinish, lastOfColor: lastOfColor,
    save: save, load: load, genReward: genReward
  };
})();
