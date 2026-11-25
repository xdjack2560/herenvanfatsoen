// Competitie: klassement en alle wedstrijden van de reeks, live van LZV Cup (via /api/competitie).
// Lukt dat niet, dan valt de pagina terug op competitie.json (een momentopname).
(function () {
  var US_ID = 2730; // Heren Van Fatsoen op lzvcup.be
  var DAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
  var MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function vandaag() {
    try { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Brussels" }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  var data = null, when = "komend", team = load("hvf-comp-team") || "", loaded = false;

  function renderStand() {
    var rows = data.stand || [];
    $("comp-stand").querySelector("tbody").innerHTML = rows.map(function (r) {
      var ds = r.ds > 0 ? "+" + r.ds : String(r.ds);
      return '<tr class="' + (r.id === US_ID ? "us" : "") + '">' +
        '<td class="num pos">' + r.pos + '</td><td class="team">' + esc(r.ploeg) + "</td>" +
        '<td class="num">' + r.gespeeld + '</td><td class="num">' + r.winst + '</td><td class="num">' + r.gelijk + '</td><td class="num">' + r.verlies + "</td>" +
        '<td class="num hide-s">' + r.dg + '</td><td class="num hide-s">' + r.dt + '</td><td class="num">' + ds + '</td><td class="num pts">' + r.punten + "</td></tr>";
    }).join("") || '<tr><td colspan="10" class="zero">Nog geen klassement.</td></tr>';

    var us = rows.filter(function (r) { return r.id === US_ID; })[0];
    if (us && $("tile-stand")) $("tile-stand").textContent = us.pos + "e van " + rows.length + " met " + us.punten + " punten";
  }

  var STAT_INFO = {
    "Topschutters": { sub: "Doelpunten", pad: "/goals", volgorde: 1 },
    "Assists": { sub: "Assists", pad: "/assists", volgorde: 2 },
    "Tegengoals Keepers": { sub: "Gemiddeld aantal tegengoals per match", pad: "/keeper", volgorde: 3 }
  };
  function renderStats() {
    var el = $("comp-stats"), cards = (data.statistieken || []).filter(function (k) { return k.titel !== "Fairplay"; });
    if (!cards.length) { el.innerHTML = '<p class="note">Geen statistieken beschikbaar.</p>'; return; }
    var base = (data.bron || "https://www.lzvcup.be/results/5/10/3A").replace("/results/", "/results/stats/");
    cards.sort(function (a, b) { return ((STAT_INFO[a.titel] || {}).volgorde || 9) - ((STAT_INFO[b.titel] || {}).volgorde || 9); });
    el.innerHTML = cards.map(function (k) {
      var info = STAT_INFO[k.titel] || { sub: "", pad: "" };
      return '<article class="stat-card"><h3>' + esc(k.titel) + "</h3>" + (info.sub ? '<p class="stat-sub">' + esc(info.sub) + "</p>" : "") +
        '<ol class="stat-list">' + k.lijst.map(function (r) {
          return '<li class="' + (r.ploegId === US_ID ? "us" : "") + '"><span class="r">' + (r.pos === 1 ? "🏆" : r.pos + ".") + "</span>" +
            '<span class="w"><span class="n">' + esc(r.speler) + '</span><span class="p">' + esc(r.ploeg) + "</span></span>" +
            '<span class="v">' + esc(r.waarde) + "</span></li>";
        }).join("") + "</ol>" +
        (info.pad ? '<a class="more" href="' + esc(base + info.pad) + '" target="_blank" rel="noopener">Volledige lijst ↗</a>' : "") +
        "</article>";
    }).join("");
  }

  function renderMatches() {
    var today = vandaag();
    var list = (data.wedstrijden || []).filter(function (w) {
      if (team && String(w.thuisId) !== team && String(w.uitId) !== team) return false;
      var gespeeld = !!w.score || (w.datum && w.datum < today);
      return when === "gespeeld" ? gespeeld : !gespeeld;
    });
    if (when === "gespeeld") list.reverse();

    if (!list.length) {
      $("comp-matches").innerHTML = '<div class="panel"><p>' + (when === "gespeeld" ? "Nog geen gespeelde wedstrijden" : "Geen komende wedstrijden meer") + (team ? " voor deze ploeg." : ".") + "</p></div>";
      return;
    }
    var groups = [], byDay = {};
    list.forEach(function (w) {
      var k = w.datum || "?";
      if (!byDay[k]) { byDay[k] = []; groups.push(k); }
      byDay[k].push(w);
    });
    $("comp-matches").innerHTML = groups.map(function (k) {
      var d = new Date(k + "T12:00:00"), label = isNaN(d) ? "Datum onbekend" : DAGEN[d.getDay()] + " " + d.getDate() + " " + MAANDEN[d.getMonth()] + (d.getFullYear() !== 2026 ? " " + d.getFullYear() : "");
      return '<section class="comp-day"><h3>' + label + '</h3><div class="comp-list">' + byDay[k].map(function (w) {
        var us = w.thuisId === US_ID || w.uitId === US_ID;
        var hw = w.score && w.score[0] > w.score[1], aw = w.score && w.score[1] > w.score[0];
        function name(n, id, win) { return '<span class="' + (id === US_ID ? "us-name" : "") + (win ? " win" : "") + '">' + esc(n) + "</span>"; }
        var score = w.score ? '<span class="s">' + w.score[0] + "–" + w.score[1] + "</span>"
          : '<span class="s open">' + esc(w.opmerking || (w.datum && w.datum < today ? "nog geen uitslag" : "vs")) + "</span>";
        return '<div class="comp-row' + (us ? " us" : "") + '">' +
          '<span class="t">' + esc((w.uur || "").replace(":", "u")) + "</span>" +
          '<span class="h">' + name(w.thuis, w.thuisId, hw) + "</span>" + score +
          '<span class="a">' + name(w.uit, w.uitId, aw) + "</span>" +
          '<span class="z" title="' + esc(w.zaal) + '">' + esc(w.zaal) + "</span></div>";
      }).join("") + "</div></section>";
    }).join("");
  }

  function fillTeams() {
    var teams = (data.stand || []).map(function (r) { return { id: String(r.id), naam: r.ploeg }; });
    if (!teams.length) {
      var seen = {};
      (data.wedstrijden || []).forEach(function (w) { seen[w.thuisId] = w.thuis; seen[w.uitId] = w.uit; });
      teams = Object.keys(seen).map(function (id) { return { id: id, naam: seen[id] }; });
    }
    teams.sort(function (a, b) { return a.naam.localeCompare(b.naam); });
    $("comp-team").innerHTML = '<option value="">Alle ploegen</option>' + teams.map(function (t) {
      return '<option value="' + t.id + '">' + esc(t.naam) + (t.id === String(US_ID) ? " (wij)" : "") + "</option>";
    }).join("");
    if (team && !teams.some(function (t) { return t.id === team; })) team = "";
    $("comp-team").value = team;
  }

  function show(d, snapshot) {
    data = d;
    fillTeams(); renderStand(); renderStats(); renderMatches();
    var t = new Date(d.opgehaald);
    $("comp-updated").textContent = isNaN(t) ? "" :
      (snapshot ? "Momentopname van " : "Bijgewerkt ") + t.toLocaleString("nl-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + ".";
  }

  function fetchData() {
    if (loaded) return;
    loaded = true;
    var msg = $("comp-msg");
    fetch("/api/competitie").then(function (r) {
      if (!r.ok) throw new Error();
      return r.json();
    }).then(function (d) { msg.textContent = ""; msg.className = "form-msg"; show(d, false); })
      .catch(function () {
        fetch("competitie.json").then(function (r) { return r.json(); }).then(function (d) {
          msg.textContent = "LZV Cup is nu niet bereikbaar. Je ziet een oudere momentopname.";
          msg.className = "form-msg err";
          show(d, true);
        }).catch(function () {
          msg.textContent = "Het klassement kon niet geladen worden. Bekijk het rechtstreeks op lzvcup.be.";
          msg.className = "form-msg err";
          loaded = false;
        });
      });
  }

  $("comp-team").addEventListener("change", function () { team = this.value; store("hvf-comp-team", team); if (data) renderMatches(); });
  document.querySelectorAll("[data-when]").forEach(function (b) {
    b.addEventListener("click", function () {
      when = b.getAttribute("data-when");
      document.querySelectorAll("[data-when]").forEach(function (x) { x.classList.toggle("on", x === b); });
      if (data) renderMatches();
    });
  });

  // Laad meteen (ook voor de tegel op de startpagina) en ververs bij terugkeren naar de tab.
  fetchData();
  window.addEventListener("hashchange", function () { if (location.hash === "#competitie" && !data) fetchData(); });
})();
