// Glue: input, the fixed-step loop, the score count-up and screen flow.
var AP = AP || {};

(function () {
  var C = AP.CFG, P = AP.Physics, Run = AP.Run, UI = AP.UI, Snd = AP.Audio;
  var canvas = document.getElementById('cv'), ctx = canvas.getContext('2d');

  var G = {
    profile: AP.Store.loadProfile(), saved: null, run: null, world: null, shot: null,
    aim: { angle: null, locked: false, power: 'medium', pred: null },
    hoverBall: null, fx: [], fxIdx: 0, sndIdx: 0, shake: 0, fast: false, now: 0,
    bd: null, displayScore: null, canvasTip: false, mouse: null
  };
  AP.game = { G: G };

  Snd.setEnabled(G.profile.settings.sound);

  // ---------- helpers ----------
  function saveProfile() { if (!G.run || !G.run.dev) AP.Store.saveProfile(G.profile); else AP.Store.saveProfile(G.profile); }
  function has(a) { return G.run && G.run.artifacts.indexOf(a) >= 0; }
  function anomalyLevel() {
    if (!G.run) return 0.3;
    var i = G.run.round.index, act = Math.floor(i / C.roundsPerAct), slot = i % C.roundsPerAct;
    return Math.min(3, act + slot * 0.25 + 0.3);
  }

  // Aim assist: potting aims for the current table and power, verified with the real prediction.
  function computeSnaps() {
    G.snaps = [];
    G.snapKey = null;
    if (!G.profile.settings.assist || !G.run || G.run.phase !== 'aim' || G.shot || !G.world) return;
    var c = P.cue(G.world), sp = C.power[G.aim.power], R2 = 2 * C.table.ballR;
    if (!c) return;
    G.world.balls.forEach(function (b) {
      if (b.kind !== 'color' || !b.onTable) return;
      G.world.table.pockets.forEach(function (p) {
        if (p.closed) return;
        var dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
        var a0 = Math.atan2(b.y + dy / d * R2 - c.y, b.x + dx / d * R2 - c.x);
        var tries = [0, 0.0025, -0.0025, 0.005, -0.005];
        for (var i = 0; i < tries.length; i++) {
          var pr = P.predict(G.world, a0 + tries[i], sp);
          var tp = pr && pr.targetPath;
          if (pr && pr.contact && pr.contact.ballId === b.id && tp && tp[tp.length - 1].pocket) {
            G.snaps.push({ angle: a0 + tries[i], ballId: b.id });
            break;
          }
        }
      });
    });
  }
  function snapAngle(a) {
    if (!G.profile.settings.assist || !G.snaps || !G.snaps.length) return a;
    var lim = C.assist.snapDeg * Math.PI / 180, best = null, bd = lim;
    G.snaps.forEach(function (s) {
      var d = Math.abs(Math.atan2(Math.sin(a - s.angle), Math.cos(a - s.angle)));
      if (d < bd) { bd = d; best = s; }
    });
    return best ? best.angle : a;
  }
  function snapsFresh() {
    var key = G.run && G.world ? G.run.round.index + ':' + G.run.round.shotNo + ':' + G.run.round.rack + ':' + G.aim.power + ':' + G.run.phase + ':' + G.profile.settings.assist : null;
    if (key !== G.snapKey) { computeSnaps(); G.snapKey = key; }
  }

  function refreshPrediction() {
    if (!G.run || G.run.phase !== 'aim' || G.shot || G.aim.angle == null || !G.world) { G.aim.pred = null; return; }
    G.aim.pred = P.predict(G.world, G.aim.angle, C.power[G.aim.power]);
  }

  function chainHint() {
    if (!G.world) return false;
    var explosive = G.world.balls.some(function (b) { return b.onTable && b.effect === 'explosive'; });
    return explosive || has('shockwave') || (has('doubler') && !G.run.round.doublerUsed);
  }

  function hintOnce(key, text) {
    if (!G.profile.settings.hints || G.profile.seenHints[key]) return;
    G.hintKey = key;
    UI.hint(text);
  }
  function closeHint() {
    if (G.hintKey) { G.profile.seenHints[G.hintKey] = 1; saveProfile(); G.hintKey = null; }
    UI.hint(null);
  }

  // ---------- screens ----------
  function toMenu() {
    G.saved = Run.load();
    if (G.saved && (G.saved.phase === 'lost' || G.saved.phase === 'finished')) G.saved = null;
    G.run = null; G.shot = null; G.world = null; G.bd = null;
    UI.hint(null);
    UI.menu(G);
  }

  function startRun(code) {
    var run = Run.create(code, G.profile, G.profile.settings.dev);
    if (!run.dev) { G.profile.records.runs = (G.profile.records.runs || 0) + 1; saveProfile(); }
    Run.save(run);
    enterRun(run);
  }

  function enterRun(run) {
    G.run = run; G.shot = null; G.bd = null; G.displayScore = null; G.fx = [];
    G.aim.angle = null; G.aim.locked = false;
    G.world = Run.world(run); G.snapKey = null;
    UI.closeOverlay();
    UI.buildSide();
    UI.renderSide(G);
    if (run.lastBreakdown) { UI.logClear(); run.lastBreakdown.lines.forEach(UI.logLine); }
    showPhase();
  }

  function showPhase() {
    var run = G.run;
    UI.renderSide(G);
    switch (run.phase) {
      case 'aim':
        UI.closeOverlay();
        if (run.round.index === 0 && run.round.shotNo === 0)
          hintOnce('aim2', 'Веди мышью по столу: когда шар пойдёт в лузу, прицел притянется и появится «в лузу». Кликни, чтобы зафиксировать, выбери силу (1 / 2 / 3) и нажми «Удар» (пробел).');
        break;
      case 'reward': UI.hint(null); UI.reward(G); break;
      case 'shop': UI.shop(G); break;
      case 'victory': UI.victory(G); break;
      case 'lost': case 'finished': UI.result(G); break;
    }
    refreshPrediction();
  }

  // ---------- shooting ----------
  function strike() {
    var run = G.run;
    if (!run || run.phase !== 'aim' || G.shot || !G.aim.locked || UI.isOverlay()) return;
    if (G.bd) finishBreakdown();
    Snd.resume();
    closeHint();
    var shot = Run.launch(run, G.aim.angle, G.aim.power);
    if (!shot) return;
    G.shot = shot; G.world = shot.world; G.fxIdx = 0; G.sndIdx = 0;
    G.aim.locked = false; G.aim.pred = null;
    Snd.play('cue', { weak: 0.5, medium: 0.8, strong: 1.1 }[G.aim.power]);
    UI.logClear('Шары в движении…');
    UI.renderSide(G);
  }

  function consumeShotEvents() {
    var sh = G.shot;
    for (; G.fxIdx < sh.effects.length; G.fxIdx++) {
      var e = sh.effects[G.fxIdx];
      var f = { type: e.type, x: e.x, y: e.y, at: G.now, source: e.source, color: e.color };
      if (e.type === 'note') { UI.toast(UI.esc(e.text), 'info'); continue; }
      G.fx.push(f);
      if (e.type === 'wave') { G.shake = Math.max(G.shake, 10); if (e.source === 'shockwave') UI.flashArt('shockwave'); }
      if (e.type === 'copy') UI.flashArt('doubler');
      if (e.type === 'pocket' && e.kind === 'color' && e.material === 'gold') {
        var n = C.materials.gold.coins + (has('goldvein') ? C.art.goldVeinCoins : 0);
        G.fx.push({ type: 'text', x: e.x, y: e.y, at: G.now, text: '+' + n + ' ¤' });
        Snd.play('coin');
      }
      if (e.type === 'pocket' && e.kind === 'cue') G.fx.push({ type: 'text', x: e.x, y: e.y, at: G.now, text: has('daredevil') ? 'дерзко!' : 'биток!', color: has('daredevil') ? '#8fe07a' : '#ff9a8f' });
    }
    for (; G.sndIdx < sh.sounds.length; G.sndIdx++) {
      var s = sh.sounds[G.sndIdx];
      Snd.play(s.type, s.speed);
    }
  }

  function finishShot() {
    var run = G.run, sh = G.shot;
    var before = run.round.score;
    var rep = Run.resolve(run, sh, G.profile);
    G.shot = null;
    G.world = Run.world(run); G.snapKey = null;
    G.displayScore = before;
    var lines = rep.result.lines.slice();
    if (!lines.length) lines.push({ kind: 'note', text: 'Ничего не забито — 0 очков' });
    if (rep.coins) lines.push({ kind: 'coin', text: '+' + rep.coins + ' ¤ за золотые шары' });
    if (rep.cuePocketed) lines.push({ kind: has('daredevil') ? 'note' : 'warn', text: 'Биток в лузе — возвращён в стартовую зону' });
    if (rep.emergency) lines.push({ kind: 'warn', text: 'Аварийный предел: ' + rep.emergency });
    G.bd = { lines: lines, i: 0, t: 0, rep: rep, totalShown: false };
    UI.logClear();
    toastAchievements(rep.achievements);
    if (rep.rerack) { UI.toast('Стол очищен — набор расставлен заново.', 'info'); Snd.play('rack'); G.fx.push({ type: 'text', x: C.table.w / 2, y: C.table.h / 2, at: G.now + 0.3, text: 'новая расстановка', color: '#bff4ff' }); }
    UI.renderSide(G);
  }

  function stepBreakdown(dt) {
    var bd = G.bd;
    bd.t += dt * (G.fast ? C.anim.fastMult : 1);
    while (bd.i < bd.lines.length && bd.t >= C.anim.lineDelay) {
      bd.t -= C.anim.lineDelay;
      showLine(bd.lines[bd.i++]);
    }
    if (bd.i >= bd.lines.length && bd.t > 0.6) finishBreakdown();
  }
  function showLine(l) {
    UI.logLine(l);
    if (l.kind === 'value') Snd.play('tick', G.bd.i);
    else if (l.kind === 'mult') Snd.play('mult', G.bd.i);
    else if (l.kind === 'total') {
      Snd.play('total');
      G.displayScore = null;
      G.bd.totalShown = true;
      if (l.amt > 0) G.fx.push({ type: 'text', x: C.table.w / 2, y: C.table.h / 2 - 20, at: G.now, text: '+' + UI.fmt(l.amt), size: 40, color: '#ffe8bf' });
      UI.renderSide(G);
    }
  }
  function finishBreakdown() {
    var bd = G.bd;
    if (!bd) return;
    while (bd.i < bd.lines.length) { var l = bd.lines[bd.i++]; UI.logLine(l); }
    G.bd = null; G.displayScore = null;
    UI.renderSide(G);
    var run = G.run;
    if (bd.rep.result.total > 0 && run.phase === 'aim')
      hintOnce('score', 'Очки удара = сумма ценности забитых шаров × (лучшее цветовое сочетание + все трюки). Разбивка — справа, в «Последнем ударе».');
    if (run.phase === 'reward' || run.phase === 'victory') Snd.play('win');
    if (run.phase === 'lost') Snd.play('lose');
    showPhase();
  }

  // ---------- options: rewards and shop ----------
  function optionFlow(o, apply) {
    var run = G.run;
    if (Run.needsBall(o)) {
      var title = { effect: 'Какой шар сделать взрывным?', material: 'Какому шару дать материал?', recolor: 'Какой шар перекрасить?', value: 'Какому шару добавить ценность?' }[o.kind];
      UI.pickBall(G, {
        title: title, deck: run.deck,
        check: function (b) { return Run.ballTargetOk(run, o, b); },
        after: function (b) {
          var n = { color: b.color, material: b.material, effect: b.effect };
          if (o.kind === 'effect') n.effect = o.effect;
          if (o.kind === 'material') n.material = o.material;
          if (o.kind === 'recolor') n.color = o.color;
          return AP.Content.ballLabel(n) + ' · ' + (b.value + (o.kind === 'value' ? o.amount : 0));
        },
        warn: function (b) { return o.kind === 'recolor' && Run.lastOfColor(run, b.id) ? 'Это последний ' + C.colorNames[b.color] + ' шар в наборе: без него Спектр станет недоступен.' : null; },
        confirm: o.price ? 'Купить за ¤ ' + o.price : 'Выбрать',
        onConfirm: function (id) { apply({ ballId: id }); }
      });
    } else if (o.kind === 'artifact' && run.artifacts.length >= C.artifactSlots) {
      UI.pickArtifact(G, { newArt: o.art, list: run.artifacts, onConfirm: function (id) { apply({ replace: id }); } });
    } else apply({});
  }

  function toastAchievements(ids) {
    ids.forEach(function (id) {
      var a = AP.Content.achievements[id];
      UI.toast('🏆 <b>' + a.name + '</b><br>' + UI.esc(a.cond) + '<br>Откроется в следующих забегах: ' + UI.unlockText(id));
      Snd.play('ach');
    });
  }
  function achKeys() { return Object.keys(G.profile.achievements); }
  function newSince(before) { return achKeys().filter(function (k) { return before.indexOf(k) < 0; }); }

  function chooseReward(i) {
    var run = G.run, o = run.reward.options[i];
    optionFlow(o, function (args) {
      var before = achKeys();
      var err = Run.chooseReward(run, i, args, G.profile);
      if (err) { UI.toast(UI.esc(err), 'info'); return; }
      toastAchievements(newSince(before));
      Snd.play('click');
      afterBuild(o);
    });
  }
  function afterBuild(o) {
    var run = G.run;
    G.world = Run.world(run); G.snapKey = null;
    G.aim.angle = null; G.aim.locked = false;
    UI.buildSide();
    UI.renderSide(G);
    if (run.lastBreakdown) UI.logClear('Новый раунд: цель ' + UI.fmt(run.round.target) + '.');
    showPhase();
    if (o && o.kind === 'artifact') setTimeout(function () { UI.flashArt(o.art); }, 50);
  }

  // ---------- actions (event delegation) ----------
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    Snd.resume();
    var a = el.getAttribute('data-act'), run = G.run;
    switch (a) {
      case 'new':
        if (G.saved && !G.run) UI.confirmBox('Сохранённый забег (' + G.saved.code + ') будет заменён новым. Продолжить?', 'Новый забег', function () { startRun(readCode()); });
        else startRun(G.run ? null : readCode());
        break;
      case 'same-code': startRun(run.code); break;
      case 'continue': if (G.saved) enterRun(G.saved); break;
      case 'collection': UI.collection(G); break;
      case 'settings': UI.settings(G); break;
      case 'to-menu': toMenu(); break;
      case 'menu': if (run && !G.shot) UI.pause(G); break;
      case 'resume': UI.closeOverlay(); showPhase(); break;
      case 'settings-ingame': UI.settings(G, 'pause-back'); break;
      case 'collection-ingame': UI.collection(G); document.querySelector('#overlay [data-act="to-menu"]').setAttribute('data-act', 'pause-back'); break;
      case 'pause-back': UI.pause(G); break;
      case 'abandon': UI.confirmBox('Текущий забег будет потерян. Начать новый?', 'Новый забег', function () { startRun(null); }); break;
      case 'power': setPower(el.getAttribute('data-v')); break;
      case 'strike': strike(); break;
      case 'fast': G.fast = !G.fast; UI.renderSide(G); break;
      case 'hint-close': closeHint(); break;
      case 'reward': chooseReward(+el.getAttribute('data-i')); break;
      case 'buy': {
        var i = +el.getAttribute('data-i'), o = run.shop.offers[i];
        if (!o || o.sold || run.coins < o.price) break;
        optionFlow(o, function (args) {
          var b5 = achKeys();
          var err = Run.shopBuy(run, i, args, G.profile);
          toastAchievements(newSince(b5));
          if (err) UI.toast(UI.esc(err), 'info'); else Snd.play('coin');
          UI.shop(G);
        });
        break;
      }
      case 'sell': {
        var id = el.getAttribute('data-id'), art = AP.Content.artifacts[id];
        UI.confirmBox('Продать «' + art.name + '» за ¤ ' + C.economy.prices.sell + '? Свойства шаров, полученные раньше, останутся.', 'Продать', function () { Run.shopSell(run, id); UI.shop(G); });
        break;
      }
      case 'refresh': { var er = Run.shopRefresh(run); if (er) UI.toast(UI.esc(er), 'info'); UI.shop(G); break; }
      case 'remove':
        UI.pickBall(G, {
          title: 'Какой шар удалить из набора навсегда?', deck: run.deck,
          check: function () { return null; },
          after: function () { return 'удалён'; },
          warn: function (b) { return Run.lastOfColor(run, b.id) ? 'Это последний ' + C.colorNames[b.color] + ' шар: Спектр станет недоступен без перекраски.' : null; },
          confirm: 'Удалить за ¤ ' + C.economy.prices.remove,
          onConfirm: function (bid) { var er2 = Run.shopRemove(run, bid); if (er2) UI.toast(UI.esc(er2), 'info'); UI.shop(G); }
        });
        break;
      case 'leave': Run.shopLeave(run); afterBuild(null); break;
      case 'finish': Run.victoryFinish(run); showPhase(); break;
      case 'continue-endless': { var b4 = achKeys(); Run.victoryContinue(run, G.profile); toastAchievements(newSince(b4)); showPhase(); break; }
    }
  });

  document.addEventListener('change', function (e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-set');
    if (!k) return;
    G.profile.settings[k] = e.target.checked;
    AP.Store.saveProfile(G.profile);
    if (k === 'sound') Snd.setEnabled(e.target.checked);
    if (k === 'hints' && !e.target.checked) UI.hint(null);
    if (k === 'assist') G.snapKey = null;
  });

  function readCode() { var el = document.getElementById('codein'); return el ? el.value : null; }

  function setPower(p) {
    if (C.power[p] == null) return;
    G.aim.power = p;
    if (G.aim.locked && G.aim.angle != null) { snapsFresh(); G.aim.angle = snapAngle(G.aim.angle); }
    refreshPrediction();
    UI.renderSide(G);
  }

  // ---------- canvas input ----------
  function pointerWorld(e) {
    var r = canvas.getBoundingClientRect();
    return AP.Render.toWorld(e.clientX - r.left, e.clientY - r.top);
  }
  function ballAt(w) {
    if (!G.world) return null;
    var best = null;
    G.world.balls.forEach(function (b) {
      if (!b.onTable) return;
      if (Math.hypot(b.x - w.x, b.y - w.y) < b.r + 4) best = b;
    });
    return best;
  }
  function aimAt(w) {
    var c = G.world && P.cue(G.world);
    if (!c) return null;
    if (Math.hypot(w.x - c.x, w.y - c.y) < 3) return null;
    return Math.atan2(w.y - c.y, w.x - c.x);
  }

  canvas.addEventListener('pointermove', function (e) {
    var w = pointerWorld(e);
    G.mouse = w;
    var b = ballAt(w);
    G.hoverBall = b ? b.id : null;
    if (b && b.kind === 'color' && !UI.isOverlay()) { G.canvasTip = true; UI.showTip(UI.ballTip(b, G.run), e.clientX, e.clientY); }
    else if (G.canvasTip) { G.canvasTip = false; UI.hideTip(); }
    if (G.run && G.run.phase === 'aim' && !G.shot && !G.aim.locked && e.pointerType === 'mouse') {
      var a = aimAt(w);
      if (a != null) { snapsFresh(); a = snapAngle(a); }
      if (a != null && a !== G.aim.angle) { G.aim.angle = a; refreshPrediction(); }
    }
  });
  canvas.addEventListener('pointerleave', function () {
    G.hoverBall = null; G.canvasTip = false; UI.hideTip();
    if (!G.aim.locked) { G.aim.angle = null; G.aim.pred = null; }
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    Snd.resume();
    if (G.bd) { finishBreakdown(); return; }
    if (!G.run || G.run.phase !== 'aim' || G.shot) return;
    var a = aimAt(pointerWorld(e));
    if (a == null) return;
    snapsFresh();
    G.aim.angle = snapAngle(a); G.aim.locked = true;
    refreshPrediction();
    UI.renderSide(G);
  });

  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT')) { if (e.key === 'Enter') startRun(readCode()); return; }
    if (document.querySelector('.modal')) { if (e.key === 'Escape') { var c = document.querySelector('.modal [data-m="cancel"]'); if (c) c.click(); } return; }
    if (e.key === 'Escape') {
      if (UI.isOverlay() && G.run && G.run.phase === 'aim') { UI.closeOverlay(); showPhase(); }
      else if (!UI.isOverlay() && G.run && !G.shot) UI.pause(G);
      return;
    }
    if (UI.isOverlay() || !G.run) return;
    if (e.key === '1' || e.key === '2' || e.key === '3') setPower(C.powerOrder[+e.key - 1]);
    else if (e.code === 'Space') {
      e.preventDefault();
      if (G.bd) finishBreakdown(); else strike();
    } else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') { G.fast = !G.fast; UI.renderSide(G); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (G.run.phase !== 'aim' || G.shot || G.aim.angle == null) return;
      e.preventDefault();
      var d = (e.shiftKey ? 1 : 0.1) * Math.PI / 180 * (e.key === 'ArrowLeft' ? -1 : 1);
      G.aim.angle += d; G.aim.locked = true;
      refreshPrediction(); UI.renderSide(G);
    }
  });

  // ---------- loop ----------
  var last = 0;
  function update(dt) {
    G.now += dt;
    if (G.shot) {
      var steps = Math.min(600, Math.round(dt / C.table.dt) * (G.fast ? C.anim.fastMult : 1));
      for (var i = 0; i < steps && !G.shot.done; i++) AP.Rules.shotStep(G.shot);
      consumeShotEvents();
      if (G.shot.done) finishShot();
    } else if (G.bd) stepBreakdown(dt);
    G.shake = Math.max(0, G.shake - dt * 30);
    if (G.fx.length > 60) G.fx = G.fx.filter(function (f) { return G.now - f.at < 2; });
  }
  function draw() {
    var run = G.run;
    AP.Render.draw(ctx, {
      world: G.world, now: G.now, aim: G.aim, canAim: !!(run && run.phase === 'aim' && !G.shot && !G.bd && G.aim.angle != null),
      hoverBall: G.hoverBall, fx: G.fx, shake: G.shake, reduceFx: G.profile.settings.reduceFx,
      anomaly: anomalyLevel(), seed: run ? run.seed : 1,
      priorityColor: run && run.round.bossId === 'shift' && run.phase === 'aim' && !G.shot ? Run.shiftColor(run) : null,
      chainHint: run && run.phase === 'aim' && chainHint(),
      firstWave: function () { return has('shockwave'); },
      cueBonus: has('daredevil'),
      chalk: run ? 'раунд ' + (run.round.index + 1) + ' · цель ' + UI.fmt(run.round.target) : 'аномальный пул'
    });
  }
  function frame(ts) {
    var t = ts / 1000;
    var dt = last ? Math.min(0.05, t - last) : 0.016;
    last = t;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // test hook: advance the game without rendering frames (the pane can be hidden)
  AP.game.advance = function (sec) { var n = Math.ceil(sec * 60); for (var i = 0; i < n; i++) update(1 / 60); draw(); };
  AP.game.aim = function (angle, power) { G.aim.angle = angle; G.aim.locked = true; if (power) G.aim.power = power; refreshPrediction(); UI.renderSide(G); };
  AP.game.strike = strike;

  UI.init({});
  UI.setupTips(G);
  window.addEventListener('resize', draw);
  toMenu();
  requestAnimationFrame(frame);
})();
