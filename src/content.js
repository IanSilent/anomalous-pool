// Content catalogue: artifacts, achievements and the base pool (§9, §12.1).
var AP = AP || {};

AP.Content = (function () {
  var C = AP.CFG;

  var artifacts = {
    echo: { path: 'красные шары', name: 'Эхо', glyph: '◎', cat: 'score',
      text: 'Каждый забитый красный шар начисляет свою ценность ещё раз. Не даёт монет и не повторяет взрыв.' },
    bumper: { path: 'борта', name: 'Отбойник', glyph: '⟂', cat: 'score',
      text: 'Каждый шар, который перед лузой ударился о борт, даёт ещё +' + C.art.bumperPerBall + ' к множителю. Складывается с Дуплетом.' },
    cascade: { path: 'много шаров', name: 'Каскад', glyph: '≋', cat: 'score',
      text: 'Чем больше шаров забито одним ударом, тем дороже каждый следующий: 2-й шар +' + C.art.cascadeStep + ', 3-й +' + 2 * C.art.cascadeStep + ', 4-й +' + 3 * C.art.cascadeStep + ' и так далее.' },
    shockwave: { path: 'взрывы', name: 'Ударная волна', glyph: '✺', cat: 'physics',
      text: 'Первый шар, забитый в каждом ударе, взрывается у лузы, даже если он обычный. Волна толкает шары вокруг.' },
    capital: { path: 'монеты', name: 'Капитал', glyph: '¤', cat: 'econ',
      text: 'Пока у тебя есть монеты, удары сильнее: +1 к множителю за каждые ' + C.art.capitalPer + ' монет (максимум +' + C.art.capitalMax + '). Монеты не тратятся.' },
    doubler: { path: 'взрывы', name: 'Удвоитель', glyph: '⧉', cat: 'physics',
      text: 'Первый шар, забитый в раунде, тут же появляется снова у лузы как временная копия. Её тоже можно забить. Один раз за раунд.' },
    prism: { path: 'цвета', name: 'Призма', glyph: '◭', cat: 'score',
      text: 'Один забитый шар может засчитаться другим цветом, если так выйдет сочетание сильнее: например, красный + синий станут Парой.' },
    goldvein: { path: 'монеты', name: 'Золотая жила', glyph: '⛁', cat: 'econ',
      text: 'Каждый забитый золотой шар приносит ещё +' + C.art.goldVeinCoins + ' монету сверху.' },
    sniper: { path: 'одиночные удары', name: 'Снайпер', glyph: '⌖', cat: 'score',
      text: 'Удар, в котором забит ровно один шар, получает +' + C.art.sniperBonus + ' к множителю. Аккуратная игра по одному шару.' },
    railmaster: { path: 'борта', name: 'Мастер борта', glyph: '⟋', cat: 'score',
      text: 'Дуплет даёт ещё +' + C.art.railmasterBonus + ' к множителю (всего +' + (1 + C.art.railmasterBonus) + '). Бей так, чтобы шар отскочил от борта и ушёл в лузу.' },
    carom: { path: 'много шаров', name: 'Карамболь', glyph: '⁂', cat: 'score',
      text: 'Цепочка даёт ещё +' + C.art.caromBonus + ' к множителю (всего +' + (1 + C.art.caromBonus) + '): забитый шар до лузы столкнулся с другим цветным.' },
    softhand: { path: 'слабые удары', name: 'Мягкая рука', glyph: '〰', cat: 'score',
      text: 'Удары слабой силой получают +' + C.art.softBonus + ' к множителю.' },
    ram: { path: 'сильные удары', name: 'Таран', glyph: '⇶', cat: 'score',
      text: 'Удары сильной силой получают ×' + String(C.art.ramProd).replace('.', ',') + ' к итоговым очкам удара.' },
    daredevil: { path: 'биток', name: 'Дерзкий биток', glyph: '◌', cat: 'score',
      text: 'Биток в лузе больше не промах: он приносит +' + C.art.daredevilValue + ' к сумме и +' + C.art.daredevilMult + ' к множителю, даже если цветные шары не забиты.' }
  };
  var artifactOrder = ['echo', 'bumper', 'cascade', 'shockwave', 'capital', 'sniper', 'railmaster', 'carom', 'softhand', 'ram', 'daredevil', 'doubler', 'prism', 'goldvein'];

  var achievements = {
    twoPockets: { name: 'Два кармана', cond: 'За один удар забить цветные шары хотя бы в две разные лузы.',
      unlock: { artifact: 'doubler' } },
    fullSpectrum: { name: 'Полный спектр', cond: 'За один удар забить хотя бы по одному красному, синему и жёлтому шару.',
      unlock: { artifact: 'prism' } },
    clubCash: { name: 'Касса клуба', cond: 'Иметь не менее 10 монет одновременно.',
      unlock: { artifact: 'goldvein' } },
    cleanCloth: { name: 'Чистое сукно', cond: 'После удара на столе не осталось цветных шаров, включая временные копии.',
      unlock: { material: 'crystal' } }
  };
  var achievementOrder = ['twoPockets', 'fullSpectrum', 'clubCash', 'cleanCloth'];

  var base = {
    artifacts: ['echo', 'bumper', 'cascade', 'shockwave', 'capital', 'sniper', 'railmaster', 'carom', 'softhand', 'ram', 'daredevil'],
    materials: ['normal', 'gold'],
    effects: ['none', 'explosive']
  };

  // Content pool for a new run, frozen at start (§12.1).
  function poolFor(profile, dev) {
    var p = { artifacts: base.artifacts.slice(), materials: base.materials.slice(), effects: base.effects.slice() };
    achievementOrder.forEach(function (k) {
      if (!dev && !(profile && profile.achievements && profile.achievements[k])) return;
      var u = achievements[k].unlock;
      if (u.artifact && p.artifacts.indexOf(u.artifact) < 0) p.artifacts.push(u.artifact);
      if (u.material && p.materials.indexOf(u.material) < 0) p.materials.push(u.material);
    });
    return p;
  }

  function ballLabel(b) {
    return C.colorNamesF[b.color] + ' / ' + C.materials[b.material].name + ' / ' + C.effects[b.effect].name;
  }

  return {
    artifacts: artifacts, artifactOrder: artifactOrder,
    achievements: achievements, achievementOrder: achievementOrder,
    base: base, poolFor: poolFor, ballLabel: ballLabel
  };
})();
