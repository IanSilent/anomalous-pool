// Canvas drawing only. Reads the world and UI state, never changes game state.
var AP = AP || {};

AP.Render = (function () {
  var C = AP.CFG, T = C.table;
  var VIEW = { x: -78, y: -78, w: T.w + 156, h: T.h + 156 };
  var RAIL = 40;
  var COL = { red: '#e0453a', blue: '#3c7fe6', yellow: '#f0c22e' };
  var COL_HI = { red: '#ff9a8f', blue: '#9cc2ff', yellow: '#fff2ae' };
  var COL_LO = { red: '#7d1a13', blue: '#173a7d', yellow: '#8a6a08' };
  var view = { s: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };
  var cache = { cloth: null, clothKey: '', cracks: null, crackSeed: null };

  function fit(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    }
    var s = Math.min(cw / VIEW.w, ch / VIEW.h);
    view.s = s; view.dpr = dpr; view.w = cw; view.h = ch;
    view.ox = (cw - VIEW.w * s) / 2 - VIEW.x * s;
    view.oy = (ch - VIEW.h * s) / 2 - VIEW.y * s;
  }
  function toWorld(px, py) { return { x: (px - view.ox) / view.s, y: (py - view.oy) / view.s }; }
  function toScreen(x, y) { return { x: x * view.s + view.ox, y: y * view.s + view.oy }; }

  // ---------- static layers ----------
  function clothPattern(ctx) {
    var key = Math.round(view.s * 100) + ':' + view.dpr;
    if (cache.cloth && cache.clothKey === key) return cache.cloth;
    var c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = '#1d6b5f'; g.fillRect(0, 0, 128, 128);
    var img = g.getImageData(0, 0, 128, 128), d = img.data;
    var r = AP.Rng.make(7);
    for (var i = 0; i < d.length; i += 4) {
      var n = (r() - 0.5) * 14;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    cache.cloth = ctx.createPattern(c, 'repeat'); cache.clothKey = key;
    return cache.cloth;
  }

  function cracks(seed) {
    if (cache.cracks && cache.crackSeed === seed) return cache.cracks;
    var r = AP.Rng.make(seed || 1), list = [];
    for (var i = 0; i < 14; i++) {
      // start on the room edge around the table
      var side = r.int(4), x, y;
      if (side === 0) { x = VIEW.x + r() * VIEW.w; y = VIEW.y + r() * 30; }
      else if (side === 1) { x = VIEW.x + r() * VIEW.w; y = VIEW.y + VIEW.h - r() * 30; }
      else if (side === 2) { x = VIEW.x + r() * 30; y = VIEW.y + r() * VIEW.h; }
      else { x = VIEW.x + VIEW.w - r() * 30; y = VIEW.y + r() * VIEW.h; }
      var pts = [[x, y]], ang = Math.atan2(T.h / 2 - y, T.w / 2 - x) + (r() - 0.5) * 1.2;
      var n = 4 + r.int(5);
      for (var k = 0; k < n; k++) {
        ang += (r() - 0.5) * 1.1;
        x += Math.cos(ang) * (14 + r() * 22); y += Math.sin(ang) * (14 + r() * 22);
        pts.push([x, y]);
      }
      list.push({ pts: pts, hue: r() < 0.5 ? 'anom' : 'anom2', phase: r() * 6.28, tier: i < 3 ? 0 : i < 8 ? 1 : 2 });
    }
    cache.cracks = list; cache.crackSeed = seed;
    return list;
  }

  // ---------- main draw ----------
  function draw(ctx, st) {
    var canvas = ctx.canvas;
    fit(canvas);
    var s = view.s, now = st.now;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    // room
    var bg = ctx.createRadialGradient(view.w / 2, view.h / 2, 10, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.75);
    bg.addColorStop(0, '#2a1f16'); bg.addColorStop(0.55, '#140f0b'); bg.addColorStop(1, '#070504');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, view.w, view.h);

    var sx = 0, sy = 0;
    if (st.shake > 0 && !st.reduceFx) { sx = (Math.random() - 0.5) * st.shake; sy = (Math.random() - 0.5) * st.shake; }
    ctx.setTransform(view.dpr * s, 0, 0, view.dpr * s, view.dpr * (view.ox + sx), view.dpr * (view.oy + sy));

    var anom = st.anomaly || 0;
    drawRoomAnomalies(ctx, st, anom, now);
    drawTable(ctx, st, anom, now);
    if (st.world) {
      drawZones(ctx, st, now);
      if (st.aim && st.aim.pred && st.canAim) drawPrediction(ctx, st, now);
      drawBalls(ctx, st, now);
      if (st.aim && st.canAim) drawCueStick(ctx, st, now);
    }
    drawEffects(ctx, st, now);
    // lamp light pool over everything (warm, slightly flickering)
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    var flick = 1;
    if (!st.reduceFx && anom > 0) flick = 1 - 0.12 * Math.max(0, Math.sin(now * 13.1) * Math.sin(now * 3.7) - 0.6) * anom;
    var c = toScreen(T.w / 2, T.h / 2);
    var lg = ctx.createRadialGradient(c.x, c.y - 40 * s, 30 * s, c.x, c.y, 760 * s);
    lg.addColorStop(0, 'rgba(255,214,150,' + (0.10 * flick) + ')');
    lg.addColorStop(0.5, 'rgba(255,190,110,0.03)');
    lg.addColorStop(1, 'rgba(0,0,0,' + (0.42 + (1 - flick)) + ')');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, view.w, view.h);
  }

  function drawRoomAnomalies(ctx, st, anom, now) {
    // chalk notes on the floor margin
    if (st.chalk) {
      ctx.save();
      ctx.fillStyle = 'rgba(232,239,233,0.33)';
      ctx.font = 'italic 20px "Comic Sans MS", "Chalkboard SE", cursive';
      ctx.fillText(st.chalk, -RAIL + 4, -RAIL - 14);
      ctx.restore();
    }
    if (anom <= 0.01) return;
    var list = cracks(st.seed);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    list.forEach(function (cr) {
      if (cr.tier > anom * 1.6) return;
      var pulse = st.reduceFx ? 0.7 : 0.55 + 0.45 * Math.sin(now * 1.7 + cr.phase);
      var col = cr.hue === 'anom' ? '255,63,208' : '57,240,255';
      ctx.strokeStyle = 'rgba(' + col + ',' + (0.12 * pulse * Math.min(1.5, anom)) + ')';
      ctx.lineWidth = 9;
      path(ctx, cr.pts); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + col + ',' + (0.55 * pulse * Math.min(1, anom)) + ')';
      ctx.lineWidth = 1.6;
      path(ctx, cr.pts); ctx.stroke();
    });
    // a wrong reflection of the table, slightly offset
    if (anom >= 1) {
      var a = Math.min(0.16, 0.06 * anom);
      var off = st.reduceFx ? 10 : 10 + Math.sin(now * 0.7) * 6;
      ctx.strokeStyle = 'rgba(57,240,255,' + a + ')'; ctx.lineWidth = 3;
      ctx.strokeRect(-RAIL + off, -RAIL - off * 0.6, T.w + RAIL * 2, T.h + RAIL * 2);
      ctx.strokeStyle = 'rgba(255,63,208,' + a + ')';
      ctx.strokeRect(-RAIL - off, -RAIL + off * 0.6, T.w + RAIL * 2, T.h + RAIL * 2);
    }
    ctx.restore();
  }

  function path(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawTable(ctx, st, anom, now) {
    var tb = st.world ? st.world.table : AP.Physics.makeTable(null);
    // shadow + wooden frame
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
    rr(ctx, -RAIL - 8, -RAIL - 8, T.w + 2 * RAIL + 16, T.h + 2 * RAIL + 16, 26);
    var wood = ctx.createLinearGradient(0, -RAIL, 0, T.h + RAIL);
    wood.addColorStop(0, '#5a3520'); wood.addColorStop(0.5, '#3b2113'); wood.addColorStop(1, '#2a170d');
    ctx.fillStyle = wood; ctx.fill();
    ctx.restore();
    // brass trim
    ctx.strokeStyle = '#8c6a2a'; ctx.lineWidth = 2;
    rr(ctx, -RAIL - 4, -RAIL - 4, T.w + 2 * RAIL + 8, T.h + 2 * RAIL + 8, 22); ctx.stroke();
    // cushions (slightly darker cloth strip)
    ctx.fillStyle = '#15564c';
    ctx.fillRect(-14, -14, T.w + 28, T.h + 28);
    // cloth
    ctx.fillStyle = clothPattern(ctx);
    ctx.fillRect(0, 0, T.w, T.h);
    var cg = ctx.createRadialGradient(T.w / 2, T.h / 2, 60, T.w / 2, T.h / 2, 620);
    cg.addColorStop(0, 'rgba(255,230,170,0.10)'); cg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = cg; ctx.fillRect(0, 0, T.w, T.h);
    // head string & spot (faint)
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(250, 0); ctx.lineTo(250, T.h); ctx.moveTo(750, 0); ctx.lineTo(750, T.h); ctx.stroke();
    // diamonds
    ctx.fillStyle = '#e6c27a';
    [125, 250, 375, 625, 750, 875].forEach(function (x) { diamond(ctx, x, -RAIL / 2 - 4); diamond(ctx, x, T.h + RAIL / 2 + 4); });
    [125, 250, 375].forEach(function (y) { diamond(ctx, -RAIL / 2 - 4, y); diamond(ctx, T.w + RAIL / 2 + 4, y); });
    // rail edges (visible cushion lines)
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    tb.segs.forEach(function (sg) {
      if (!sg.rail) return;
      ctx.beginPath(); ctx.moveTo(sg.ax, sg.ay); ctx.lineTo(sg.bx, sg.by); ctx.stroke();
    });
    // anomaly: chromatic edge on the cushions
    if (anom >= 1 && !st.reduceFx) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,63,208,0.10)'; ctx.lineWidth = 2;
      ctx.strokeRect(-2, -1, T.w + 4, T.h + 2);
      ctx.strokeStyle = 'rgba(57,240,255,0.10)';
      ctx.strokeRect(2, 1, T.w - 4, T.h - 2);
      ctx.restore();
    }
    // pockets
    tb.pockets.forEach(function (p) {
      var px = p.corner ? (p.x < T.w / 2 ? -8 : T.w + 8) : p.x;
      var py = p.corner ? (p.y < T.h / 2 ? -8 : T.h + 8) : (p.y < T.h / 2 ? -14 : T.h + 14);
      var pr = p.corner ? 30 : 25;
      ctx.beginPath(); ctx.arc(px, py, pr + 5, 0, Math.PI * 2);
      ctx.fillStyle = '#a07a33'; ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2);
      var pg = ctx.createRadialGradient(px, py, 2, px, py, pr);
      pg.addColorStop(0, '#000'); pg.addColorStop(1, '#16100b');
      ctx.fillStyle = pg; ctx.fill();
      if (p.closed) {
        ctx.save();
        ctx.beginPath(); ctx.arc(px, py, pr + 3, 0, Math.PI * 2);
        ctx.fillStyle = '#6b5226'; ctx.fill();
        ctx.strokeStyle = '#ff9fe6'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(px - 11, py - 11); ctx.lineTo(px + 11, py + 11); ctx.moveTo(px + 11, py - 11); ctx.lineTo(px - 11, py + 11); ctx.stroke();
        var pulse = st.reduceFx ? 0.5 : 0.35 + 0.25 * Math.sin(now * 3);
        ctx.strokeStyle = 'rgba(255,63,208,' + pulse + ')'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(px, py, pr + 9, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    });
  }

  function diamond(ctx, x, y) {
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.closePath(); ctx.fill();
  }

  // ---------- balls ----------
  function glyph(ctx, color, x, y, r) {
    ctx.beginPath();
    if (color === 'red') { ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.9, y + r * 0.65); ctx.lineTo(x - r * 0.9, y + r * 0.65); ctx.closePath(); }
    else if (color === 'blue') { ctx.rect(x - r * 0.72, y - r * 0.72, r * 1.44, r * 1.44); }
    else { ctx.arc(x, y, r * 0.78, 0, Math.PI * 2); }
    ctx.fill();
  }

  function drawBall(ctx, b, now, opts) {
    opts = opts || {};
    var x = b.x, y = b.y, r = b.r || T.ballR;
    ctx.save();
    if (b.isCopy) ctx.globalAlpha = 0.85;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x + 3, y + 4, r, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    if (b.kind === 'cue') {
      var g0 = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 1, x, y, r);
      g0.addColorStop(0, '#ffffff'); g0.addColorStop(0.6, '#efe8d8'); g0.addColorStop(1, '#a89c86');
      ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d33'; ctx.beginPath(); ctx.arc(x + r * 0.15, y + r * 0.1, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore(); return;
    }
    // explosive: pulsing outer ring
    if (b.effect === 'explosive') {
      var pulse = opts.reduceFx ? 0.6 : 0.5 + 0.5 * Math.sin(now * 5 + b.id);
      ctx.strokeStyle = 'rgba(255,140,40,' + (0.45 + 0.4 * pulse) + ')';
      ctx.lineWidth = 2.2; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(x, y, r + 4 + pulse * 1.5, now * 1.5, now * 1.5 + Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 1, x, y, r);
    g.addColorStop(0, COL_HI[b.color]); g.addColorStop(0.55, COL[b.color]); g.addColorStop(1, COL_LO[b.color]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    // material ring
    if (b.material === 'gold') {
      ctx.strokeStyle = '#ffd66b'; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.arc(x, y, r - 1.4, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#8a5f12'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r + 0.2, 0, Math.PI * 2); ctx.stroke();
    } else if (b.material === 'crystal') {
      ctx.strokeStyle = 'rgba(210,250,255,0.95)'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(x, y, r - 1.2, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.moveTo(x - r * 0.2, y - r * 0.85); ctx.lineTo(x + r * 0.45, y - r * 0.35); ctx.lineTo(x - r * 0.05, y - r * 0.3); ctx.closePath(); ctx.fill();
    }
    // centre disc with colour glyph (readable without hue)
    ctx.fillStyle = 'rgba(255,255,255,0.93)';
    ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL_LO[b.color];
    glyph(ctx, b.color, x, y + (b.color === 'red' ? 0.6 : 0), r * 0.3);
    if (b.material === 'gold') { ctx.fillStyle = '#ffd66b'; ctx.beginPath(); ctx.arc(x + r * 0.62, y - r * 0.62, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#7a520c'; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('¤', x + r * 0.62, y - r * 0.6); }
    if (b.effect === 'explosive') { ctx.fillStyle = '#ff8c28'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✸', x - r * 0.62, y - r * 0.62); }
    // specular
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(x - r * 0.38, y - r * 0.45, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2); ctx.fill();
    if (b.isCopy) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(x, y, r + 2.5, -now * 2, -now * 2 + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    if (opts.priority) {
      ctx.strokeStyle = 'rgba(255,159,230,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.stroke();
    }
    if (opts.hover) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawBalls(ctx, st, now) {
    st.world.balls.forEach(function (b) {
      if (!b.onTable) return;
      drawBall(ctx, b, now, { reduceFx: st.reduceFx, hover: st.hoverBall === b.id && b.kind !== 'cue', priority: st.priorityColor && b.color === st.priorityColor });
    });
  }

  function drawZones(ctx, st, now) {
    // hovering an explosive ball shows its wave radius (centred where a pocketed ball would be)
    var hb = st.hoverBall != null ? st.world.balls.filter(function (b) { return b.id === st.hoverBall && b.onTable; })[0] : null;
    if (hb && hb.effect === 'explosive') zone(ctx, hb.x, hb.y, 'rgba(255,140,40,', now, st);
  }
  function zone(ctx, x, y, col, now, st) {
    ctx.save();
    ctx.fillStyle = col + '0.07)'; ctx.strokeStyle = col + '0.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = st.reduceFx ? 0 : -now * 20;
    ctx.beginPath(); ctx.arc(x, y, C.wave.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawPrediction(ctx, st, now) {
    var pr = st.aim.pred, pts = pr.path;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // cue path
    ctx.strokeStyle = 'rgba(255,250,235,0.85)'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    pts.forEach(function (p) { if (p.bounce) { ctx.fillStyle = 'rgba(255,250,235,0.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); } });
    var last = pts[pts.length - 1];
    if (pr.contact) {
      var ct = pr.contact;
      // ghost ball
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(ct.x, ct.y, T.ballR, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      var target = st.world.balls.filter(function (b) { return b.id === ct.ballId; })[0];
      // struck ball: its path up to the first rail/ball/pocket, capped
      if (pr.targetPath && target) {
        var col = target.kind === 'color' ? COL_HI[target.color] : '#ffffff';
        var tp = capPath(pr.targetPath, 360);
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(tp[0].x, tp[0].y);
        for (var k = 1; k < tp.length; k++) ctx.lineTo(tp[k].x, tp[k].y);
        ctx.stroke();
        var e = tp[tp.length - 1], e0 = tp[tp.length - 2] || tp[0];
        arrow(ctx, e0.x, e0.y, e.x, e.y, col);
        var full = pr.targetPath[pr.targetPath.length - 1];
        if (full.pocket && !tp.capped && target.kind === 'color') {
          ctx.fillStyle = 'rgba(143,224,122,0.95)'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('в лузу', e.x, e.y + (e.y < T.h / 2 ? 34 : -24));
          if (target.effect === 'explosive' || (st.firstWave && st.firstWave())) zone(ctx, e.x, e.y, target.effect === 'explosive' ? 'rgba(255,140,40,' : 'rgba(57,240,255,', now, st);
        }
        if (st.chainHint) {
          var dx = e.x - e0.x, dy = e.y - e0.y, d = Math.hypot(dx, dy) || 1;
          ctx.strokeStyle = 'rgba(255,159,230,0.75)'; ctx.lineWidth = 2; ctx.setLineDash([5, 6]);
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + dx / d * 50, e.y + dy / d * 50); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(255,170,235,0.95)'; ctx.font = 'italic 13px sans-serif'; ctx.textAlign = 'center';
          var lx = Math.min(T.w - 90, Math.max(90, e.x + dx / d * 60)), ly = Math.min(T.h - 10, Math.max(16, e.y + dy / d * 60 + 4));
          ctx.fillText('дальше — цепная реакция', lx, ly);
        }
      }
      // cue deflection
      var cs = Math.hypot(ct.cvx, ct.cvy);
      if (cs > 10) {
        var L = Math.min(90, cs * 0.12);
        ctx.strokeStyle = 'rgba(255,250,235,0.45)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.moveTo(ct.x, ct.y); ctx.lineTo(ct.x + ct.cvx / cs * L, ct.y + ct.cvy / cs * L); ctx.stroke(); ctx.setLineDash([]);
      }
    } else if (pr.end === 'pocket') {
      ctx.strokeStyle = st.cueBonus ? '#8fe07a' : '#ff7a6b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(last.x - 9, last.y - 9); ctx.lineTo(last.x + 9, last.y + 9); ctx.moveTo(last.x + 9, last.y - 9); ctx.lineTo(last.x - 9, last.y + 9); ctx.stroke();
      ctx.fillStyle = st.cueBonus ? '#8fe07a' : '#ff9a8f'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(st.cueBonus ? 'биток в лузу: Дерзкий биток' : 'биток в лузу', Math.min(T.w - 50, Math.max(50, last.x)), Math.min(T.h - 8, Math.max(18, last.y + (last.y < T.h / 2 ? 30 : -18))));
    } else {
      ctx.strokeStyle = 'rgba(255,250,235,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(last.x, last.y, T.ballR, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function capPath(p, maxLen) {
    var out = [p[0]], len = 0;
    for (var i = 1; i < p.length; i++) {
      var d = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      if (len + d > maxLen) {
        var f = (maxLen - len) / d;
        out.push({ x: p[i - 1].x + (p[i].x - p[i - 1].x) * f, y: p[i - 1].y + (p[i].y - p[i - 1].y) * f });
        out.capped = true; return out;
      }
      len += d; out.push(p[i]);
    }
    if (out.length < 2) out.push(p[0]);
    return out;
  }

  function arrow(ctx, x0, y0, x1, y1, col) {
    var a = Math.atan2(y1 - y0, x1 - x0);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x1 + Math.cos(a) * 6, y1 + Math.sin(a) * 6);
    ctx.lineTo(x1 + Math.cos(a + 2.5) * 10, y1 + Math.sin(a + 2.5) * 10);
    ctx.lineTo(x1 + Math.cos(a - 2.5) * 10, y1 + Math.sin(a - 2.5) * 10);
    ctx.closePath(); ctx.fill();
  }

  function drawCueStick(ctx, st, now) {
    var c = AP.Physics.cue(st.world);
    if (!c || !c.onTable) return;
    var a = st.aim.angle, pull = { weak: 16, medium: 30, strong: 48 }[st.aim.power] || 30;
    var bx = c.x - Math.cos(a) * (T.ballR + 6 + pull), by = c.y - Math.sin(a) * (T.ballR + 6 + pull);
    var ex = bx - Math.cos(a) * 330, ey = by - Math.sin(a) * 330;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(bx + 4, by + 6); ctx.lineTo(ex + 4, ey + 6); ctx.stroke();
    var g = ctx.createLinearGradient(bx, by, ex, ey);
    g.addColorStop(0, '#f3ead7'); g.addColorStop(0.04, '#f3ead7'); g.addColorStop(0.05, '#2d6fb0');
    g.addColorStop(0.07, '#d9b98a'); g.addColorStop(0.6, '#b4834e'); g.addColorStop(0.62, '#2a1a10'); g.addColorStop(1, '#3d2414');
    ctx.strokeStyle = g; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.restore();
    if (!st.aim.locked) return;
    // locked aim marker on the cue ball
    ctx.save();
    ctx.strokeStyle = 'rgba(214,169,74,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c.x, c.y, T.ballR + 5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ---------- transient effects (real-time) ----------
  function drawEffects(ctx, st, now) {
    if (!st.fx) return;
    st.fx.forEach(function (f) {
      var age = now - f.at;
      ctx.save();
      if (f.type === 'wave') {
        var dur = 0.55, k = Math.min(1, age / dur);
        if (k >= 1) { ctx.restore(); return; }
        var rad = C.wave.radius * (0.2 + 0.8 * Math.sqrt(k));
        var col = f.source === 'explosive' ? '255,140,40' : '57,240,255';
        ctx.globalCompositeOperation = 'lighter';
        var g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
        g.addColorStop(0, 'rgba(' + col + ',' + (st.reduceFx ? 0.12 : 0.35) * (1 - k) + ')');
        g.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, rad, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(' + col + ',' + (1 - k) + ')'; ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, rad, 0, Math.PI * 2); ctx.stroke();
        if (f.source === 'shockwave') {
          ctx.strokeStyle = 'rgba(255,63,208,' + (1 - k) * 0.8 + ')'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(f.x, f.y, rad * 0.8, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (f.type === 'pocket') {
        var k2 = Math.min(1, age / 0.4);
        if (k2 >= 1) { ctx.restore(); return; }
        ctx.fillStyle = f.color ? 'rgba(255,230,160,' + 0.5 * (1 - k2) + ')' : 'rgba(255,120,100,' + 0.5 * (1 - k2) + ')';
        ctx.beginPath(); ctx.arc(f.x, f.y, 14 + 30 * k2, 0, Math.PI * 2); ctx.fill();
      } else if (f.type === 'copy') {
        var k3 = Math.min(1, age / 0.7);
        if (k3 >= 1) { ctx.restore(); return; }
        ctx.strokeStyle = 'rgba(255,255,255,' + (1 - k3) + ')'; ctx.lineWidth = 2;
        for (var i = 0; i < 8; i++) {
          var a = i / 8 * Math.PI * 2 + age * 3, r1 = 40 * (1 - k3) + 14, r2 = r1 + 8;
          ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1); ctx.lineTo(f.x + Math.cos(a) * r2, f.y + Math.sin(a) * r2); ctx.stroke();
        }
      } else if (f.type === 'text') {
        var k4 = Math.min(1, age / 1.2);
        if (k4 >= 1) { ctx.restore(); return; }
        ctx.globalAlpha = 1 - k4 * k4;
        ctx.fillStyle = f.color || '#ffd66b'; ctx.font = 'bold ' + (f.size || 18) + 'px sans-serif'; ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
        var tx = Math.min(T.w - 30, Math.max(30, f.x)), ty = Math.min(T.h - 10, Math.max(20, f.y)) - 30 * k4;
        ctx.strokeText(f.text, tx, ty); ctx.fillText(f.text, tx, ty);
      }
      ctx.restore();
    });
  }

  return { draw: draw, toWorld: toWorld, toScreen: toScreen, view: view, drawBall: drawBall };
})();
