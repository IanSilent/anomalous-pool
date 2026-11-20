// Persistent storage: the profile (achievements, records, settings) and the current run
// are stored separately (§16.2). Every access is guarded: storage may be unavailable.
var AP = AP || {};

AP.Store = (function () {
  var KEY_PROFILE = 'anomalous-pool.profile.v1';
  var KEY_RUN = 'anomalous-pool.run.v1';
  var KEY_DIAG = 'anomalous-pool.diag.v1';
  var mem = {};

  function ls() {
    try { if (typeof localStorage !== 'undefined') return localStorage; } catch (e) { }
    return null;
  }
  function get(k) {
    var s = ls();
    try { var v = s ? s.getItem(k) : mem[k]; return v == null ? null : JSON.parse(v); } catch (e) { return null; }
  }
  function set(k, v) {
    var s = ls(), str = JSON.stringify(v);
    try { if (s) s.setItem(k, str); else mem[k] = str; } catch (e) { mem[k] = str; }
  }
  function del(k) {
    var s = ls();
    try { if (s) s.removeItem(k); } catch (e) { }
    delete mem[k];
  }

  function defaultProfile() {
    return {
      v: 1,
      achievements: {},          // id → ISO date
      records: { bestShot: 0, wins: 0, bestExtraRounds: 0, runs: 0 },
      settings: { sound: true, reduceFx: false, hints: true, assist: true, dev: false },
      seenHints: {}
    };
  }

  function loadProfile() {
    var p = get(KEY_PROFILE), d = defaultProfile();
    if (!p || p.v !== 1) return d;
    p.achievements = p.achievements || {};
    p.records = Object.assign(d.records, p.records || {});
    p.settings = Object.assign(d.settings, p.settings || {});
    p.seenHints = p.seenHints || {};
    return p;
  }

  return {
    loadProfile: loadProfile,
    saveProfile: function (p) { set(KEY_PROFILE, p); },
    loadRun: function () { return get(KEY_RUN); },
    saveRun: function (r) { set(KEY_RUN, r); },
    clearRun: function () { del(KEY_RUN); },
    saveDiag: function (d) {
      var list = get(KEY_DIAG) || [];
      list.push(d); if (list.length > 20) list.shift();
      set(KEY_DIAG, list);
    },
    defaultProfile: defaultProfile,
    _mem: mem
  };
})();
