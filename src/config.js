// All tunable numbers live here (design doc §16.2). Values are first-test guesses, not balance.
var AP = AP || {};

AP.VERSION = '0.2.0';

AP.CFG = {
  table: {
    w: 1000, h: 500,           // playfield in world units (2:1)
    ballR: 13,
    cornerGap: 52,             // cushion starts this far from a corner along each rail
    sideGap: 30,               // half-width of a side pocket mouth
    cornerPocket: { off: 0, r: 36 },  // pocket centre sits slightly outside the corner
    sidePocket: { off: -11, r: 27 },
    jaw: 12,                   // length of the angled jaw segments
    cushionE: 0.75,            // restitution against rails
    ballE: 0.95,               // restitution ball-ball
    decel: 220,                // rolling resistance, units/s² (was 300; balls now travel further)
    stopSpeed: 5,
    dt: 1 / 480,               // fixed simulation step
    cueStart: { x: 250, y: 250 }
  },
  power: { weak: 520, medium: 950, strong: 1500 },
  powerOrder: ['weak', 'medium', 'strong'],
  powerNames: { weak: 'Слабый', medium: 'Средний', strong: 'Сильный' },

  ballBaseValue: 10,
  shotsPerRound: 5,
  roundsPerAct: 3,
  actsMain: 2,               // prototype: 2 acts, 6 rounds. Full game: 3 / 9.
  // Design doc §5.1 starts at 40, 100, 180, 320, 550, 900. Lowered after bot runs and the first
  // playtest ("hard to reach the boss"), see STATUS.md.
  targets: [30, 60, 100, 180, 280, 440, 1600, 2800, 5000],
  endlessMult: 1.8,

  combos: {                  // priority on ties: triple → spectrum → pair → single
    triple: { name: 'Тройка', mult: 5 },
    spectrum: { name: 'Спектр', mult: 4 },
    pair: { name: 'Пара', mult: 3 },
    single: { name: 'Одиночный', mult: 1 }
  },
  comboOrder: ['triple', 'spectrum', 'pair', 'single'],
  tricks: {
    rail: { name: 'Дуплет', bonus: 1 },
    chain: { name: 'Цепочка', bonus: 1 },
    pockets: { name: 'Разные лузы', bonus: 1 }
  },

  colors: ['red', 'blue', 'yellow'],
  colorNames: { red: 'красный', blue: 'синий', yellow: 'жёлтый' },
  colorNamesF: { red: 'Красный', blue: 'Синий', yellow: 'Жёлтый' },

  materials: {
    normal: { name: 'обычный', mult: 1, coins: 0 },
    gold: { name: 'золотой', mult: 1, coins: 1 },
    crystal: { name: 'хрустальный', mult: 2, coins: 0 }
  },
  effects: {
    none: { name: 'без эффекта' },
    explosive: { name: 'взрывной' }
  },

  // speed added at the centre; edge = share left at the rim. Tuned so one explosion pockets
  // about 0.4 extra balls on average (was 0.01 at radius 170 / impulse 620).
  wave: { radius: 300, impulse: 1500, edge: 0.5 },

  art: {
    echoColor: 'red',
    bumperPerBall: 1,
    goldVeinCoins: 1,
    cascadeStep: 5,
    capitalPer: 5, capitalMax: 5,
    sniperBonus: 3,            // Снайпер: exactly one ball pocketed
    railmasterBonus: 2,        // Мастер борта: on top of Дуплет's +1
    caromBonus: 2,             // Карамболь: on top of Цепочка's +1
    softBonus: 3,              // Мягкая рука: weak shots
    ramProd: 1.5,              // Таран: strong shots, × to the total
    daredevilValue: 15, daredevilMult: 2   // Дерзкий биток: the cue ball in a pocket scores
  },

  economy: {
    startCoins: 4, winCoins: 3, perShotLeft: 1, maxShotBonus: 3,
    fallbackCoins: 5, valueUp: 5,
    prices: { artifact: 5, ball: 4, mod: 3, remove: 3, sell: 2, refresh: 2, refreshStep: 1 }
  },
  deck: { min: 6, max: 12 },
  artifactSlots: 5,

  bosses: {
    closed: { name: 'Закрытый карман', targetMult: 1, rule: 'Отмеченная луза закрыта весь раунд и работает как борт.' },
    rails: { name: 'Бортовой контроль', targetMult: 0.6, rule: 'Шар приносит очки, только если в этом ударе коснулся борта до лузы. Остальные шары не участвуют в счёте.' },
    short: { name: 'Короткая партия', targetMult: 0.75, shotsDelta: -2, rule: 'На два удара меньше. Цель снижена под это ограничение.' },
    shift: { name: 'Смена приоритетов', targetMult: 1, rule: 'Каждый удар один показанный цвет получает ×2 ценности.' }
  },
  bossOrder: ['closed', 'rails', 'short', 'shift'],
  firstActBosses: ['closed', 'short', 'shift'],   // «Бортовой контроль» needs bank shots: from act 2 on

  limits: { maxEffects: 200, maxShotTime: 45 },  // emergency chain limit (§13)

  anim: { stepsPerFrame: 8, fastMult: 4, lineDelay: 0.16 },
  assist: { snapDeg: 3 },     // aim assist: a pointer within this angle of a potting aim snaps to it

  maxScore: Number.MAX_SAFE_INTEGER
};
