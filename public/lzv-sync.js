// Vult wedstrijden.js automatisch aan met de gegevens van LZV Cup (via /api/wedstrijden):
// datum, uur, zaal, score, wedstrijdblad (goals/assists) en Heer van de Match uit de stemming.
// Wat je zelf in wedstrijden.js invult, gaat altijd voor (score, spelers, heer).
// Daarna stuurt het een "hvf:wedstrijden"-event, zodat de pagina's opnieuw tekenen.
(function () {
  var local = window.WEDSTRIJDEN = window.WEDSTRIJDEN || [];
  function norm(s) { return String(s || "").toLowerCase().replace(/[‘’']/g, "'").replace(/\s+/g, " ").trim(); }
  function key(m) { return norm(m.thuis) + "|" + norm(m.uit); }
  var known = {};
  (window.SPELERS || []).forEach(function (p) { if (!p.staf) known[p.nummer] = true; });

  function merge(lzv) {
    lzv.forEach(function (w) {
      var t = local.filter(function (m) { return !m.afgelast && !m.oefen && key(m) === key(w); })[0];
      if (!t) { t = { thuis: w.thuis, uit: w.uit }; local.push(t); }
      if (w.datum) t.datum = w.datum;
      if (w.uur) t.uur = w.uur;
      if (w.zaal) t.zaal = w.zaal;
      if (w.score && !t.score) t.score = w.score;
      if (w.spelers && w.spelers.length && !(t.spelers && t.spelers.length)) {
        t.spelers = w.spelers.map(function (s) {
          var o = { nr: s.nr, goals: s.goals, assists: s.assists };
          if (s.k) o.k = true;
          if (!known[s.nr]) o.naam = s.naam; // speler die (nog) niet in spelers.js staat
          return o;
        });
      }
      if (w.heer != null && t.heer == null) t.heer = w.heer;
      t.lzv = true;
    });
  }

  fetch("/api/wedstrijden").then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (d) {
      merge(d.wedstrijden || []);
      try { window.dispatchEvent(new Event("hvf:wedstrijden")); } catch (e) {}
    })
    .catch(function () { /* LZV niet bereikbaar: de site toont gewoon wedstrijden.js */ });
})();
