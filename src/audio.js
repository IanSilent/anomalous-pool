// Procedural sounds (WebAudio). Created on the first user gesture; muted by the setting.
var AP = AP || {};

AP.Audio = (function () {
  var ctx = null, master = null, enabled = true, noiseBuf = null, lastClack = 0;

  function init() {
    if (ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }
  function resume() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function tone(freq, dur, type, vol, slide, delay) {
    if (!ctx) return;
    var t = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    env(g, t, 0.004, vol, dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, filt, q, delay, slideTo) {
    if (!ctx) return;
    var t = ctx.currentTime + (delay || 0);
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(filt, t); f.Q.value = q || 1;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    var g = ctx.createGain(); env(g, t, 0.003, vol, dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
  }

  function play(type, x) {
    if (!enabled || !ctx) return;
    switch (type) {
      case 'cue': noise(0.05, 0.5 * (x || 1), 2500, 2); tone(140, 0.12, 'sine', 0.35 * (x || 1), 0.6); break;
      case 'clack': {
        var now = ctx.currentTime; if (now - lastClack < 0.025) return; lastClack = now;
        var v = Math.min(1, (x || 300) / 900);
        noise(0.035, 0.25 + 0.5 * v, 3200, 3); tone(1900 + Math.random() * 300, 0.03, 'triangle', 0.12 * v); break;
      }
      case 'rail': tone(90, 0.1, 'sine', Math.min(0.4, (x || 200) / 1500)); break;
      case 'pocket': tone(110, 0.25, 'sine', 0.45, 0.5); noise(0.18, 0.18, 600, 1, 0.03); break;
      case 'boom': noise(0.6, 0.7, 900, 0.7, 0, 80); tone(70, 0.5, 'sawtooth', 0.25, 0.4); break;
      case 'copy': tone(660, 0.18, 'sine', 0.2, 2); tone(990, 0.22, 'sine', 0.15, 1.5, 0.06); break;
      case 'coin': tone(1320, 0.12, 'square', 0.08); tone(1760, 0.18, 'square', 0.07, 1, 0.07); break;
      case 'tick': tone(500 + (x || 0) * 60, 0.07, 'triangle', 0.12); break;
      case 'mult': tone(300 + (x || 0) * 80, 0.16, 'sawtooth', 0.1, 1.5); break;
      case 'total': tone(523, 0.14, 'triangle', 0.18); tone(784, 0.2, 'triangle', 0.16, 1, 0.08); break;
      case 'win': [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.3, 'triangle', 0.16, 1, i * 0.09); }); break;
      case 'lose': [392, 330, 262].forEach(function (f, i) { tone(f, 0.4, 'sine', 0.16, 0.95, i * 0.16); }); break;
      case 'click': tone(800, 0.04, 'square', 0.05); break;
      case 'ach': [880, 1108, 1318].forEach(function (f, i) { tone(f, 0.25, 'sine', 0.14, 1, i * 0.07); }); break;
      case 'rack': noise(0.3, 0.2, 1500, 1); tone(220, 0.2, 'triangle', 0.1, 1.3); break;
    }
  }

  return { resume: resume, play: play, setEnabled: function (v) { enabled = v; } };
})();
