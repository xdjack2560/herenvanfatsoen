// Heer van de Match: stemmen (spelers) en resultaten (beheer).
(function () {
  var US = "Heren Van Fatsoen";
  var DAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  var MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  var PW_KEY = "hvf-stem-wachtwoord", ADMIN_KEY = "hvf-beheer-wachtwoord", WHO_KEY = "hvf-kiezer";

  var spelers = window.SPELERS || [];
  var players = spelers.filter(function (p) { return !p.staf; }).sort(function (a, b) { return a.nummer - b.nummer; });
  var voters = players.concat(spelers.filter(function (p) { return p.staf; }));
  var byNr = {};
  players.forEach(function (p) { byNr[p.nummer] = p; });

  function key(p) { return p.staf ? "staf:" + p.naam : String(p.nummer); }
  function voterName(k) {
    for (var i = 0; i < voters.length; i++) if (key(voters[i]) === k) return voters[i].naam;
    return k.indexOf("staf:") === 0 ? k.slice(5) : "#" + k;
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function $(id) { return document.getElementById(id); }

  function store(type, k, v) {
    try { var s = type === "session" ? window.sessionStorage : window.localStorage; if (v === null) s.removeItem(k); else s.setItem(k, v); } catch (e) {}
  }
  function load(type, k) {
    try { return (type === "session" ? window.sessionStorage : window.localStorage).getItem(k); } catch (e) { return null; }
  }

  function vandaag() {
    try { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Brussels" }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  var matches = (window.WEDSTRIJDEN || [])
    .filter(function (m) { return m.datum <= vandaag(); })
    .sort(function (a, b) { return b.datum.localeCompare(a.datum); });
  var matchByDate = {};
  (window.WEDSTRIJDEN || []).forEach(function (m) { matchByDate[m.datum] = m; });

  function matchLabel(datum) {
    var m = matchByDate[datum], d = new Date(datum + "T12:00:00");
    var when = DAGEN[d.getDay()] + " " + d.getDate() + " " + MAANDEN[d.getMonth()];
    if (!m) return when;
    return when + " · tegen " + (m.thuis === US ? m.uit : m.thuis);
  }

  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.fout || "Er ging iets mis (code " + r.status + "). Probeer het later opnieuw."); e.status = r.status; throw e; }
        return d;
      });
    }, function () { throw new Error("Geen verbinding met de server. Controleer je internet en probeer opnieuw."); });
  }
  function msg(el, text, kind) { el.textContent = text || ""; el.className = "form-msg" + (kind ? " " + kind : ""); }

  /* ---------- Stemmen ---------- */
  var gate = $("vote-gate"), form = $("vote-form");
  var selMatch = $("vote-match"), selWho = $("vote-who"), pick = $("vote-pick");

  function showVoteForm() {
    gate.hidden = true; form.hidden = false;
  }

  selMatch.innerHTML = matches.length
    ? matches.map(function (m) { return '<option value="' + m.datum + '">' + esc(matchLabel(m.datum)) + "</option>"; }).join("")
    : '<option value="">Nog geen gespeelde wedstrijden</option>';
  selWho.innerHTML = '<option value="">Kies je naam</option>' +
    voters.map(function (p) { return '<option value="' + esc(key(p)) + '">' + esc(p.staf ? p.naam + " (" + (p.rol || "staf") + ")" : "#" + p.nummer + " " + p.naam) + "</option>"; }).join("");
  var rememberedWho = load("local", WHO_KEY);
  if (rememberedWho) selWho.value = rememberedWho;

  pick.innerHTML = players.map(function (p) {
    var photo = p.foto ? '<img src="' + esc(p.foto) + '" alt="" loading="lazy">' : '<span class="pick-ghost">' + p.nummer + "</span>";
    return '<label class="pick" data-nr="' + p.nummer + '"><input type="radio" name="heer" id="heer-' + p.nummer + '" value="' + p.nummer + '">' +
      '<span class="pick-photo">' + photo + "</span>" +
      '<span class="pick-text"><span class="pick-name">' + esc(p.naam.split(" ")[0]) + '</span><span class="pick-meta">#' + p.nummer + (p.bijnaam ? " · " + esc(p.bijnaam) : "") + "</span></span></label>";
  }).join("");

  selWho.addEventListener("change", function () { store("local", WHO_KEY, selWho.value || null); });

  $("gate-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var pw = $("gate-pw").value, out = $("gate-msg"), btn = e.target.querySelector("button");
    if (!pw) { msg(out, "Vul het wachtwoord in.", "err"); return; }
    btn.disabled = true; msg(out, "Bezig met controleren…");
    api("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wachtwoord: pw }) })
      .then(function () { store("session", PW_KEY, pw); msg(out, ""); showVoteForm(); })
      .catch(function (err) { msg(out, err.message, "err"); })
      .then(function () { btn.disabled = false; });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var out = $("vote-msg"), btn = $("vote-submit");
    var chosen = form.querySelector('input[name="heer"]:checked');
    if (!selMatch.value) { msg(out, "Er is nog geen wedstrijd om op te stemmen.", "err"); return; }
    if (!selWho.value) { msg(out, "Kies eerst je eigen naam.", "err"); selWho.focus(); return; }
    if (!chosen) { msg(out, "Kies wie de Heer van de Match was.", "err"); return; }
    var heer = Number(chosen.value), p = byNr[heer];
    btn.disabled = true; msg(out, "Stem wordt verstuurd…");
    api("/api/stem", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ wachtwoord: load("session", PW_KEY) || "", wedstrijd: selMatch.value, kiezer: selWho.value, heer: heer })
    }).then(function () {
      msg(out, "Stem opgeslagen: " + (p ? p.naam : "#" + heer) + " voor " + matchLabel(selMatch.value) + ". Opnieuw stemmen vervangt je vorige stem.", "ok");
    }).catch(function (err) {
      if (err.status === 401) { store("session", PW_KEY, null); form.hidden = true; gate.hidden = false; msg($("gate-msg"), err.message, "err"); }
      else msg(out, err.message, "err");
    }).then(function () { btn.disabled = false; });
  });

  if (load("session", PW_KEY)) showVoteForm();
  window.addEventListener("hashchange", function () { if (location.hash === "#stemmen" && load("session", PW_KEY)) showVoteForm(); });

  /* ---------- Resultaten (beheer) ---------- */
  var resGate = $("res-gate"), resBody = $("res-body"), resList = $("res-list");

  function render(stemmen) {
    if (!stemmen.length) { resList.innerHTML = '<div class="panel"><h2>Nog geen stemmen</h2><p>Zodra spelers gestemd hebben, verschijnen de resultaten hier per wedstrijd.</p></div>'; return; }
    var groups = {}, order = [];
    stemmen.forEach(function (s) { if (!groups[s.wedstrijd]) { groups[s.wedstrijd] = []; order.push(s.wedstrijd); } groups[s.wedstrijd].push(s); });
    order.sort(function (a, b) { return b.localeCompare(a); });

    resList.innerHTML = order.map(function (datum) {
      var votes = groups[datum], tally = {};
      votes.forEach(function (s) { tally[s.heer] = (tally[s.heer] || 0) + 1; });
      var ranked = Object.keys(tally).map(Number).sort(function (a, b) { return tally[b] - tally[a] || a - b; });
      var top = tally[ranked[0]], leaders = ranked.filter(function (n) { return tally[n] === top; });
      var max = top || 1;

      var m = matchByDate[datum];
      var expected = m && m.spelers ? m.spelers.map(function (s) { return String(s.nr); }).filter(function (k) { return voters.some(function (p) { return key(p) === k; }); }) : players.map(key);
      var voted = {}; votes.forEach(function (s) { voted[s.kiezer] = true; });
      var missing = expected.filter(function (k) { return !voted[k]; });

      var leaderText = leaders.length > 1
        ? "Gelijkstand tussen " + leaders.map(function (n) { return byNr[n] ? byNr[n].naam.split(" ")[0] : "#" + n; }).join(" en ")
        : (byNr[leaders[0]] ? byNr[leaders[0]].naam : "#" + leaders[0]);

      return '<article class="res-card">' +
        '<header class="res-head"><div><h3>' + esc(matchLabel(datum)) + '</h3><span class="res-count">' + votes.length + " stem" + (votes.length === 1 ? "" : "men") + "</span></div>" +
        '<div class="res-leader"><span class="res-leader-label">' + (leaders.length > 1 ? "Nog geen winnaar" : "Heer van de Match") + "</span><strong>" + esc(leaderText) + "</strong></div></header>" +
        '<div class="res-grid"><div><h4>Telling</h4><ol class="tally">' +
          ranked.map(function (n) {
            var p = byNr[n];
            return '<li><span class="tally-name">#' + n + " " + esc(p ? p.naam : "") + '</span><span class="tally-bar"><span style="width:' + Math.round(tally[n] / max * 100) + '%"></span></span><span class="tally-n">' + tally[n] + "</span></li>";
          }).join("") + "</ol>" +
          (missing.length ? '<p class="note">Nog niet gestemd: ' + esc(missing.map(voterName).join(", ")) + "</p>" : '<p class="note">Iedereen die meespeelde heeft gestemd.</p>') +
          (leaders.length === 1 ? '<p class="note">Op de site zetten: vul <code>heer: ' + leaders[0] + "</code> in bij deze match in wedstrijden.js.</p>" : "") +
        "</div>" +
        '<div><h4>Wie stemde op wie</h4><div class="stats-wrap"><table class="stats"><thead><tr><th>Stemmer</th><th>Heer van de Match</th></tr></thead><tbody>' +
          votes.slice().sort(function (a, b) { return voterName(a.kiezer).localeCompare(voterName(b.kiezer)); }).map(function (s) {
            var p = byNr[s.heer];
            return "<tr><td>" + esc(voterName(s.kiezer)) + "</td><td>#" + s.heer + " " + esc(p ? p.naam : "") + "</td></tr>";
          }).join("") + "</tbody></table></div></div></div></article>";
    }).join("");
  }

  function loadResults(pw) {
    var out = $("res-msg");
    msg(out, "Resultaten laden…");
    return api("/api/resultaten", { headers: { "X-Beheer": pw } }).then(function (d) {
      store("session", ADMIN_KEY, pw); msg(out, "");
      resGate.hidden = true; resBody.hidden = false; render(d.stemmen || []);
    }).catch(function (err) {
      if (err.status === 401) { store("session", ADMIN_KEY, null); resGate.hidden = false; resBody.hidden = true; }
      msg(out, err.message, "err");
    });
  }

  $("res-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var pw = $("res-pw").value;
    if (!pw) { msg($("res-msg"), "Vul het beheerwachtwoord in.", "err"); return; }
    loadResults(pw);
  });
  $("res-refresh").addEventListener("click", function () { var pw = load("session", ADMIN_KEY); if (pw) loadResults(pw); });

  window.addEventListener("hashchange", function () {
    if (location.hash === "#resultaten") { var pw = load("session", ADMIN_KEY); if (pw) loadResults(pw); }
  });
  if (location.hash === "#resultaten" && load("session", ADMIN_KEY)) loadResults(load("session", ADMIN_KEY));
})();
