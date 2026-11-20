// Headless checks with the real simulation and rules. Usage:
//   node tools/check.js            all checks + a short bot sample
//   node tools/check.js --bot 20   bot playthroughs only (N runs)
var fs = require('fs'), path = require('path'), vm = require('vm');

var args = process.argv.slice(2);
var BOT_ONLY = args.indexOf('--bot') >= 0;
var BOT_RUNS = parseInt(args[args.indexOf('--bot') + 1], 10) || 6;

var ctx = { console: console, Math: Math, Date: Date, JSON: JSON, Object: Object };
vm.createContext(ctx);
['config', 'rng', 'physics', 'layouts', 'content', 'rules', 'profile', 'run'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
});
var AP = vm.runInContext('AP', ctx);
var C = AP.CFG, P = AP.Physics, Rules = AP.Rules, Run = AP.Run;

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function section(s) { console.log('\n' + s); }

function rec(p) {
  return Object.assign({ seq: 1, id: 1, color: 'red', material: 'normal', effect: 'none', value: 10, isCopy: false, pocket: 0, rail: false, chain: false }, p);
}

function scoringChecks() {
  section('Scoring (§7)');
  var r = Rules.score({ pocketed: [rec({ id: 1, rail: true }), rec({ id: 2, seq: 2 })], artifacts: [], coins: 0, boss: null });
  ok(r.total === 80, 'two red, one after rail: (10+10)×(3+1)=80', r.total);
  r = Rules.score({ pocketed: [rec({ id: 1, rail: true }), rec({ id: 2, seq: 2 })], artifacts: ['echo'], coins: 0, boss: null });
  ok(r.total === 160, 'same with Echo = 160', r.total);
  r = Rules.score({ pocketed: [rec({ id: 1 })], artifacts: [], coins: 0, boss: null });
  ok(r.total === 10, 'single ball = 10', r.total);
  r = Rules.score({ pocketed: [], artifacts: ['echo', 'capital'], coins: 30, boss: null });
  ok(r.total === 0, 'nothing pocketed = 0 even with items', r.total);
  r = Rules.score({ pocketed: [rec({ id: 1, color: 'red' }), rec({ id: 2, seq: 2, color: 'blue', pocket: 0 }), rec({ id: 3, seq: 3, color: 'yellow', pocket: 0 })], artifacts: [], coins: 0, boss: null });
  ok(r.combo === 'spectrum' && r.total === 120, 'spectrum ×4: 30×4=120', [r.combo, r.total]);
  r = Rules.score({ pocketed: [rec({ id: 1 }), rec({ id: 2, seq: 2 }), rec({ id: 3, seq: 3 })], artifacts: [], coins: 0, boss: null });
  ok(r.combo === 'triple' && r.total === 150, 'triple ×5', [r.combo, r.total]);
  r = Rules.score({ pocketed: [rec({ id: 1, material: 'crystal' })], artifacts: [], coins: 0, boss: null });
  ok(r.total === 20, 'crystal doubles own value', r.total);
  // Cascade + Echo: 2nd red gets +5, Echo repeats the resulting value
  r = Rules.score({ pocketed: [rec({ id: 1 }), rec({ id: 2, seq: 2 })], artifacts: ['cascade', 'echo'], coins: 0, boss: null });
  ok(r.sum === (10 + 10 + 15 + 15) && r.total === 150, 'Cascade+Echo: (10+10+15+15)×3=150', [r.sum, r.total]);
  // Prism: red + blue → pair by recolouring one ball
  r = Rules.score({ pocketed: [rec({ id: 1, color: 'red' }), rec({ id: 2, seq: 2, color: 'blue' })], artifacts: ['prism'], coins: 0, boss: null });
  ok(r.combo === 'pair' && r.total === 60, 'Prism builds a pair from red+blue', [r.combo, r.total]);
  r = Rules.score({ pocketed: [rec({ id: 1, color: 'red' }), rec({ id: 2, seq: 2, color: 'red' }), rec({ id: 3, seq: 3, color: 'blue' })], artifacts: ['prism'], coins: 0, boss: null });
  ok(r.combo === 'triple', 'Prism: red,red,blue → triple (one ball only)', r.combo);
  r = Rules.score({ pocketed: [rec({ id: 1, color: 'red' }), rec({ id: 2, seq: 2, color: 'blue' })], artifacts: ['prism', 'echo'], coins: 0, boss: null });
  ok(r.sum === 30, 'Echo looks at the real colour under Prism', r.sum);
  // Capital uses coins already credited this shot
  var pk = [rec({ id: 1, material: 'gold' })];
  var coins = Rules.coinsFor(pk, ['goldvein']);
  ok(coins === 2, 'gold ball + Gold vein = 2 coins', coins);
  r = Rules.score({ pocketed: pk, artifacts: ['capital'], coins: 3 + coins, boss: null });
  ok(r.mult === 2, 'Capital sees the 5 coins incl. this shot', r.mult);
  // Echo doesn't duplicate coins
  ok(Rules.coinsFor([rec({ material: 'gold', effect: 'explosive' })], ['echo']) === 1, 'Echo does not repeat coins');
  // Bumper: per ball after rail
  r = Rules.score({ pocketed: [rec({ id: 1, rail: true }), rec({ id: 2, seq: 2, rail: true, color: 'blue', pocket: 2 })], artifacts: ['bumper'], coins: 0, boss: null });
  ok(r.mult === 1 + 1 + 1 + 2, 'single + rail + pockets + bumper 2 = 5', r.mult);
  // Boss rails: only rail balls score
  r = Rules.score({ pocketed: [rec({ id: 1, rail: true }), rec({ id: 2, seq: 2 })], artifacts: [], coins: 0, boss: { id: 'rails' } });
  ok(r.total === 20, 'rail boss: only the rail ball counts (10×(1+1))', r.total);
  r = Rules.score({ pocketed: [rec({ id: 1, color: 'blue' })], artifacts: [], coins: 0, boss: { id: 'shift', color: 'blue' } });
  ok(r.total === 20, 'priority colour ×2 value', r.total);

  section('Build-path artifacts');
  r = Rules.score({ pocketed: [rec({ id: 1 })], artifacts: ['sniper'], coins: 0, boss: null });
  ok(r.total === 10 * (1 + C.art.sniperBonus), 'Снайпер: one ball 10×(1+3)=40', r.total);
  r = Rules.score({ pocketed: [rec({ id: 1 }), rec({ id: 2, seq: 2 })], artifacts: ['sniper'], coins: 0, boss: null });
  ok(r.total === 60, 'Снайпер: no bonus for two balls', r.total);
  r = Rules.score({ pocketed: [rec({ id: 1, rail: true })], artifacts: ['railmaster', 'bumper'], coins: 0, boss: null });
  ok(r.mult === 1 + 1 + C.art.railmasterBonus + 1, 'Мастер борта stacks with Дуплет and Отбойник', r.mult);
  r = Rules.score({ pocketed: [rec({ id: 1, chain: true })], artifacts: ['carom'], coins: 0, boss: null });
  ok(r.mult === 1 + 1 + C.art.caromBonus, 'Карамболь adds to Цепочка', r.mult);
  r = Rules.score({ pocketed: [rec({ id: 1 })], artifacts: ['softhand'], coins: 0, boss: null, power: 'weak' });
  ok(r.mult === 1 + C.art.softBonus, 'Мягкая рука on a weak shot', r.mult);
  r = Rules.score({ pocketed: [rec({ id: 1 })], artifacts: ['softhand'], coins: 0, boss: null, power: 'medium' });
  ok(r.mult === 1, 'Мягкая рука: nothing on a medium shot', r.mult);
  r = Rules.score({ pocketed: [rec({ id: 1 }), rec({ id: 2, seq: 2 })], artifacts: ['ram'], coins: 0, boss: null, power: 'strong' });
  ok(r.total === Math.floor(60 * C.art.ramProd), 'Таран ×1.5 on a strong shot, rounded down', r.total);
  r = Rules.score({ pocketed: [], artifacts: ['daredevil'], coins: 0, boss: null, cuePocketed: true });
  ok(r.total === C.art.daredevilValue * (1 + C.art.daredevilMult), 'Дерзкий биток: cue alone scores 15×3', r.total);
  r = Rules.score({ pocketed: [rec({ id: 1 })], artifacts: ['daredevil'], coins: 0, boss: null, cuePocketed: true });
  ok(r.total === (10 + C.art.daredevilValue) * (1 + C.art.daredevilMult), 'Дерзкий биток with a coloured ball', r.total);
  r = Rules.score({ pocketed: [], artifacts: [], coins: 0, boss: null, cuePocketed: true });
  ok(r.total === 0, 'without the artifact a scratch is still 0', r.total);
}

function emptyWorld(balls, closed) {
  return P.newWorld(P.makeTable(closed), balls.map(function (b) { return P.makeBall(b); }));
}
function simShot(w, angle, speed, artifacts, round) {
  var shot = Rules.startShot({ world: w, artifacts: artifacts || [], round: round || { doublerUsed: false }, boss: null, nextCopyId: 1000 }, angle, 'medium');
  var c = P.cue(w); c.vx = Math.cos(angle) * speed; c.vy = Math.sin(angle) * speed;
  Rules.runShot(shot);
  return shot;
}

function physicsChecks() {
  section('Physics (§6.1, §16.2)');
  // straight pot into the top-right corner
  var w = emptyWorld([{ id: 0, kind: 'cue', x: 700, y: 300 }, { id: 1, x: 850, y: 150, color: 'red', value: 10 }]);
  var ang = Math.atan2(150 - 300, 850 - 700);
  var s = simShot(w, ang, C.power.medium);
  ok(s.pocketed.length === 1 && s.pocketed[0].pocket === 2, 'straight pot into top-right corner', s.pocketed.map(function (p) { return p.pocket; }));
  // rail bank sets rail flag
  w = emptyWorld([{ id: 0, kind: 'cue', x: 300, y: 250 }, { id: 1, x: 500, y: 250, color: 'red', value: 10 }]);
  s = simShot(w, -Math.PI / 2, C.power.strong);
  var c = P.cue(w);
  ok(c.onTable && c.x > 0 && c.y > 0 && c.y < 500, 'cue banks off a rail and stays on the table', [c.x, c.y]);
  // no tunnelling: strong random shots, every ball ends on the table or in a pocket, inside bounds
  var bad = 0, maxT = 0;
  for (var i = 0; i < 60; i++) {
    var lay = AP.Layouts.build([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (id) { return { id: id }; }), 777, 1 + i, 0);
    var balls = [{ id: 0, kind: 'cue', x: lay.cue.x, y: lay.cue.y }];
    Object.keys(lay.pos).forEach(function (id) { balls.push({ id: +id, x: lay.pos[id].x, y: lay.pos[id].y, color: 'red', value: 10, effect: i % 3 === 0 ? 'explosive' : 'none' }); });
    w = emptyWorld(balls);
    s = simShot(w, i * 0.37, C.power.strong, i % 2 ? ['shockwave', 'doubler'] : []);
    maxT = Math.max(maxT, w.time);
    w.balls.forEach(function (b) {
      if (b.onTable && (b.x < 0 || b.y < 0 || b.x > 1000 || b.y > 500)) bad++;
    });
    if (s.emergency) bad++;
  }
  ok(bad === 0, '60 strong shots with explosions: nothing escapes, no emergency stop', bad);
  ok(maxT < 30, 'every shot settles (longest ' + maxT.toFixed(1) + ' s)', maxT);
  // cue scratch is reported
  w = emptyWorld([{ id: 0, kind: 'cue', x: 900, y: 100 }, { id: 1, x: 500, y: 400, color: 'red', value: 10 }]);
  s = simShot(w, Math.atan2(-104, 104), C.power.medium);
  ok(s.cuePocketed, 'cue ball into a pocket is detected');
  // closed pocket acts as a rail
  w = emptyWorld([{ id: 0, kind: 'cue', x: 700, y: 300 }, { id: 1, x: 850, y: 150, color: 'red', value: 10 }], 2);
  s = simShot(w, Math.atan2(-150, 150), C.power.medium);
  ok(!s.pocketed.some(function (p) { return p.pocket === 2; }), 'closed pocket never takes a ball');

  section('Prediction matches the shot (§6.2, §15 p.2)');
  var mism = 0, contacts = 0;
  for (i = 0; i < 40; i++) {
    lay = AP.Layouts.build([1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (id) { return { id: id }; }), 99, i, 0);
    balls = [{ id: 0, kind: 'cue', x: lay.cue.x, y: lay.cue.y }];
    Object.keys(lay.pos).forEach(function (id) { balls.push({ id: +id, x: lay.pos[id].x, y: lay.pos[id].y, color: 'blue', value: 10 }); });
    w = emptyWorld(balls);
    var a = (i * 0.61) % (Math.PI * 2);
    var pr = P.predict(w, a, C.power.medium);
    // real run, record first cue contact
    var real = P.cloneWorld(w); var rc = P.cue(real); P.resetShotFlags(real);
    rc.vx = Math.cos(a) * C.power.medium; rc.vy = Math.sin(a) * C.power.medium;
    var first = null;
    for (var n = 0; n < 20000 && !first; n++) {
      var ev = P.step(real, C.table.dt);
      ev.hits.forEach(function (h) { if (!first && (h.a === rc || h.b === rc)) first = { x: rc.x, y: rc.y, id: (h.a === rc ? h.b : h.a).id }; });
      if (!P.moving(real)) break;
    }
    if (pr.contact) {
      contacts++;
      if (!first || Math.abs(first.x - pr.contact.x) > 0.5 || first.id !== pr.contact.ballId) mism++;
    } else if (pr.end === 'stop' && first) mism++;   // 'bounces' ends the drawn part early by design
  }
  ok(mism === 0, 'predicted first contact equals the real one (' + contacts + '/40 with contact)', mism);
}

function chainChecks() {
  section('Effects and order (§13)');
  // explosive ball pocketed → wave pushes neighbours
  var w = emptyWorld([
    { id: 0, kind: 'cue', x: 700, y: 300 }, { id: 1, x: 850, y: 150, color: 'red', value: 10, effect: 'explosive', material: 'gold' },
    { id: 2, x: 900, y: 60, color: 'blue', value: 10 }]);
  var s = simShot(w, Math.atan2(-150, 150), C.power.medium);
  var waves = s.log.filter(function (l) { return l.kind === 'wave'; });
  ok(waves.length >= 1 && waves[0].source === 'explosive', 'explosive ball makes a wave on pocketing', waves);
  var b2 = w.balls.filter(function (b) { return b.id === 2; })[0];
  ok(!b2.onTable || Math.abs(b2.x - 900) + Math.abs(b2.y - 60) > 5, 'neighbour was pushed by the wave');
  // shockwave + explosive = two impulses, shown separately
  w = emptyWorld([{ id: 0, kind: 'cue', x: 700, y: 300 }, { id: 1, x: 850, y: 150, color: 'red', value: 10, effect: 'explosive' }]);
  s = simShot(w, Math.atan2(-150, 150), C.power.medium, ['shockwave']);
  waves = s.log.filter(function (l) { return l.kind === 'wave'; });
  ok(waves.length === 2 && waves[0].source === 'explosive' && waves[1].source === 'shockwave', 'explosive + Shockwave = two separate waves', waves.map(function (x) { return x.source; }));
  // Doubler: copy of a gold explosive ball keeps its layers, once per round
  var round = { doublerUsed: false };
  w = emptyWorld([{ id: 0, kind: 'cue', x: 700, y: 300 }, { id: 1, x: 850, y: 150, color: 'red', value: 15, effect: 'explosive', material: 'gold' }]);
  s = simShot(w, Math.atan2(-150, 150), C.power.medium, ['doubler'], round);
  var copy = w.balls.filter(function (b) { return b.isCopy; })[0];
  ok(copy && copy.color === 'red' && copy.material === 'gold' && copy.effect === 'explosive' && copy.value === 15, 'Doubler copy inherits colour/material/effect/value', copy && [copy.color, copy.material, copy.effect, copy.value]);
  ok(round.doublerUsed, 'Doubler marked used for the round');
  var order = s.log.map(function (l) { return l.kind; });
  ok(order.indexOf('copy') >= 0 && order.indexOf('copy') < order.indexOf('wave'), 'copy is created before the wave (§13.1 p.3–4)', order);
  // pot the copy (rebuilt at a known spot): coin and explosion again, Doubler does not fire twice
  if (copy) {
    var cc = P.makeBall({ id: copy.id, x: 850, y: 150, color: copy.color, material: copy.material, effect: copy.effect, value: copy.value, isCopy: true, srcId: copy.srcId });
    var w2 = P.newWorld(w.table, [P.makeBall({ id: 0, kind: 'cue', x: 700, y: 300 }), cc]);
    var s2 = simShot(w2, Math.atan2(-150, 150), C.power.medium, ['doubler'], round);
    var gotCopy = s2.pocketed.filter(function (p) { return p.isCopy; })[0];
    ok(!!gotCopy, 'the copy can be pocketed like any ball');
    ok(Rules.coinsFor(s2.pocketed, []) === 1, 'pocketed copy pays its gold coin');
    ok(s2.log.some(function (l) { return l.kind === 'wave'; }), 'pocketed copy explodes');
    ok(!s2.log.some(function (l) { return l.kind === 'copy'; }), 'Doubler does not fire a second time in the round');
  }
  // determinism: same shot twice → identical result
  function snapshot() {
    var lay = AP.Layouts.build([1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (id) { return { id: id }; }), 5, 3, 0);
    var balls = [{ id: 0, kind: 'cue', x: lay.cue.x, y: lay.cue.y }];
    Object.keys(lay.pos).forEach(function (id) { balls.push({ id: +id, x: lay.pos[id].x, y: lay.pos[id].y, color: C.colors[id % 3], value: 10, effect: id % 2 ? 'explosive' : 'none' }); });
    var w = emptyWorld(balls);
    var s = simShot(w, 0.3, C.power.strong, ['shockwave', 'doubler', 'cascade']);
    return JSON.stringify(w.balls.map(function (b) { return [b.id, b.onTable, b.x.toFixed(6), b.y.toFixed(6)]; })) + JSON.stringify(s.pocketed.map(function (p) { return [p.id, p.seq, p.pocket]; }));
  }
  ok(snapshot() === snapshot(), 'identical input → identical physics and event order');
}

function layoutChecks() {
  section('Layouts (§6.6, §15 p.12)');
  var problems = [];
  AP.Layouts.variants.forEach(function (v) {
    for (var i = 0; i < v.slots.length; i++) for (var j = i + 1; j < v.slots.length; j++) {
      var d = Math.hypot(v.slots[i][0] - v.slots[j][0], v.slots[i][1] - v.slots[j][1]);
      if (d < 2 * C.table.ballR + 8) problems.push(v.id + ' slots ' + i + '/' + j + ' d=' + d.toFixed(1));
    }
  });
  for (var size = C.deck.min; size <= C.deck.max; size++) {
    for (var seed = 0; seed < 40; seed++) {
      var ids = []; for (var k = 1; k <= size; k++) ids.push({ id: k });
      AP.Layouts.variants.forEach(function (v) {
        var lay = AP.Layouts.build(ids, seed, 1, seed, v);
        var balls = [P.makeBall({ id: 0, kind: 'cue', x: lay.cue.x, y: lay.cue.y })];
        Object.keys(lay.pos).forEach(function (id) { balls.push(P.makeBall({ id: +id, x: lay.pos[id].x, y: lay.pos[id].y, color: 'red' })); });
        var w = P.newWorld(P.makeTable(null), balls);
        balls.forEach(function (b) { if (!P.freeSpot(w, b.x, b.y, b, b.kind === 'cue' ? 20 : 1)) problems.push(v.id + ' size ' + size + ' ball ' + b.id + ' blocked'); });
      });
    }
  }
  ok(problems.length === 0, 'all variants × sizes 6–12 × mirrors: no overlaps, no balls in pockets, cue clear', problems.slice(0, 5));

  // direct pots from the start position, measured with the real simulation
  function directPots(variant, closed, seed) {
    var ids = []; for (var k = 1; k <= 9; k++) ids.push({ id: k });
    var lay = AP.Layouts.build(ids, seed || 1, seed ? 1 : 0, 0, variant);
    var balls = [P.makeBall({ id: 0, kind: 'cue', x: lay.cue.x, y: lay.cue.y })];
    Object.keys(lay.pos).forEach(function (id) { balls.push(P.makeBall({ id: +id, x: lay.pos[id].x, y: lay.pos[id].y, color: 'red', value: 10 })); });
    var w0 = P.newWorld(P.makeTable(closed), balls), found = {};
    candidateAngles(w0).forEach(function (a) {
      C.powerOrder.forEach(function (pw) {
        var w = P.cloneWorld(w0);
        var s = Rules.startShot({ world: w, artifacts: [], round: { doublerUsed: false }, boss: null, nextCopyId: 1000 }, a, pw);
        Rules.runShot(s);
        s.pocketed.forEach(function (p) { found[p.id] = 1; });
      });
    });
    return Object.keys(found).length;
  }
  var dp = directPots(AP.Layouts.variants[0], null, 0);
  ok(dp >= 2, 'first table: ' + dp + ' different balls can be pocketed with one shot', dp);
  var worst = 99, worstName = '';
  AP.Layouts.variants.forEach(function (v) {
    for (var cp = 0; cp < 6; cp++) {
      var n = directPots(v, cp, 3);
      if (n < worst) { worst = n; worstName = v.id + ' closed ' + cp; }
    }
  });
  ok(worst >= 2, 'with any pocket closed every variant keeps ≥2 pottable balls (worst ' + worst + ', ' + worstName + ')', worst);
}

// Aim candidates: ghost-ball aims for each ball × pocket, plus a fan of angles.
function candidateAngles(w) {
  var c = P.cue(w), out = [];
  w.balls.forEach(function (b) {
    if (b.kind !== 'color' || !b.onTable) return;
    w.table.pockets.forEach(function (p) {
      if (p.closed) return;
      var dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
      var gx = b.x + dx / d * 2 * C.table.ballR, gy = b.y + dy / d * 2 * C.table.ballR;
      out.push(Math.atan2(gy - c.y, gx - c.x));
    });
    out.push(Math.atan2(b.y - c.y, b.x - c.x));
  });
  for (var i = 0; i < 24; i++) out.push(i / 24 * Math.PI * 2);
  return out;
}

var BOT_PREF = ['shockwave', 'cascade', 'sniper', 'echo', 'bumper', 'railmaster', 'carom', 'capital', 'ram', 'softhand', 'prism', 'doubler', 'daredevil', 'goldvein'];
function botPick(run, options) {
  var best = 0, bestV = -1;
  options.forEach(function (o, i) {
    var v = 1;
    if (o.kind === 'artifact') v = 20 - BOT_PREF.indexOf(o.art);
    else if (o.kind === 'recolor') v = o.color === 'red' && run.artifacts.indexOf('echo') >= 0 ? 15 : 3;
    else if (o.kind === 'material') v = o.material === 'crystal' ? 9 : 5;
    else if (o.kind === 'value') v = 8;
    else if (o.kind === 'effect') v = 7;
    else if (o.kind === 'newBall') v = 4;
    if (o.kind === 'artifact' && run.artifacts.length >= C.artifactSlots) v = 0;
    if (v > bestV) { bestV = v; best = i; }
  });
  return best;
}

// A novice reads the cards and takes what helps the way they already play: single pots at medium power.
var NOVICE_PREF = ['sniper', 'softhand', 'shockwave', 'echo', 'capital', 'bumper', 'railmaster', 'carom', 'cascade'];
function novicePick(run, options) {
  for (var k = 0; k < NOVICE_PREF.length; k++) {
    var i = options.findIndex(function (o) { return o.kind === 'artifact' && o.art === NOVICE_PREF[k]; });
    if (i >= 0 && run.artifacts.length < C.artifactSlots) return i;
  }
  var v = options.findIndex(function (o) { return o.kind === 'value' || o.kind === 'effect' || (o.kind === 'material' && o.material === 'crystal'); });
  return v >= 0 ? v : 0;
}

// Greedy bot: evaluates every candidate shot with the real simulation and takes the best score.
function botRun(code, opts) {
  opts = opts || {};
  var profile = AP.Store.defaultProfile();
  var run = Run.create(code, profile, !!opts.dev);
  var shots = 0, log = [], guard = 0, choices = [];
  while (guard++ < 400) {
    if (run.phase === 'aim' && opts.novice) {
      // novice with aim assist: picks a random potting aim at medium power, never plans combos
      var npw = run.artifacts.indexOf('softhand') >= 0 ? 'weak' : 'medium';
      var wn = Run.world(run), cn = P.cue(wn), snaps = [], nr = AP.Rng.stream('novice', opts.seedTag || code, shots);
      wn.balls.forEach(function (b) {
        if (b.kind !== 'color') return;
        wn.table.pockets.forEach(function (p) {
          if (p.closed) return;
          var dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
          var a0 = Math.atan2(b.y + dy / d * 26 - cn.y, b.x + dx / d * 26 - cn.x);
          var pr = P.predict(wn, a0, C.power[npw]), tp = pr && pr.targetPath;
          if (pr && pr.contact && pr.contact.ballId === b.id && tp && tp[tp.length - 1].pocket) snaps.push(a0);
        });
      });
      var na = snaps.length ? nr.pick(snaps) : nr() * Math.PI * 2;
      var nshot = Run.launch(run, na, npw);
      Rules.runShot(nshot);
      var nrep = Run.resolve(run, nshot, profile);
      shots++; log.push(nrep.result.total);
    } else if (run.phase === 'aim') {
      var w0 = Run.world(run), best = null;
      candidateAngles(w0).forEach(function (a) {
        C.powerOrder.forEach(function (pw) {
          // robust value: worst of three slightly different aims (a human is never exact)
          var val = Infinity;
          [-0.003, 0, 0.003].forEach(function (da) {
            var trial = JSON.parse(JSON.stringify(run));
            var shot = Run.launch(trial, a + da, pw);
            Rules.runShot(shot);
            var coins = Rules.coinsFor(shot.pocketed, trial.artifacts);
            var sc = Rules.score({ pocketed: shot.pocketed, artifacts: trial.artifacts, coins: trial.coins + coins, boss: shot.bossCtx, power: shot.power, cuePocketed: shot.cuePocketed }).total;
            val = Math.min(val, sc + (shot.cuePocketed && trial.artifacts.indexOf('daredevil') < 0 ? -3 : 0));
          });
          if (!best || val > best.val) best = { a: a, pw: pw, val: val };
        });
      });
      var aim = opts.noise ? best.a + (Math.random() - 0.5) * opts.noise : best.a;
      var shot = Run.launch(run, aim, best.pw);
      Rules.runShot(shot);
      var rep = Run.resolve(run, shot, profile);
      shots++;
      log.push(rep.result.total);
      if (opts.verbose) console.log('   r' + run.round.index + ' shot ' + run.round.shotNo + ': +' + rep.result.total + '  [' + rep.result.lines.map(function (l) { return l.text; }).join(' | ') + ']');
    } else if (run.phase === 'reward') {
      var opts3 = run.reward.options, pick = opts.pick ? opts.pick(run, opts3) : opts.novice ? novicePick(run, opts3) : botPick(run, opts3);
      var o = opts3[pick], a2 = {};
      if (Run.needsBall(o)) a2.ballId = run.deck.filter(function (b) { return !Run.ballTargetOk(run, o, b); })[0].id;
      if (o.kind === 'artifact' && run.artifacts.length >= C.artifactSlots) a2.replace = run.artifacts[0];
      choices.push(o.kind + ':' + (o.art || o.effect || o.material || o.color || o.amount || ''));
      var err = Run.chooseReward(run, pick, a2, profile);
      if (err) return { error: 'reward: ' + err, run: run };
    } else if (run.phase === 'shop') {
      run.shop.offers.forEach(function (of, i) {
        if (of.sold || run.coins < of.price) return;
        var a3 = {};
        if (Run.needsBall(of)) { var t = run.deck.filter(function (b) { return !Run.ballTargetOk(run, of, b); })[0]; if (!t) return; a3.ballId = t.id; }
        if (of.kind === 'artifact' && run.artifacts.length >= C.artifactSlots) a3.replace = run.artifacts[0];
        Run.shopBuy(run, i, a3, profile);
      });
      Run.shopLeave(run);
    } else if (run.phase === 'victory') {
      if (opts.continueRounds) Run.victoryContinue(run, profile); else break;
    } else break;
    if (opts.continueRounds && run.round.index >= Run.mainRounds() + opts.continueRounds) break;
  }
  return { run: run, shots: shots, log: log, choices: choices, profile: profile };
}

function runChecks() {
  section('Run flow (§10, §16.3)');
  var profile = AP.Store.defaultProfile();
  var run = Run.create('TEST01', profile, false);
  ok(run.deck.length === 9 && run.deck.every(function (b) { return b.material === 'normal' && b.effect === 'none' && b.value === 10; }), 'start: 9 plain balls, no artifacts');
  ok(run.round.target === C.targets[0] && run.round.shotsLeft === 5, 'round 1: first target, 5 shots');
  ok(Run.roundInfo(run, 2).bossId && Run.roundInfo(run, 5).bossId && Run.roundInfo(run, 2).bossId !== Run.roundInfo(run, 5).bossId, 'two different bosses, known in advance');
  ok(Run.baseTarget(6) === Math.ceil(C.targets[5] * 1.8) && Run.baseTarget(7) === Math.ceil(Math.ceil(C.targets[5] * 1.8) * 1.8), 'endless targets ×1.8 rounded up');
  // first reward always has a standalone physical option
  var physOk = 0;
  for (var i = 0; i < 50; i++) {
    var r = Run.create('PHYS' + i, profile, false);
    r.round.score = 40; r.phase = 'aim';
    // fake a win through the regular path
    var w = Run.world(r); var shot = Run.launch(r, 0, 'weak'); Rules.runShot(shot);
    r.round.score = 1000; var rep = Run.resolve(r, shot, profile);
    var o = r.reward.options[0];
    if (r.phase === 'reward' && o.cat === 'physics' && (o.kind === 'effect' || o.art === 'shockwave' || o.art === 'doubler' || o.kind === 'newBall')) physOk++;
  }
  ok(physOk === 50, 'first reward: 50/50 have a working physical anomaly', physOk);

  // money is paid once: reload on the reward screen
  var r2 = Run.create('MONEY1', profile, false);
  var s2 = Run.launch(r2, 0, 'weak'); Rules.runShot(s2); r2.round.score = 999; Run.resolve(r2, s2, profile);
  var coins = r2.coins;
  var loaded = Run.load();
  ok(loaded && loaded.phase === 'reward' && loaded.coins === coins, 'reload on reward screen: same coins, same offers', [loaded && loaded.coins, coins]);
  ok(JSON.stringify(loaded.reward.options) === JSON.stringify(r2.reward.options), 'offers survive a reload unchanged');

  // reload while moving returns to the pre-shot state
  var r3 = Run.create('MOVE01', profile, false);
  var before = JSON.stringify(r3.round);
  var s3 = Run.launch(r3, 0.2, 'strong');
  var mid = Run.load();
  ok(JSON.stringify(mid.round) === before && mid.phase === 'aim', 'reload during movement → state before the shot');

  // ball pick cancelled → no money spent; removal down to the limit; refresh price grows
  var r4 = Run.create('SHOP01', profile, false);
  r4.phase = 'shop'; r4.coins = 30; r4.shop = { refreshCount: 0, refreshPrice: 2, offers: [{ kind: 'effect', effect: 'explosive', price: 3 }] };
  var err = Run.shopBuy(r4, 0, {}, profile);
  ok(err && r4.coins === 30, 'buy without choosing a ball: refused, coins untouched', [err, r4.coins]);
  ok(!Run.shopBuy(r4, 0, { ballId: r4.deck[0].id }, profile) && r4.coins === 27 && r4.deck[0].effect === 'explosive', 'buy with a ball: applied once');
  var removed = 0;
  while (!Run.shopRemove(r4, r4.deck[r4.deck.length - 1].id)) removed++;
  ok(r4.deck.length === C.deck.min && removed === 3, 'removal stops at ' + C.deck.min + ' balls', [r4.deck.length, removed]);
  var p0 = r4.shop.refreshPrice; Run.shopRefresh(r4);
  ok(r4.shop.refreshPrice === p0 + 1, 'refresh price grows by 1');

  // reward with full slots requires a replacement choice
  var r5 = Run.create('SLOT01', profile, false);
  r5.artifacts = ['echo', 'bumper', 'cascade', 'capital', 'prism'];
  r5.phase = 'reward'; r5.reward = { options: [{ kind: 'artifact', art: 'shockwave' }, { kind: 'coins', amount: 5 }], boss: false };
  r5.pool.artifacts.push('prism');
  ok(Run.chooseReward(r5, 0, {}, profile) && r5.artifacts.length === 5, 'full slots: artifact refused without a replacement');
  ok(!Run.chooseReward(r5, 0, { replace: 'echo' }, profile) && r5.artifacts.indexOf('shockwave') >= 0 && r5.artifacts.indexOf('echo') < 0, 'replacement swaps the artifact');

  // unlocking: achievements join the pool only for the next run
  var prof = AP.Store.defaultProfile();
  var r6 = Run.create('UNLK01', prof, false);
  prof.achievements.twoPockets = 'x';
  ok(r6.pool.artifacts.indexOf('doubler') < 0, 'unlocked content does not change the current pool');
  ok(Run.create('UNLK02', prof, false).pool.artifacts.indexOf('doubler') >= 0, '…and appears in the next run');
  ok(AP.Content.poolFor(AP.Store.defaultProfile(), true).artifacts.length === AP.Content.artifactOrder.length, 'dev mode: all ' + AP.Content.artifactOrder.length + ' artifacts');
}

function botChecks(n) {
  section('Bot playthroughs (greedy, perfect aim — an upper bound, not human balance)');
  var wins = 0, reached = [], t0 = Date.now(), errors = 0, det = true;
  for (var i = 0; i < n; i++) {
    var code = 'BOT' + i;
    var res = botRun(code, { noise: 0.002 });
    if (res.error) { errors++; console.log('   ' + code + ' ERROR ' + res.error); }
    var won = res.run.mainVictory;
    if (won) wins++;
    reached.push(res.run.round.index + 1);
    console.log('   ' + code + ': ' + (won ? 'WIN ' : 'lost') + ' at round ' + (res.run.round.index + 1) + ', shots ' + res.shots + ', best shot ' + res.run.bestShot + ', artifacts [' + res.run.artifacts.join(',') + ']');
  }
  ok(errors === 0, 'no dead ends in reward/shop screens');
  console.log('   bot: ' + wins + '/' + n + ' main wins, rounds reached ' + reached.join(' ') + ' (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  var nw = 0, nreached = [];
  for (var j = 0; j < n * 2; j++) {
    var nres = botRun('NOV' + j, { novice: true });
    if (nres.run.mainVictory) nw++;
    nreached.push(nres.run.round.index + 1);
  }
  console.log('   novice bot (random assisted pot, medium power or weak with Мягкая рука, no planning): ' + nw + '/' + (n * 2) + ' main wins, rounds reached ' + nreached.join(' '));
  // determinism of a whole run with the same choices
  var a = botRun('DET01', {}), b = botRun('DET01', {});
  det = JSON.stringify(a.log) === JSON.stringify(b.log) && JSON.stringify(a.choices) === JSON.stringify(b.choices);
  ok(det, 'same code + same actions → same scores and offers', [a.log.slice(0, 8), b.log.slice(0, 8)]);
  // continue after victory, lose there, victory stays
  var c = botRun('CONT01', { dev: false, continueRounds: 30 });
  if (c.run.mainVictory) ok(c.run.mainVictory && (c.run.phase === 'lost' || c.run.round.index >= 6), 'endless: main victory kept after continuing (extra rounds ' + c.run.extraRounds + ', phase ' + c.run.phase + ')');
  else console.log('   (CONT01 did not win the main run — endless check skipped)');
}

if (!BOT_ONLY) {
  scoringChecks();
  physicsChecks();
  chainChecks();
  layoutChecks();
  runChecks();
  botChecks(3);
} else botChecks(BOT_RUNS);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
