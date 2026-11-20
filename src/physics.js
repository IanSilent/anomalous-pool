// Table geometry and the deterministic ball simulation. No game rules here:
// the step reports pockets, contacts and rail touches; Rules decides what they mean.
var AP = AP || {};

AP.Physics = (function () {
  var T = AP.CFG.table;

  // Pocket ids: 0 top-left, 1 top-middle, 2 top-right, 3 bottom-left, 4 bottom-middle, 5 bottom-right.
  function makeTable(closedPocket) {
    var W = T.w, H = T.h, cg = T.cornerGap, sg = T.sideGap, j = T.jaw;
    var co = T.cornerPocket.off, so = T.sidePocket.off;
    var pockets = [
      { id: 0, x: co, y: co, r: T.cornerPocket.r, corner: true },
      { id: 1, x: W / 2, y: so, r: T.sidePocket.r, corner: false },
      { id: 2, x: W - co, y: co, r: T.cornerPocket.r, corner: true },
      { id: 3, x: co, y: H - co, r: T.cornerPocket.r, corner: true },
      { id: 4, x: W / 2, y: H - so, r: T.sidePocket.r, corner: false },
      { id: 5, x: W - co, y: H - co, r: T.cornerPocket.r, corner: true }
    ];
    var segs = [];
    function rail(ax, ay, bx, by) { segs.push({ ax: ax, ay: ay, bx: bx, by: by, rail: true }); }
    function jaw(ax, ay, bx, by) { segs.push({ ax: ax, ay: ay, bx: bx, by: by, rail: false }); }
    // long rails (top/bottom split by side pockets) and short rails
    rail(cg, 0, W / 2 - sg, 0); rail(W / 2 + sg, 0, W - cg, 0);
    rail(cg, H, W / 2 - sg, H); rail(W / 2 + sg, H, W - cg, H);
    rail(0, cg, 0, H - cg); rail(W, cg, W, H - cg);
    // corner jaws angle into the pocket
    var d = j * 0.75;
    jaw(cg, 0, cg - d, -j); jaw(0, cg, -j, cg - d);
    jaw(W - cg, 0, W - cg + d, -j); jaw(W, cg, W + j, cg - d);
    jaw(cg, H, cg - d, H + j); jaw(0, H - cg, -j, H - cg + d);
    jaw(W - cg, H, W - cg + d, H + j); jaw(W, H - cg, W + j, H - cg + d);
    // side jaws
    jaw(W / 2 - sg, 0, W / 2 - sg + 4, -j); jaw(W / 2 + sg, 0, W / 2 + sg - 4, -j);
    jaw(W / 2 - sg, H, W / 2 - sg + 4, H + j); jaw(W / 2 + sg, H, W / 2 + sg - 4, H + j);

    if (closedPocket != null) {
      var p = pockets[closedPocket];
      p.closed = true;
      var cx = p.x < W / 2 ? 0 : W, cy = p.y < H / 2 ? 0 : H;
      if (p.corner) rail(cx === 0 ? cg : W - cg, cy, cx, cy === 0 ? cg : H - cg);
      else rail(W / 2 - sg, cy, W / 2 + sg, cy);
    }
    return { w: W, h: H, pockets: pockets, segs: segs, closed: closedPocket == null ? null : closedPocket };
  }

  function makeBall(props) {
    var b = {
      id: props.id, kind: props.kind || 'color',
      x: props.x, y: props.y, vx: 0, vy: 0, r: T.ballR,
      color: props.color || null, material: props.material || 'normal', effect: props.effect || 'none',
      value: props.value || 0, isCopy: !!props.isCopy, srcId: props.srcId || null,
      onTable: true, rail: false, chain: false, touched: false
    };
    return b;
  }

  function newWorld(table, balls) {
    return { table: table, balls: balls, time: 0 };
  }

  function cloneWorld(w) {
    return {
      table: w.table, time: w.time,
      balls: w.balls.map(function (b) {
        var c = {}; for (var k in b) c[k] = b[k]; return c;
      })
    };
  }

  function cue(w) {
    for (var i = 0; i < w.balls.length; i++) if (w.balls[i].kind === 'cue') return w.balls[i];
    return null;
  }

  function moving(w) {
    for (var i = 0; i < w.balls.length; i++) {
      var b = w.balls[i];
      if (b.onTable && (b.vx !== 0 || b.vy !== 0)) return true;
    }
    return false;
  }

  function resetShotFlags(w) {
    w.balls.forEach(function (b) { b.rail = false; b.chain = false; b.touched = false; });
  }

  // One fixed step. Returns { pockets:[{ball,pocket,x,y}], hits:[{a,b,speed}], rails:[{ball,speed}] }.
  function step(w, dt) {
    var balls = w.balls, tb = w.table, out = { pockets: [], hits: [], rails: [] };
    var i, k, b;
    w.time += dt;

    // 1. integrate with rolling resistance
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (!b.onTable || (b.vx === 0 && b.vy === 0)) continue;
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      var ns = sp - T.decel * dt;
      if (ns <= T.stopSpeed) { b.vx = 0; b.vy = 0; continue; }
      var f = ns / sp;
      b.vx *= f; b.vy *= f;
      b.x += b.vx * dt; b.y += b.vy * dt;
    }

    // 2. cushions and jaws (segments with rounded ends)
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (!b.onTable) continue;
      for (k = 0; k < tb.segs.length; k++) {
        var s = tb.segs[k];
        var ex = s.bx - s.ax, ey = s.by - s.ay;
        var t0 = ((b.x - s.ax) * ex + (b.y - s.ay) * ey) / (ex * ex + ey * ey);
        var t = t0 < 0 ? 0 : t0 > 1 ? 1 : t0;
        var px = s.ax + ex * t, py = s.ay + ey * t;
        var dx = b.x - px, dy = b.y - py;
        var d2 = dx * dx + dy * dy;
        if (d2 >= b.r * b.r || d2 === 0) continue;
        var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        b.x += nx * (b.r - d); b.y += ny * (b.r - d);
        var vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= (1 + T.cushionE) * vn * nx;
          b.vy -= (1 + T.cushionE) * vn * ny;
          // a touch on the knuckle at a pocket mouth is not a bank shot
          if (s.rail && t0 > 0 && t0 < 1) b.rail = true;
          out.rails.push({ ball: b, speed: -vn, rail: s.rail });
        }
      }
    }

    // 3. ball-ball, stable pair order
    for (i = 0; i < balls.length; i++) {
      var a = balls[i];
      if (!a.onTable) continue;
      for (k = i + 1; k < balls.length; k++) {
        var c = balls[k];
        if (!c.onTable) continue;
        var ddx = c.x - a.x, ddy = c.y - a.y, rr = a.r + c.r;
        var dd2 = ddx * ddx + ddy * ddy;
        if (dd2 >= rr * rr) continue;
        var dist = Math.sqrt(dd2) || 0.0001;
        var nnx = ddx / dist, nny = ddy / dist;
        var over = (rr - dist) / 2;
        a.x -= nnx * over; a.y -= nny * over;
        c.x += nnx * over; c.y += nny * over;
        var rel = (a.vx - c.vx) * nnx + (a.vy - c.vy) * nny;
        if (rel > 0) {
          var imp = (1 + T.ballE) / 2 * rel;
          a.vx -= imp * nnx; a.vy -= imp * nny;
          c.vx += imp * nnx; c.vy += imp * nny;
          a.touched = true; c.touched = true;
          if (a.kind === 'color' && c.kind === 'color') { a.chain = true; c.chain = true; }
          out.hits.push({ a: a, b: c, speed: rel });
        }
      }
    }

    // 4. pockets: inside a capture circle, or escaped past a rail line through a mouth
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (!b.onTable) continue;
      var hit = null;
      for (k = 0; k < tb.pockets.length; k++) {
        var p = tb.pockets[k];
        if (p.closed) continue;
        var qx = b.x - p.x, qy = b.y - p.y;
        if (qx * qx + qy * qy < p.r * p.r) { hit = p; break; }
      }
      if (!hit && (b.x < -b.r || b.y < -b.r || b.x > tb.w + b.r || b.y > tb.h + b.r)) hit = nearestPocket(tb, b.x, b.y);
      if (hit) {
        out.pockets.push({ ball: b, pocket: hit, x: b.x, y: b.y });
        b.onTable = false; b.vx = 0; b.vy = 0;
      }
    }
    return out;
  }

  function nearestPocket(tb, x, y) {
    var best = null, bd = Infinity;
    tb.pockets.forEach(function (p) {
      if (p.closed) return;
      var d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bd) { bd = d; best = p; }
    });
    return best;
  }

  // Is a ball centre at (x,y) a legal resting point? (inside the cloth, clear of pockets and other balls)
  function freeSpot(w, x, y, ignore, extra) {
    var tb = w.table, r = T.ballR, gap = extra || 1;
    if (x < r + 2 || y < r + 2 || x > tb.w - r - 2 || y > tb.h - r - 2) return false;
    for (var k = 0; k < tb.pockets.length; k++) {
      var p = tb.pockets[k];
      var qx = x - p.x, qy = y - p.y, rr = p.r + r + 4;
      if (qx * qx + qy * qy < rr * rr) return false;
    }
    for (var i = 0; i < w.balls.length; i++) {
      var b = w.balls[i];
      if (!b.onTable || b === ignore) continue;
      var dx = b.x - x, dy = b.y - y, md = 2 * r + gap;
      if (dx * dx + dy * dy < md * md) return false;
    }
    return true;
  }

  // Deterministic spiral search for the nearest legal point to (x,y).
  function nearestFree(w, x, y, ignore, extra) {
    var tb = w.table, r = T.ballR;
    var sx = Math.min(Math.max(x, r + 3), tb.w - r - 3), sy = Math.min(Math.max(y, r + 3), tb.h - r - 3);
    if (freeSpot(w, sx, sy, ignore, extra)) return { x: sx, y: sy };
    for (var ring = 1; ring < 80; ring++) {
      var rad = ring * 6, n = 8 + ring * 4;
      for (var a = 0; a < n; a++) {
        var ang = (a / n) * Math.PI * 2;
        var px = sx + Math.cos(ang) * rad, py = sy + Math.sin(ang) * rad;
        if (freeSpot(w, px, py, ignore, extra)) return { x: px, y: py };
      }
    }
    return null;
  }

  // Prediction with the same step: run the real simulation on a copy and record
  // the cue path until its first ball contact (§6.2).
  function predict(w, angle, speed, opts) {
    opts = opts || {};
    var sim = cloneWorld(w);
    var c = cue(sim);
    if (!c) return null;
    resetShotFlags(sim);
    c.vx = Math.cos(angle) * speed; c.vy = Math.sin(angle) * speed;
    var path = [{ x: c.x, y: c.y }], bounces = 0, res = { path: path, contact: null, end: 'stop' };
    var maxSteps = Math.ceil((opts.maxTime || 6) / T.dt), lastRec = 0;
    for (var n = 0; n < maxSteps; n++) {
      var ev = step(sim, T.dt);
      var railHit = ev.rails.some(function (r) { return r.ball === c; });
      if (railHit) { bounces++; path.push({ x: c.x, y: c.y, bounce: true }); }
      if (!c.onTable) { path.push({ x: c.x, y: c.y }); res.end = 'pocket'; break; }
      var hit = null;
      for (var h = 0; h < ev.hits.length; h++) {
        if (ev.hits[h].a === c || ev.hits[h].b === c) { hit = ev.hits[h]; break; }
      }
      if (hit) {
        var t = hit.a === c ? hit.b : hit.a;
        path.push({ x: c.x, y: c.y });
        res.contact = {
          ballId: t.id, x: c.x, y: c.y, tx: t.x, ty: t.y,
          tvx: t.vx, tvy: t.vy, cvx: c.vx, cvy: c.vy
        };
        res.end = 'contact';
        // also follow the struck ball a little: its first segment up to a rail or pocket
        var tpath = [{ x: t.x, y: t.y }];
        for (var m = 0; m < 2400; m++) {
          var ev2 = step(sim, T.dt);
          if (!t.onTable) { tpath.push({ x: t.x, y: t.y, pocket: true }); break; }
          if (ev2.rails.some(function (r) { return r.ball === t; }) || ev2.hits.some(function (q) { return q.a === t || q.b === t; })) {
            tpath.push({ x: t.x, y: t.y }); break;
          }
          if (t.vx === 0 && t.vy === 0) { tpath.push({ x: t.x, y: t.y }); break; }
        }
        if (tpath.length === 1) tpath.push({ x: t.x, y: t.y });
        res.targetPath = tpath;
        break;
      }
      if (bounces > (opts.maxBounces || 2)) { res.end = 'bounces'; break; }
      if (c.vx === 0 && c.vy === 0) { path.push({ x: c.x, y: c.y }); res.end = 'stop'; break; }
      if (n - lastRec > 12) { lastRec = n; }
    }
    if (res.end === 'bounces') path.push({ x: c.x, y: c.y });
    return res;
  }

  return {
    makeTable: makeTable, makeBall: makeBall, newWorld: newWorld, cloneWorld: cloneWorld,
    cue: cue, moving: moving, step: step, resetShotFlags: resetShotFlags,
    freeSpot: freeSpot, nearestFree: nearestFree, predict: predict, nearestPocket: nearestPocket
  };
})();
