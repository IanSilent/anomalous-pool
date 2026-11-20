// Reproducible randomness. Every game decision draws from a stream derived from
// (run seed, purpose, indices), so results do not depend on call order.
var AP = AP || {};

AP.Rng = (function () {
  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function hash() {
    var h = 2166136261 >>> 0;
    for (var a = 0; a < arguments.length; a++) {
      var s = String(arguments[a]) + '|';
      for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
    }
    // final avalanche
    h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }

  function make(seed) {
    var a = seed >>> 0;
    var r = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = function (n) { return Math.floor(r() * n); };
    r.pick = function (arr) { return arr[Math.floor(r() * arr.length)]; };
    r.shuffle = function (arr) {
      var out = arr.slice();
      for (var i = out.length - 1; i > 0; i--) {
        var j = Math.floor(r() * (i + 1));
        var t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    };
    return r;
  }

  // stream(seed, 'reward', 3) → generator
  function stream() { return make(hash.apply(null, arguments)); }

  function newCode() {
    var s = '';
    for (var i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
  }

  function normalizeCode(code) {
    var s = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return s.slice(0, 12);
  }

  return { hash: hash, make: make, stream: stream, newCode: newCode, normalizeCode: normalizeCode };
})();
