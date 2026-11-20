// DOM: sidebar, tooltips, toasts, hints and every overlay screen. Calls back into main via `act`.
var AP = AP || {};

AP.UI = (function () {
  var C = AP.CFG, K = AP.Content;
  var $ = function (id) { return document.getElementById(id); };
  var act = null;   // actions provided by main

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(n) {
    if (n >= 1e15) return n.toExponential(3).replace('e+', '·10^');
    return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // ---------- small pieces ----------
  function mini(b, extra) {
    var g = b.color === 'red' ? '▲' : b.color === 'blue' ? '■' : '●';
    return '<span class="mini c-' + b.color + ' ' + (b.material !== 'normal' ? b.material : '') + ' ' + (b.effect !== 'none' ? b.effect : '') + ' ' + (extra || '') + '" data-tip="ball:' + b.id + '">' + g + '</span>';
  }

  function ballTip(b, run) {
    var lines = ['<b>' + C.colorNamesF[b.color] + ' шар' + (b.isCopy ? ' (временная копия)' : '') + '</b>'];
    var mat = C.materials[b.material];
    lines.push('материал: ' + mat.name + (b.material === 'gold' ? ' — +1 монета при забивании' : b.material === 'crystal' ? ' — ценность ×2' : ''));
    lines.push('эффект: ' + C.effects[b.effect].name + (b.effect === 'explosive' ? ' — волна у лузы при забивании' : ''));
    var v = b.value * mat.mult;
    lines.push('ценность: ' + b.value + (mat.mult !== 1 ? ' ×' + mat.mult + ' = ' + v : ''));
    var src = [];
    if (run) {
      if (run.artifacts.indexOf('echo') >= 0 && b.color === C.art.echoColor) src.push('Эхо: начисляется ещё раз');
      if (run.artifacts.indexOf('cascade') >= 0) src.push('Каскад: +' + C.art.cascadeStep + ' за каждый шар перед ним в ударе');
      if (run.artifacts.indexOf('goldvein') >= 0 && b.material === 'gold') src.push('Золотая жила: ещё +1 монета');
    }
    if (src.length) lines.push('<span class="muted">' + src.join('<br>') + '</span>');
    return lines.join('<br>');
  }

  function artTip(id) { var a = K.artifacts[id]; return '<b>' + a.glyph + ' ' + a.name + '</b> <span class="muted">· ветка: ' + a.path + '</span><br>' + esc(a.text); }

  // ---------- sidebar ----------
  function buildSide() {
    $('side').innerHTML =
      '<div class="topline"><button class="btn small ghost" data-act="menu">≡ Меню</button><span class="sp"></span><span class="code" id="s-code"></span></div>' +
      '<div class="blk" id="s-round"></div>' +
      '<div class="blk boss hidden" id="s-boss"></div>' +
      '<div class="blk" id="s-ctrl"></div>' +
      '<div class="blk"><h4 id="s-arts-h">Артефакты</h4><div class="arts" id="s-arts"></div></div>' +
      '<div class="blk"><h4>Последний удар</h4><div class="log" id="s-log"><div class="empty">Здесь появится разбивка очков.</div></div></div>' +
      '<div class="blk"><h4 id="s-deck-h">Набор</h4><div class="deck" id="s-deck"></div></div>';
  }

  function renderSide(G) {
    var run = G.run;
    if (!run) return;
    var rd = run.round, info = AP.Run.roundInfo(run, rd.index);
    $('s-code').textContent = 'код ' + run.code + (run.dev ? ' · dev' : '');
    var total = AP.Run.mainRounds();
    var title = info.endless ? 'Продолжение · раунд +' + (rd.index - total + 1) : 'Акт ' + (info.act + 1) + ' · Раунд ' + (rd.index + 1) + ' из ' + total;
    var shown = G.displayScore != null ? G.displayScore : rd.score;
    var pct = Math.min(100, shown / rd.target * 100);
    var pips = '';
    for (var i = 0; i < rd.shotsMax; i++) pips += '<span class="pip ' + (i < rd.shotsLeft ? 'on' : '') + '"></span>';
    $('s-round').innerHTML =
      '<div class="roundtitle">' + title + ' · <b>' + info.kind + '</b></div>' +
      '<div class="scoreval">' + fmt(shown) + ' <small>/ ' + fmt(rd.target) + '</small></div>' +
      '<div class="bar ' + (shown >= rd.target ? 'done' : '') + '"><i style="width:' + pct + '%"></i></div>' +
      '<div class="row" style="margin-top:8px"><span class="pips" data-tip="text:Оставшиеся удары">' + pips + '</span><span class="sp"></span><span class="coins" data-tip="text:Монеты. Тратятся в магазине после босса.">¤ ' + run.coins + '</span></div>';

    // boss: current rule, or the act's upcoming boss (visible from the start of the act)
    var bossBox = $('s-boss');
    var bossId = rd.bossId, upcoming = false;
    if (!bossId) { bossId = AP.Run.bossFor(run, info.act); upcoming = true; }
    var b = C.bosses[bossId];
    var extra = '';
    if (!upcoming && bossId === 'shift' && run.phase === 'aim') {
      var sc = AP.Run.shiftColor(run);
      extra = '<div class="shiftc">Этот удар: ' + mini({ id: -1, color: sc, material: 'normal', effect: 'none' }) + ' ' + C.colorNames[sc] + ' ×2</div>';
    }
    if (!upcoming && bossId === 'closed') extra = '<p>Закрытая луза отмечена на столе розовым кольцом.</p>';
    var bossTarget = AP.Run.roundInfo(run, info.act * C.roundsPerAct + 2).target;
    bossBox.innerHTML = '<h4>' + (upcoming ? 'Босс этого акта (раунд ' + (info.act * C.roundsPerAct + 3) + ', цель ' + fmt(bossTarget) + ')' : 'Правило босса') + '</h4>' +
      '<div class="name">' + b.name + '</div><p>' + b.rule + '</p>' + extra;
    bossBox.classList.remove('hidden');

    var moving = run.phase !== 'aim';
    var pw = C.powerOrder.map(function (p, i) {
      return '<button class="btn ' + (G.aim.power === p ? 'sel' : '') + '" data-act="power" data-v="' + p + '">' + C.powerNames[p] + '<span class="k">' + (i + 1) + '</span></button>';
    }).join('');
    $('s-ctrl').innerHTML = '<h4>Сила удара</h4><div class="powers">' + pw + '</div>' +
      '<button class="btn primary big strike" data-act="strike" ' + (moving || G.aim.angle == null ? 'disabled' : '') + '>Удар <span class="k" style="display:inline;color:#5a3d0c">пробел</span></button>' +
      '<div class="row" style="margin-top:8px"><button class="btn small ' + (G.fast ? 'sel' : '') + '" data-act="fast" data-tip="text:Ускоряет показ движения и подсчёта. Результат удара не меняется.">⏩ Ускорить (F)</button><span class="sp"></span>' +
      '<span class="code" data-tip="text:Клик по столу задаёт направление. Стрелки ← → поворачивают точнее (Shift — быстрее).">← → точнее</span></div>';

    $('s-arts-h').textContent = 'Артефакты ' + run.artifacts.length + '/' + C.artifactSlots;
    var slots = '';
    for (var k = 0; k < C.artifactSlots; k++) {
      var id = run.artifacts[k];
      slots += id ? '<div class="slot full ' + K.artifacts[id].cat + '" data-tip="art:' + id + '" data-art="' + id + '">' + K.artifacts[id].glyph + '</div>' : '<div class="slot" data-tip="text:Пустой слот">·</div>';
    }
    $('s-arts').innerHTML = slots;

    var onTable = {};
    rd.table.balls.forEach(function (x) { onTable[x.id] = 1; });
    $('s-deck-h').textContent = 'Набор: ' + run.deck.length + ' шаров (на столе ' + rd.table.balls.filter(function (x) { return !x.isCopy; }).length + ')';
    $('s-deck').innerHTML = run.deck.map(function (x) { return mini(x, onTable[x.id] ? '' : 'out'); }).join('') +
      rd.table.balls.filter(function (x) { return x.isCopy; }).map(function (x) { return mini(x, 'copy'); }).join('');
  }

  function flashArt(id) {
    var el = document.querySelector('#s-arts [data-art="' + id + '"]');
    if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  }

  // breakdown log (animated by main)
  function logClear(empty) { $('s-log').innerHTML = empty ? '<div class="empty">' + esc(empty) + '</div>' : ''; }
  function logLine(l) {
    var d = document.createElement('div');
    d.className = 'ln ' + (l.kind || '');
    d.textContent = l.text;
    $('s-log').appendChild(d);
  }

  // ---------- tooltips ----------
  function setupTips(G) {
    var tip = $('tip');
    document.addEventListener('mouseover', function (e) {
      var el = e.target.closest && e.target.closest('[data-tip]');
      if (!el) { if (!G.canvasTip) tip.classList.add('hidden'); return; }
      var t = el.getAttribute('data-tip'), html = '';
      if (t.indexOf('ball:') === 0) {
        var id = +t.slice(5), run = G.run, b = null;
        if (run) {
          b = run.deck.filter(function (x) { return x.id === id; })[0] || run.round.table.balls.filter(function (x) { return x.id === id; })[0];
          if (!b && G.pickerDeck) b = G.pickerDeck.filter(function (x) { return x.id === id; })[0];
        }
        if (!b) return;
        html = ballTip(b, run);
      } else if (t.indexOf('art:') === 0) html = artTip(t.slice(4));
      else html = esc(t.slice(5));
      showTip(html, e.clientX, e.clientY);
    });
    document.addEventListener('mousemove', function (e) {
      if (tip.classList.contains('hidden') || G.canvasTip) return;
      placeTip(e.clientX, e.clientY);
    });
    document.addEventListener('mouseout', function (e) {
      var el = e.target.closest && e.target.closest('[data-tip]');
      if (el && !G.canvasTip) tip.classList.add('hidden');
    });
  }
  function showTip(html, x, y) { var tip = $('tip'); tip.innerHTML = html; tip.classList.remove('hidden'); placeTip(x, y); }
  function placeTip(x, y) {
    var tip = $('tip'), w = tip.offsetWidth, h = tip.offsetHeight;
    var px = x + 16, py = y + 14;
    if (px + w > window.innerWidth - 8) px = x - w - 12;
    if (py + h > window.innerHeight - 8) py = y - h - 10;
    tip.style.position = 'fixed'; tip.style.left = px + 'px'; tip.style.top = py + 'px';
  }
  function hideTip() { $('tip').classList.add('hidden'); }

  // ---------- toasts and hints ----------
  function toast(html, kind) {
    var d = document.createElement('div');
    d.className = 'toast ' + (kind || '');
    d.innerHTML = html;
    $('toasts').appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 5200);
  }
  function hint(text) {
    var h = $('hint');
    if (!text) { h.classList.add('hidden'); return; }
    h.innerHTML = '<span>' + text + '</span><button data-act="hint-close" title="Скрыть">✕</button>';
    h.classList.remove('hidden');
  }

  // ---------- overlay screens ----------
  function overlay(html) {
    var o = $('overlay');
    o.innerHTML = html;
    o.classList.remove('hidden');
    o.scrollTop = 0;
  }
  function closeOverlay() { $('overlay').classList.add('hidden'); $('overlay').innerHTML = ''; }
  function isOverlay() { return !$('overlay').classList.contains('hidden'); }

  function menu(G) {
    var p = G.profile, saved = G.saved;
    var rec = p.records;
    overlay('<div class="screen center">' +
      '<h1>Аномальный <span class="an">пул</span></h1>' +
      '<div class="sub">подпольный клуб · бильярдный рогалик · рабочий прототип</div>' +
      '<div class="menu">' +
      (saved ? '<button class="btn primary" data-act="continue">Продолжить забег<span class="k" style="color:#5a3d0c">' + esc(savedLabel(saved)) + '</span></button>' : '') +
      '<button class="btn ' + (saved ? '' : 'primary') + '" data-act="new">Новый забег</button>' +
      '<div class="codein">код забега <input id="codein" maxlength="12" placeholder="случайный" autocomplete="off" spellcheck="false"></div>' +
      '<button class="btn" data-act="collection">Коллекция</button>' +
      '<button class="btn" data-act="settings">Настройки</button>' +
      '</div>' +
      '<div class="records">Побед: ' + (rec.wins || 0) + ' · лучший удар: ' + fmt(rec.bestShot || 0) + ' · рекорд продолжения: ' + (rec.bestExtraRounds || 0) + ' раунд.' +
      (p.settings.dev ? '<br><span style="color:#ff9fe6">Режим разработчика включён: все открытия, достижения и рекорды не записываются.</span>' : '') + '</div>' +
      '</div>');
  }
  function savedLabel(r) {
    var ph = { aim: 'на столе', reward: 'выбор награды', shop: 'магазин', victory: 'победа', lost: 'итог', finished: 'итог' }[r.phase] || '';
    return 'раунд ' + (r.round.index + 1) + ' · ' + ph + ' · ' + r.code;
  }

  function optionView(run, o) {
    var v = { ic: '', ttl: '', txt: '' };
    switch (o.kind) {
      case 'artifact': {
        var a = K.artifacts[o.art];
        v.ic = '<span style="text-shadow:0 0 12px currentColor">' + a.glyph + '</span>'; v.ttl = a.name; v.txt = a.text; v.path = a.path;
        var same = run.artifacts.filter(function (x) { return K.artifacts[x].path === a.path; }).map(function (x) { return K.artifacts[x].name; });
        if (same.length) v.path += ' · уже есть: ' + same.join(', ');
        if (run.artifacts.length >= C.artifactSlots) v.warn = 'Слоты заняты — нужно заменить один артефакт.';
        break;
      }
      case 'effect': v.ic = '✸'; v.ttl = 'Взрывной эффект'; v.txt = 'Выбранный шар становится взрывным: при забивании создаёт волну радиусом ' + C.wave.radius + ' у лузы, которая толкает шары (и биток).'; break;
      case 'material':
        v.ic = o.material === 'gold' ? '<span style="color:#ffd66b">◉</span>' : '<span style="color:#cff6ff">◈</span>';
        v.ttl = (o.material === 'gold' ? 'Золотой' : 'Хрустальный') + ' материал';
        v.txt = o.material === 'gold' ? 'Выбранный шар становится золотым: +1 монета при каждом физическом забивании.' : 'Выбранный шар становится хрустальным: его ценность при начислении ×2.';
        break;
      case 'recolor': v.ic = mini({ id: -1, color: o.color, material: 'normal', effect: 'none' }); v.ttl = 'Перекрасить в ' + C.colorNames[o.color]; v.txt = 'Выбранный шар меняет цвет. Материал и эффект сохраняются.'; break;
      case 'value': v.ic = '+' + o.amount; v.ttl = 'Ценность +' + o.amount; v.txt = 'Постоянная ценность выбранного шара +' + o.amount + '.'; break;
      case 'newBall':
        v.ic = mini({ id: -1, color: o.ball.color, material: o.ball.material, effect: o.ball.effect });
        v.ttl = 'Новый шар'; v.txt = K.ballLabel(o.ball) + '. Добавляется в постоянный набор (сейчас ' + run.deck.length + ', максимум ' + C.deck.max + ').';
        break;
      case 'coins': v.ic = '<span style="color:#d6a94a">¤</span>'; v.ttl = '+' + o.amount + ' монет'; v.txt = o.fallback ? 'Запасной вариант: подходящих вариантов этой категории не осталось.' : 'Деньги на магазин после босса или для Капитала.'; break;
    }
    return v;
  }

  var CAT = { physics: 'Аномалия', score: 'Очки и цвета', econ: 'Экономика' };

  function reward(G) {
    var run = G.run, rw = run.reward;
    var info = AP.Run.roundInfo(run, run.round.index);
    var cards = rw.options.map(function (o, i) {
      var v = optionView(run, o);
      return '<button class="card ' + o.cat + '" data-act="reward" data-i="' + i + '"><span class="tag">' + CAT[o.cat] + '</span>' +
        '<div class="ic">' + v.ic + '</div><div class="ttl">' + v.ttl + '</div>' + (v.path ? '<div class="path">ветка: ' + esc(v.path) + '</div>' : '') + '<div class="txt">' + esc(v.txt) + '</div>' + (v.warn ? '<div class="warn">' + v.warn + '</div>' : '') + '</button>';
    }).join('');
    var nextLine;
    if (rw.boss) nextLine = 'После выбора — <b>магазин</b>, затем акт ' + (info.act + 2) + '.';
    else {
      var nx = AP.Run.roundInfo(run, run.round.index + 1);
      nextLine = 'Дальше: раунд ' + (nx.index + 1) + ' · ' + nx.kind + ', цель <b>' + fmt(nx.target) + '</b>' + (nx.bossId ? ' · ' + C.bosses[nx.bossId].name + ': ' + C.bosses[nx.bossId].rule : '') + '.';
    }
    overlay('<div class="screen">' +
      '<h2>Раунд пройден</h2>' +
      '<div class="sub">+' + rw.money + ' монет за победу' + (rw.bonus ? ', +' + rw.bonus + ' за оставшиеся удары' : '') + ' · сейчас ¤ ' + run.coins + '. Выбери одну бесплатную награду.</div>' +
      '<div class="cards">' + cards + '</div>' +
      buildBox(run) +
      '<div class="next" style="margin-top:12px">' + nextLine + '</div>' +
      '</div>');
  }

  function buildBox(run) {
    var arts = run.artifacts.length ? run.artifacts.map(function (id) {
      return '<div class="artline" data-tip="art:' + id + '"><span class="g">' + K.artifacts[id].glyph + '</span><span>' + K.artifacts[id].name + '</span></div>';
    }).join('') : '<div class="code">пока нет</div>';
    return '<div class="panelrow"><div class="box"><h4>Артефакты ' + run.artifacts.length + '/' + C.artifactSlots + '</h4>' + arts + '</div>' +
      '<div class="box"><h4>Набор: ' + run.deck.length + ' шаров (от ' + C.deck.min + ' до ' + C.deck.max + ')</h4><div class="deck">' + run.deck.map(function (b) { return mini(b); }).join('') + '</div></div></div>';
  }

  // Ball picker: opts { title, deck, check(b)→reason|null, after(b)→label, warn(b)→text|null, confirm, onConfirm(id), onCancel }
  function pickBall(G, opts) {
    var sel = null;
    G.pickerDeck = opts.deck;
    var m = document.createElement('div');
    m.className = 'modal';
    function draw() {
      var items = opts.deck.map(function (b) {
        var why = opts.check(b);
        return '<button class="pick ' + (why ? 'disabled' : '') + (sel === b.id ? ' sel' : '') + '" data-id="' + b.id + '" ' + (why ? 'title="' + esc(why) + '"' : '') + '>' + mini(b) +
          '<span>' + esc(K.ballLabel(b)) + '<br><span class="code">ценность ' + b.value + (why ? ' · ' + esc(why) : '') + '</span></span></button>';
      }).join('');
      var cmp = '';
      if (sel != null) {
        var b = opts.deck.filter(function (x) { return x.id === sel; })[0];
        cmp = esc(K.ballLabel(b)) + ' · ' + b.value + '<span class="arrow">→</span>' + esc(opts.after(b));
        var w = opts.warn && opts.warn(b);
        if (w) cmp += '<span class="warn">' + esc(w) + '</span>';
      } else cmp = '<span class="code">Выбери шар из набора.</span>';
      m.innerHTML = '<div class="inner"><h2 style="margin:0 0 10px;font-size:20px">' + esc(opts.title) + '</h2><div class="picker">' + items + '</div>' +
        '<div class="compare">' + cmp + '</div>' +
        '<div class="actions"><button class="btn" data-m="cancel">Отмена</button><button class="btn primary" data-m="ok" ' + (sel == null ? 'disabled' : '') + '>' + esc(opts.confirm || 'Подтвердить') + '</button></div></div>';
    }
    draw();
    m.addEventListener('click', function (e) {
      var p = e.target.closest('.pick');
      if (p && !p.classList.contains('disabled')) { sel = +p.getAttribute('data-id'); draw(); return; }
      var b = e.target.closest('[data-m]');
      if (!b) return;
      if (b.getAttribute('data-m') === 'cancel') { close(); opts.onCancel && opts.onCancel(); }
      else if (sel != null) { close(); opts.onConfirm(sel); }
    });
    function close() { if (m.parentNode) m.parentNode.removeChild(m); G.pickerDeck = null; hideTip(); }
    document.body.appendChild(m);
  }

  function pickArtifact(G, opts) {
    var m = document.createElement('div');
    m.className = 'modal';
    var na = K.artifacts[opts.newArt];
    m.innerHTML = '<div class="inner"><h2 style="margin:0 0 6px;font-size:20px">Слоты заняты: что заменить?</h2>' +
      '<div class="sub" style="margin:0 0 10px">Новый: <b>' + na.glyph + ' ' + na.name + '</b> — ' + esc(na.text) + '<br>Заменённый артефакт пропадает без возврата денег.</div>' +
      '<div class="list">' + opts.list.map(function (id) {
        var a = K.artifacts[id];
        return '<button class="pick" data-id="' + id + '"><span style="font-size:22px;width:28px;text-align:center">' + a.glyph + '</span><span><b>' + a.name + '</b><br><span class="code">' + esc(a.text) + '</span></span></button>';
      }).join('') + '</div><div class="actions"><button class="btn" data-m="cancel">Отмена</button></div></div>';
    m.addEventListener('click', function (e) {
      var p = e.target.closest('.pick');
      if (p) { close(); opts.onConfirm(p.getAttribute('data-id')); return; }
      if (e.target.closest('[data-m="cancel"]')) { close(); opts.onCancel && opts.onCancel(); }
    });
    function close() { if (m.parentNode) m.parentNode.removeChild(m); }
    document.body.appendChild(m);
  }

  function confirmBox(text, okLabel, onOk) {
    var m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = '<div class="inner" style="width:min(460px,100%)"><div style="font-size:16px;line-height:1.45">' + text + '</div><div class="actions"><button class="btn" data-m="cancel">Отмена</button><button class="btn primary" data-m="ok">' + esc(okLabel) + '</button></div></div>';
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-m]'); if (!b) return;
      m.parentNode.removeChild(m);
      if (b.getAttribute('data-m') === 'ok') onOk();
    });
    document.body.appendChild(m);
  }

  function shop(G) {
    var run = G.run, sh = run.shop, pr = C.economy.prices;
    var info = AP.Run.roundInfo(run, run.round.index + 1);
    var offers = sh.offers.length ? sh.offers.map(function (o, i) {
      var v = optionView(run, o);
      var dis = o.sold || run.coins < o.price;
      return '<button class="card ' + (o.kind === 'artifact' ? K.artifacts[o.art].cat : 'econ') + (dis ? ' disabled' : '') + '" data-act="buy" data-i="' + i + '">' +
        '<span class="tag">' + (o.kind === 'artifact' ? 'Артефакт' : 'Шар') + '</span><div class="ic">' + v.ic + '</div><div class="ttl">' + v.ttl + '</div>' + (v.path ? '<div class="path">ветка: ' + esc(v.path) + '</div>' : '') + '<div class="txt">' + esc(v.txt) + '</div>' +
        (v.warn && !o.sold ? '<div class="warn">' + v.warn + '</div>' : '') +
        '<div class="price">' + (o.sold ? 'куплено' : '¤ ' + o.price + (run.coins < o.price ? ' — не хватает' : '')) + '</div></button>';
    }).join('') : '<div class="code">Нет предложений.</div>';
    var arts = run.artifacts.length ? run.artifacts.map(function (id) {
      return '<div class="artline" data-tip="art:' + id + '"><span class="g">' + K.artifacts[id].glyph + '</span><span class="sp">' + K.artifacts[id].name + '</span><button class="btn small" data-act="sell" data-id="' + id + '">Продать +' + pr.sell + '</button></div>';
    }).join('') : '<div class="code">Нет артефактов.</div>';
    overlay('<div class="screen">' +
      '<h2>Магазин клуба</h2>' +
      '<div class="sub">¤ <b style="color:#d6a94a;font-size:18px">' + run.coins + '</b> · покупки необязательны. Дальше: акт ' + (info.act + 1) + ', раунд ' + (info.index + 1) + ', цель ' + fmt(info.target) + '. Босс акта: ' + C.bosses[AP.Run.bossFor(run, info.act)].name + '.</div>' +
      '<div class="cards" style="grid-template-columns:repeat(2,1fr)">' + offers + '</div>' +
      '<div class="shoprow" style="margin-bottom:12px">' +
      '<button class="btn" data-act="refresh" ' + (run.coins < sh.refreshPrice ? 'disabled' : '') + '>Обновить ассортимент · ¤ ' + sh.refreshPrice + '</button>' +
      '<button class="btn" data-act="remove" ' + (run.coins < pr.remove || run.deck.length <= C.deck.min ? 'disabled' : '') + '>Удалить шар из набора · ¤ ' + pr.remove + '</button>' +
      (run.deck.length <= C.deck.min ? '<span class="code">в наборе минимум ' + C.deck.min + ' шаров</span>' : '') +
      '</div>' +
      '<div class="panelrow"><div class="box"><h4>Артефакты ' + run.artifacts.length + '/' + C.artifactSlots + '</h4>' + arts + '</div>' +
      '<div class="box"><h4>Набор: ' + run.deck.length + ' шаров (от ' + C.deck.min + ' до ' + C.deck.max + ')</h4><div class="deck">' + run.deck.map(function (b) { return mini(b); }).join('') + '</div></div></div>' +
      '<div class="actions"><button class="btn primary big" data-act="leave">Дальше: акт ' + (info.act + 1) + '</button></div>' +
      '</div>');
  }

  function victory(G) {
    var run = G.run;
    overlay('<div class="screen center">' +
      '<h1>Основной забег <span class="an">пройден</span></h1>' +
      '<div class="sub">Прототип: ' + C.actsMain + ' акта, ' + AP.Run.mainRounds() + ' раундов. Победа уже записана.</div>' +
      stats(run) +
      '<div class="sub">Можно закончить или продолжить на растущей сложности (цель ×' + String(C.endlessMult).replace('.', ',') + ' за раунд). При продолжении — награда за босса, магазин и следующий акт.</div>' +
      '<div class="actions"><button class="btn" data-act="finish">Завершить забег</button><button class="btn primary" data-act="continue-endless">Продолжить</button></div>' +
      '</div>');
  }

  function stats(run) {
    var earned = run.earned.map(function (id) { return K.achievements[id].name; });
    return '<div class="stats">' +
      '<div class="stat"><div class="v">' + (Math.min(run.round.index + 1, AP.Run.mainRounds())) + '/' + AP.Run.mainRounds() + '</div><div class="l">раундов основного забега</div></div>' +
      (run.mainVictory ? '<div class="stat"><div class="v">' + run.extraRounds + '</div><div class="l">доп. раундов пройдено</div></div>' : '') +
      '<div class="stat"><div class="v">' + fmt(run.totalScore) + '</div><div class="l">очков за забег</div></div>' +
      '<div class="stat"><div class="v">' + fmt(run.bestShot) + '</div><div class="l">лучший удар</div></div>' +
      '<div class="stat"><div class="v">' + earned.length + '</div><div class="l">достижений в забеге' + (earned.length ? ': ' + esc(earned.join(', ')) : '') + '</div></div>' +
      '</div>';
  }

  function result(G) {
    var run = G.run;
    var head = run.phase === 'finished' ? 'Забег завершён' : run.mainVictory ? 'Продолжение окончено' : 'Удары закончились';
    var sub = run.mainVictory ? 'Основной забег пройден' + (run.extraRounds ? ' · дополнительных раундов: ' + run.extraRounds : '') + '.' :
      'Раунд ' + (run.round.index + 1) + ': ' + fmt(run.round.score) + ' из ' + fmt(run.round.target) + '.';
    overlay('<div class="screen center">' +
      '<h1>' + head + '</h1><div class="sub">' + sub + ' Код забега: <span class="code" style="font-size:14px">' + run.code + '</span></div>' +
      stats(run) +
      unlockNote(G) +
      '<div class="actions"><button class="btn primary big" data-act="new">Новый забег</button><button class="btn" data-act="same-code">Повторить этот код</button><button class="btn" data-act="to-menu">В меню</button></div>' +
      '</div>');
  }
  function unlockNote(G) {
    var p = G.profile, run = G.run;
    var fresh = K.achievementOrder.filter(function (id) {
      if (!p.achievements[id]) return false;
      var u = K.achievements[id].unlock;
      return u.artifact ? run.pool.artifacts.indexOf(u.artifact) < 0 : run.pool.materials.indexOf(u.material) < 0;
    });
    if (!fresh.length || run.dev) return '';
    return '<div class="box" style="max-width:560px;margin:0 auto"><h4>Откроется в следующем забеге</h4>' + fresh.map(function (id) { return unlockText(id); }).join('<br>') + '</div>';
  }
  function unlockText(id) {
    var u = K.achievements[id].unlock;
    return u.artifact ? 'артефакт «' + K.artifacts[u.artifact].name + '»' : 'хрустальный материал';
  }

  function collection(G) {
    var p = G.profile;
    var ach = K.achievementOrder.map(function (id) {
      var a = K.achievements[id], done = !!p.achievements[id];
      return '<div class="ach ' + (done ? 'done' : '') + '"><span class="st">' + (done ? '✓' : '🔒') + '</span><div><b>' + a.name + '</b><div class="c">' + esc(a.cond) + '</div><div class="u">Открывает: ' + unlockText(id) + '</div></div></div>';
    }).join('');
    var base = K.base.artifacts;
    var arts = K.artifactOrder.map(function (id) {
      var a = K.artifacts[id], open = base.indexOf(id) >= 0 || K.achievementOrder.some(function (x) { return p.achievements[x] && K.achievements[x].unlock.artifact === id; });
      return '<div class="artline"><span class="g">' + (open ? a.glyph : '🔒') + '</span><span><b>' + a.name + '</b> <span class="code">ветка: ' + a.path + (base.indexOf(id) >= 0 ? ' · базовый' : '') + '</span><br><span class="d">' + esc(a.text) + '</span></span></div>';
    }).join('');
    var crystal = !!p.achievements.cleanCloth;
    overlay('<div class="screen">' +
      '<h2>Коллекция</h2><div class="sub">Новый контент открывается только достижениями и попадает в пул наград и магазина со следующего забега. Постоянных прибавок к силе нет.</div>' +
      '<div class="panelrow"><div class="box"><h4>Достижения</h4><div class="list">' + ach + '</div></div>' +
      '<div class="box"><h4>Артефакты</h4>' + arts + '<h4 style="margin-top:12px">Материалы и эффекты</h4>' +
      '<div class="artline"><span class="g">◯</span><span>обычный <span class="code">базовый</span></span></div>' +
      '<div class="artline"><span class="g" style="color:#ffd66b">◉</span><span>золотой <span class="code">базовый</span> — +1 монета при забивании</span></div>' +
      '<div class="artline"><span class="g">' + (crystal ? '<span style="color:#cff6ff">◈</span>' : '🔒') + '</span><span>хрустальный — ценность ×2</span></div>' +
      '<div class="artline"><span class="g" style="color:#ff8c28">✸</span><span>взрывной эффект <span class="code">базовый</span> — волна у лузы</span></div>' +
      '</div></div>' +
      '<div class="actions"><button class="btn primary" data-act="to-menu">Назад</button></div></div>');
  }

  function settings(G, back) {
    var s = G.profile.settings;
    function tg(key, title, desc) {
      return '<label class="toggle"><input type="checkbox" data-set="' + key + '" ' + (s[key] ? 'checked' : '') + '><span><b>' + title + '</b><br><span class="d">' + desc + '</span></span></label>';
    }
    overlay('<div class="screen" style="width:min(560px,100%)">' +
      '<h2>Настройки</h2><div class="sub">Настройки не меняют физику и результат удара.</div>' +
      tg('sound', 'Звук', 'Удары, лузы, взрывы и начисление очков.') +
      tg('assist', 'Помощь в прицеливании', 'Прицел притягивается к направлению, при котором шар идёт в лузу. Стрелки ← → по-прежнему двигают его свободно.') +
      tg('reduceFx', 'Меньше вспышек и тряски', 'Убирает тряску экрана, мерцание лампы и снижает яркость волн.') +
      tg('hints', 'Подсказки', 'Короткие подсказки в первом раунде и при первом начислении.') +
      tg('dev', 'Режим разработчика', 'Новые забеги стартуют со всеми открытиями. Достижения и рекорды в таких забегах не записываются.') +
      '<div class="actions"><button class="btn primary" data-act="' + (back || 'to-menu') + '">Готово</button></div></div>');
  }

  function pause(G) {
    overlay('<div class="screen center" style="width:min(420px,100%)"><h2>Пауза</h2><div class="sub">Код забега: <span class="code" style="font-size:14px">' + G.run.code + '</span></div>' +
      '<div class="menu" style="margin-top:10px"><button class="btn primary" data-act="resume">Вернуться к столу</button>' +
      '<button class="btn" data-act="settings-ingame">Настройки</button>' +
      '<button class="btn" data-act="collection-ingame">Коллекция</button>' +
      '<button class="btn" data-act="abandon">Новый забег</button>' +
      '<button class="btn" data-act="to-menu">В главное меню</button></div></div>');
  }

  return {
    init: function (actions) { act = actions; },
    buildSide: buildSide, renderSide: renderSide, flashArt: flashArt, logClear: logClear, logLine: logLine,
    setupTips: setupTips, showTip: showTip, hideTip: hideTip, toast: toast, hint: hint,
    overlay: overlay, closeOverlay: closeOverlay, isOverlay: isOverlay,
    menu: menu, reward: reward, shop: shop, victory: victory, result: result, collection: collection, settings: settings, pause: pause,
    pickBall: pickBall, pickArtifact: pickArtifact, confirmBox: confirmBox, ballTip: ballTip, fmt: fmt, esc: esc, unlockText: unlockText
  };
})();
