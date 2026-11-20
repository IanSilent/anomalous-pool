// Prepared loose racks (§6.6). Each variant lists more slots than the largest deck,
// ordered so that any prefix spreads balls over the variant's groups.
var AP = AP || {};

AP.Layouts = (function () {
  var V = [
    { family: 'Веер', id: 'fanA', slots: [
      [920, 75], [90, 80], [640, 250], [680, 226], [680, 274], [920, 425], [90, 420],
      [720, 250], [500, 62], [600, 226], [600, 274], [500, 438], [720, 202], [720, 298]] },
    { family: 'Веер', id: 'fanB', slots: [
      [860, 110], [150, 410], [700, 250], [720, 215], [720, 285], [860, 390], [430, 120],
      [740, 250], [660, 250], [150, 90], [680, 215], [680, 285], [430, 380], [760, 215]] },
    { family: 'Три группы', id: 'groupsA', slots: [
      [800, 110], [800, 390], [520, 250], [840, 135], [840, 365], [560, 226], [840, 88],
      [840, 412], [560, 274], [800, 155], [800, 345], [600, 250], [880, 112], [880, 388]] },
    { family: 'Три группы', id: 'groupsB', slots: [
      [470, 85], [860, 230], [130, 420], [530, 85], [900, 270], [170, 445], [500, 125],
      [860, 310], [165, 395], [560, 125], [910, 215], [205, 430], [440, 125], [910, 320]] },
    { family: 'Бортовая', id: 'railA', slots: [
      [380, 40], [640, 40], [380, 460], [640, 460], [960, 175], [960, 325], [820, 250],
      [700, 200], [700, 300], [560, 250], [860, 120], [860, 380], [300, 460], [520, 140]] },
    { family: 'Бортовая', id: 'railB', slots: [
      [450, 40], [720, 40], [450, 460], [720, 460], [960, 250], [880, 170], [880, 330],
      [600, 250], [640, 210], [640, 290], [780, 250], [320, 40], [320, 460], [960, 120]] }
  ];
  var JITTER = 3;

  function variantFor(seed, roundIndex, rack) {
    if (roundIndex === 0 && rack === 0) return V[0];   // first table: easy direct pots plus a group
    var r = AP.Rng.stream(seed, 'layout', roundIndex, rack);
    return V[r.int(V.length)];
  }

  // balls: array of { id } (permanent deck order). Returns { variant, mirrorX, mirrorY, cue:{x,y}, pos:{id:{x,y}} }
  function build(balls, seed, roundIndex, rack, forceVariant) {
    var T = AP.CFG.table;
    var v = forceVariant || variantFor(seed, roundIndex, rack);
    var r = AP.Rng.stream(seed, 'rack', roundIndex, rack);
    var mx = r() < 0.5, my = r() < 0.5;
    if (roundIndex === 0 && rack === 0) mx = false;
    var order = r.shuffle(balls.map(function (b) { return b.id; }));
    var pos = {};
    for (var i = 0; i < order.length; i++) {
      var s = v.slots[i % v.slots.length];
      var x = s[0] + (r() * 2 - 1) * JITTER, y = s[1] + (r() * 2 - 1) * JITTER;
      if (mx) x = T.w - x;
      if (my) y = T.h - y;
      pos[order[i]] = { x: x, y: y };
    }
    var cx = T.cueStart.x, cy = T.cueStart.y;
    if (mx) cx = T.w - cx;
    return { variant: v, mirrorX: mx, mirrorY: my, cue: { x: cx, y: cy }, pos: pos };
  }

  return { variants: V, build: build, variantFor: variantFor };
})();
