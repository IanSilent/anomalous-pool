// Shot resolution (§13.1): physics step → physical pocket events → copies and waves →
// coins → per-ball value → best colour combo + tricks → total. Display-free.
var AP = AP || {};

AP.Rules = (function () {
  var C = AP.CFG, P = AP.Physics;

  function has(arts, id) { return arts.indexOf(id) >= 0; }

  // ctx: { world, artifacts:[ids], round:{doublerUsed}, boss:{id,color}|null, nextCopyId }
  function startShot(ctx, angle, power) {
    var w = ctx.world;
    P.resetShotFlags(w);
    var c = P.cue(w);
    var sp = C.power[power];
    c.vx = Math.cos(angle) * sp; c.vy = Math.sin(angle) * sp;
    return {
      world: w, artifacts: ctx.artifacts.slice(), round: ctx.round, boss: ctx.boss,
      nextCopyId: ctx.nextCopyId, startTime: w.time,
      power: power, pocketed: [], cuePocketed: false, seq: 0, effects: [], sounds: [],
      effectCount: 0, emergency: null, done: false, log: []
    };
  }

  function wave(shot, x, y, source, ballId) {
    var w = shot.world, R = C.wave.radius;
    shot.effectCount++;
    shot.effects.push({ type: 'wave', x: x, y: y, t: w.time, source: source });
    shot.sounds.push({ type: 'boom' });
    shot.log.push({ kind: 'wave', source: source, ballId: ballId });
    for (var i = 0; i < w.balls.length; i++) {
      var b = w.balls[i];
      if (!b.onTable) continue;
      var dx = b.x - x, dy = b.y - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= R) continue;
      var nx = 1, ny = 0;
      if (d > 0.001) { nx = dx / d; ny = dy / d; }
      var dv = C.wave.impulse * (C.wave.edge + (1 - C.wave.edge) * (1 - d / R));
      b.vx += nx * dv; b.vy += ny * dv;
    }
  }

  function spawnCopy(shot, src, x, y) {
    var w = shot.world;
    shot.effectCount++;
    // aim a little inward from the pocket entry so the copy lands on the cloth
    var tx = x + (w.table.w / 2 - x) * 0.08, ty = y + (w.table.h / 2 - y) * 0.15;
    var spot = P.nearestFree(w, tx, ty, null, 2);
    if (!spot) {
      shot.effects.push({ type: 'note', text: 'Удвоитель: нет свободного места', t: w.time });
      shot.log.push({ kind: 'copyFail', ballId: src.id });
      return null;
    }
    var b = P.makeBall({
      id: shot.nextCopyId++, kind: 'color', x: spot.x, y: spot.y,
      color: src.color, material: src.material, effect: src.effect, value: src.value,
      isCopy: true, srcId: src.isCopy ? src.srcId : src.id
    });
    w.balls.push(b);
    shot.effects.push({ type: 'copy', x: spot.x, y: spot.y, t: w.time, ballId: b.id });
    shot.sounds.push({ type: 'copy' });
    shot.log.push({ kind: 'copy', ballId: src.id, copyId: b.id });
    return b;
  }

  function onPocket(shot, ev) {
    var b = ev.ball, w = shot.world;
    shot.effects.push({ type: 'pocket', x: ev.x, y: ev.y, pocket: ev.pocket.id, t: w.time, kind: b.kind, color: b.color, material: b.material });
    shot.sounds.push({ type: 'pocket' });
    if (b.kind === 'cue') { shot.cuePocketed = true; return; }
    shot.seq++;
    var rec = {
      seq: shot.seq, id: b.id, color: b.color, material: b.material, effect: b.effect, value: b.value,
      isCopy: b.isCopy, pocket: ev.pocket.id, x: ev.x, y: ev.y, rail: b.rail, chain: b.chain, time: w.time
    };
    shot.pocketed.push(rec);
    var first = shot.seq === 1;
    // order (§13.1 p.3–4): copy first, then the ball's own wave, then the artifact wave
    if (has(shot.artifacts, 'doubler') && !shot.round.doublerUsed) {
      shot.round.doublerUsed = true;
      spawnCopy(shot, b, ev.x, ev.y);
    }
    if (b.effect === 'explosive') wave(shot, ev.x, ev.y, 'explosive', b.id);
    if (first && has(shot.artifacts, 'shockwave')) wave(shot, ev.x, ev.y, 'shockwave', b.id);
  }

  function emergencyStop(shot, why) {
    shot.emergency = why;
    shot.world.balls.forEach(function (b) { b.vx = 0; b.vy = 0; });
    shot.effects.push({ type: 'note', text: 'Аварийный предел цепочки: ' + why, t: shot.world.time });
  }

  function shotStep(shot) {
    if (shot.done) return null;
    var ev = P.step(shot.world, C.table.dt);
    if (ev.pockets.length) {
      ev.pockets.sort(function (a, b) { return a.ball.id - b.ball.id; });
      for (var i = 0; i < ev.pockets.length; i++) onPocket(shot, ev.pockets[i]);
    }
    for (var h = 0; h < ev.hits.length; h++) {
      if (ev.hits[h].speed > 40) shot.sounds.push({ type: 'clack', speed: ev.hits[h].speed });
    }
    for (var r = 0; r < ev.rails.length; r++) {
      if (ev.rails[r].speed > 60) shot.sounds.push({ type: 'rail', speed: ev.rails[r].speed });
    }
    if (shot.effectCount > C.limits.maxEffects) emergencyStop(shot, 'больше ' + C.limits.maxEffects + ' эффектов');
    else if (shot.world.time - shot.startTime > C.limits.maxShotTime) emergencyStop(shot, 'движение дольше ' + C.limits.maxShotTime + ' с');
    if (!P.moving(shot.world)) shot.done = true;
    return ev;
  }

  // Run a whole shot headlessly.
  function runShot(shot) {
    var guard = 0;
    while (!shot.done && guard++ < 1e6) shotStep(shot);
    return shot;
  }

  function coinsFor(pocketed, artifacts) {
    var coins = 0;
    pocketed.forEach(function (p) {
      coins += C.materials[p.material].coins;
      if (p.material === 'gold' && has(artifacts, 'goldvein')) coins += C.art.goldVeinCoins;
    });
    return coins;
  }

  function bestCombo(colors) {
    var counts = { red: 0, blue: 0, yellow: 0 }, n = 0;
    colors.forEach(function (c) { counts[c]++; n++; });
    var max = Math.max(counts.red, counts.blue, counts.yellow);
    var ok = {
      triple: max >= 3, spectrum: counts.red > 0 && counts.blue > 0 && counts.yellow > 0,
      pair: max >= 2, single: n >= 1
    };
    var best = null;
    C.comboOrder.forEach(function (k) {
      if (!ok[k]) return;
      if (!best || C.combos[k].mult > C.combos[best].mult) best = k;
    });
    return best;
  }

  // input: { pocketed, artifacts, coins (after this shot's coins), boss:{id,color}|null, power, cuePocketed }
  function score(input) {
    var arts = input.artifacts, boss = input.boss;
    var cueBonus = input.cuePocketed && has(arts, 'daredevil');
    var lines = [], excluded = [];
    var scored = input.pocketed.filter(function (p) {
      if (boss && boss.id === 'rails' && !p.rail) { excluded.push(p); return false; }
      return true;
    });
    if (!scored.length && !cueBonus) {
      if (excluded.length) lines.push({ kind: 'note', text: 'Без касания борта: ' + excluded.length + ' шар(ов) не в счёте' });
      return { total: 0, sum: 0, mult: 0, prod: 1, combo: null, lines: lines, scored: [], tricks: [] };
    }
    var sum = 0;
    scored.forEach(function (p) {
      var mat = C.materials[p.material].mult;
      var v = p.value * mat;
      var parts = [];
      if (mat !== 1) parts.push(C.materials[p.material].name + ' ×' + mat);
      if (boss && boss.id === 'shift' && p.color === boss.color) { v *= 2; parts.push('приоритет ×2'); }
      if (has(arts, 'cascade') && p.seq > 1) {
        var cb = C.art.cascadeStep * (p.seq - 1);
        v += cb; parts.push('Каскад +' + cb);
      }
      p.personal = v;
      sum += v;
      lines.push({ kind: 'value', ballColor: p.color, amt: v,
        text: C.colorNamesF[p.color] + (p.isCopy ? ' (копия)' : '') + ' шар +' + v + (parts.length ? ' (' + parts.join(', ') + ')' : '') });
      if (has(arts, 'echo') && p.color === C.art.echoColor) {
        sum += v;
        lines.push({ kind: 'value', amt: v, echo: true, text: '→ Эхо +' + v });
      }
    });
    if (excluded.length) lines.push({ kind: 'note', text: 'Без касания борта: ' + excluded.length + ' шар(ов) не в счёте' });
    if (cueBonus) {
      sum += C.art.daredevilValue;
      lines.push({ kind: 'value', amt: C.art.daredevilValue, text: 'Биток в лузе +' + C.art.daredevilValue + ' (Дерзкий биток)' });
    }

    var colors = scored.map(function (p) { return p.color; });
    var combo = bestCombo(colors), prismNote = null;
    if (combo && has(arts, 'prism')) {
      for (var i = 0; i < scored.length; i++) {
        for (var c = 0; c < C.colors.length; c++) {
          if (C.colors[c] === scored[i].color) continue;
          var alt = colors.slice(); alt[i] = C.colors[c];
          var k = bestCombo(alt);
          if (C.combos[k].mult > C.combos[combo].mult) {
            combo = k;
            prismNote = 'Призма: ' + C.colorNames[scored[i].color] + ' шар считается как ' + C.colorNames[C.colors[c]];
          }
        }
      }
    }
    var mult = combo ? C.combos[combo].mult : 1;
    lines.push({ kind: 'mult', amt: mult, text: combo ? C.combos[combo].name + ' ×' + mult + (prismNote ? ' — ' + prismNote : '') : 'Только биток ×1' });

    var tricks = [];
    if (scored.some(function (p) { return p.rail; })) tricks.push('rail');
    if (scored.some(function (p) { return p.chain; })) tricks.push('chain');
    var pk = {}; scored.forEach(function (p) { pk[p.pocket] = 1; });
    if (Object.keys(pk).length >= 2) tricks.push('pockets');
    tricks.forEach(function (t) {
      mult += C.tricks[t].bonus;
      lines.push({ kind: 'mult', amt: C.tricks[t].bonus, text: C.tricks[t].name + ' +' + C.tricks[t].bonus });
    });
    function bonus(id, cond, amt, label) {
      if (!has(arts, id) || !cond) return;
      mult += amt;
      lines.push({ kind: 'mult', amt: amt, text: AP.Content.artifacts[id].name + ' +' + amt + (label ? ' (' + label + ')' : '') });
    }
    bonus('sniper', scored.length === 1, C.art.sniperBonus, 'ровно один шар');
    bonus('railmaster', tricks.indexOf('rail') >= 0, C.art.railmasterBonus, 'Дуплет');
    bonus('carom', tricks.indexOf('chain') >= 0, C.art.caromBonus, 'Цепочка');
    bonus('softhand', input.power === 'weak', C.art.softBonus, 'слабый удар');
    bonus('daredevil', cueBonus, C.art.daredevilMult, 'биток в лузе');
    if (has(arts, 'bumper')) {
      var nr = scored.filter(function (p) { return p.rail; }).length;
      if (nr) {
        mult += nr * C.art.bumperPerBall;
        lines.push({ kind: 'mult', amt: nr * C.art.bumperPerBall, text: 'Отбойник +' + nr * C.art.bumperPerBall + ' (' + nr + ' шар. после борта)' });
      }
    }
    if (has(arts, 'capital')) {
      var cap = Math.min(C.art.capitalMax, Math.floor(input.coins / C.art.capitalPer));
      if (cap) { mult += cap; lines.push({ kind: 'mult', amt: cap, text: 'Капитал +' + cap + ' (' + input.coins + ' монет)' }); }
    }
    var prod = 1;
    if (has(arts, 'ram') && input.power === 'strong') {
      prod *= C.art.ramProd;
      lines.push({ kind: 'mult', amt: C.art.ramProd, text: 'Таран ×' + String(C.art.ramProd).replace('.', ',') + ' к итогу (сильный удар)' });
    }
    var raw = sum * mult * prod;
    var total = Math.floor(raw);
    if (!isFinite(total) || total > C.maxScore) total = C.maxScore;
    lines.push({ kind: 'total', amt: total, text: sum + ' × ' + mult + (prod !== 1 ? ' × ' + prod : '') + ' = ' + total });
    return { total: total, sum: sum, mult: mult, prod: prod, combo: combo, lines: lines, scored: scored, tricks: tricks };
  }

  // Short one-line journal: "Красный шар +10 → Эхо +10 → Пара ×3"
  function journal(res) {
    return res.lines.filter(function (l) { return l.kind !== 'total'; }).map(function (l) {
      return l.text.replace(/^→ /, '');
    }).join(' → ');
  }

  return {
    startShot: startShot, shotStep: shotStep, runShot: runShot,
    coinsFor: coinsFor, score: score, bestCombo: bestCombo, journal: journal, wave: wave
  };
})();
