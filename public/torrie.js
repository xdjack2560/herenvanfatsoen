// Ballon T'orrie: verhalen van het seizoen, achter het ploegwachtwoord.
(function () {
  var PW_KEY = "hvf-stem-wachtwoord", ADMIN_KEY = "hvf-beheer-wachtwoord", WHO_KEY = "hvf-kiezer";
  var MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

  var spelers = window.SPELERS || [];
  var players = spelers.filter(function (p) { return !p.staf; }).sort(function (a, b) { return a.nummer - b.nummer; });
  var everyone = players.concat(spelers.filter(function (p) { return p.staf; }));
  var byNr = {};
  players.forEach(function (p) { byNr[p.nummer] = p; });

  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function store(type, k, v) { try { var s = type === "session" ? sessionStorage : localStorage; if (v === null) s.removeItem(k); else s.setItem(k, v); } catch (e) {} }
  function load(type, k) { try { return (type === "session" ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } }
  function msg(el, text, kind) { el.textContent = text || ""; el.className = "form-msg" + (kind ? " " + kind : ""); }
  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.fout || "Er ging iets mis (code " + r.status + "). Probeer het later opnieuw."); e.status = r.status; throw e; }
        return d;
      });
    }, function () { throw new Error("Geen verbinding met de server. Controleer je internet en probeer opnieuw."); });
  }
  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.getDate() + " " + MAANDEN[d.getMonth()] + " " + d.getFullYear();
  }

  var gate = $("torrie-gate"), body = $("torrie-body"), feed = $("torrie-feed"), stand = $("torrie-stand");
  var form = $("torrie-form"), compose = $("torrie-compose");
  var torries = [];

  // Formulier vullen
  $("torrie-nominee").innerHTML = '<option value="">Kies een speler</option>' +
    players.map(function (p) { return '<option value="' + p.nummer + '">#' + p.nummer + " " + esc(p.naam) + (p.bijnaam ? " · " + esc(p.bijnaam) : "") + "</option>"; }).join("");
  $("torrie-door").innerHTML = '<option value="">Anoniem</option>' +
    everyone.map(function (p) { return '<option value="' + esc(p.naam) + '">' + esc(p.naam) + "</option>"; }).join("");
  var me = load("local", WHO_KEY);
  if (me) {
    var mine = everyone.filter(function (p) { return (p.staf ? "staf:" + p.naam : String(p.nummer)) === me; })[0];
    if (mine) $("torrie-door").value = mine.naam;
  }
  try { if (window.matchMedia("(min-width: 900px)").matches) compose.open = true; } catch (e) {}

  var counter = $("torrie-count"), area = $("torrie-text");
  area.addEventListener("input", function () { counter.textContent = area.value.length + " / 4000"; });

  function render() {
    var isAdmin = !!load("session", ADMIN_KEY);
    if (!torries.length) {
      feed.innerHTML = '<div class="panel"><h2>Nog geen torries</h2><p>Wees de eerste: schrijf op wat er gebeurde en nomineer de hoofdrolspeler.</p></div>';
    } else {
      feed.innerHTML = torries.map(function (t) {
        var p = byNr[t.genomineerde];
        var photo = p && p.foto ? '<img src="' + esc(p.foto) + '" alt="" loading="lazy">' : '<span>' + t.genomineerde + "</span>";
        return '<article class="torrie">' +
          '<header class="torrie-head"><span class="torrie-photo">' + photo + "</span>" +
          '<div class="torrie-meta"><span class="torrie-nom">Genomineerd: ' + esc(p ? p.naam : "#" + t.genomineerde) + (p && p.bijnaam ? ' <em>“' + esc(p.bijnaam) + "”</em>" : "") + "</span>" +
          "<h3>" + esc(t.titel) + "</h3>" +
          '<span class="torrie-by">' + (t.door ? "Ingestuurd door " + esc(t.door) : "Anoniem ingestuurd") + " · " + when(t.tijd) + "</span></div></header>" +
          '<p class="torrie-text">' + esc(t.verhaal) + "</p>" +
          (isAdmin ? '<button class="btn ghost small" type="button" data-delete="' + t.id + '">Verwijderen</button>' : "") +
          "</article>";
      }).join("");
    }
    var count = {};
    torries.forEach(function (t) { count[t.genomineerde] = (count[t.genomineerde] || 0) + 1; });
    var ranked = Object.keys(count).map(Number).sort(function (a, b) { return count[b] - count[a] || a - b; });
    stand.innerHTML = ranked.length
      ? ranked.map(function (n, i) {
          var p = byNr[n];
          return '<li' + (i === 0 ? ' class="first"' : "") + '><span class="stand-name">' + esc(p ? p.naam : "#" + n) + '</span><span class="stand-n">' + count[n] + " torrie" + (count[n] === 1 ? "" : "s") + "</span></li>";
        }).join("")
      : '<li class="empty">Nog geen nominaties.</li>';
  }

  function loadTorries() {
    var pw = load("session", PW_KEY);
    if (!pw) return Promise.resolve();
    msg($("torrie-msg"), "Torries laden…");
    return api("/api/torries", { headers: { "X-Wachtwoord": pw } }).then(function (d) {
      torries = d.torries || []; gate.hidden = true; body.hidden = false; msg($("torrie-msg"), ""); render();
    }).catch(function (err) {
      if (err.status === 401) { store("session", PW_KEY, null); gate.hidden = false; body.hidden = true; }
      msg($("torrie-msg"), err.message, "err");
    });
  }

  $("torrie-gate-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var pw = $("torrie-pw").value, out = $("torrie-gate-msg"), btn = e.target.querySelector("button");
    if (!pw) { msg(out, "Vul het wachtwoord in.", "err"); return; }
    btn.disabled = true; msg(out, "Bezig met controleren…");
    api("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wachtwoord: pw }) })
      .then(function () { store("session", PW_KEY, pw); msg(out, ""); return loadTorries(); })
      .catch(function (err) { msg(out, err.message, "err"); })
      .then(function () { btn.disabled = false; });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var out = $("torrie-form-msg"), btn = $("torrie-submit");
    var titel = $("torrie-title").value.trim(), nom = $("torrie-nominee").value, verhaal = area.value.trim();
    if (!titel) { msg(out, "Geef je torrie een titel.", "err"); $("torrie-title").focus(); return; }
    if (!nom) { msg(out, "Kies wie je nomineert.", "err"); $("torrie-nominee").focus(); return; }
    if (!verhaal) { msg(out, "Schrijf het verhaal nog even op.", "err"); area.focus(); return; }
    btn.disabled = true; msg(out, "Torrie wordt geplaatst…");
    api("/api/torries", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ wachtwoord: load("session", PW_KEY) || "", titel: titel, genomineerde: Number(nom), verhaal: verhaal, door: $("torrie-door").value })
    }).then(function (d) {
      torries.unshift(d.torrie); render();
      $("torrie-title").value = ""; area.value = ""; $("torrie-nominee").value = ""; counter.textContent = "0 / 4000";
      msg(out, "Torrie geplaatst. Hij staat nu bovenaan de lijst.", "ok");
    }).catch(function (err) {
      if (err.status === 401) { store("session", PW_KEY, null); gate.hidden = false; body.hidden = true; msg($("torrie-gate-msg"), err.message, "err"); }
      else msg(out, err.message, "err");
    }).then(function () { btn.disabled = false; });
  });

  // Verwijderen (alleen als je via de resultatenpagina als beheer bent ingelogd), met bevestiging in de pagina zelf
  feed.addEventListener("click", function (e) {
    var b = e.target.closest("[data-delete]");
    if (!b) return;
    if (b.getAttribute("data-confirm") !== "1") { b.setAttribute("data-confirm", "1"); b.textContent = "Zeker? Klik nogmaals om te verwijderen"; return; }
    b.disabled = true;
    api("/api/torries/" + b.getAttribute("data-delete"), { method: "DELETE", headers: { "X-Beheer": load("session", ADMIN_KEY) || "" } })
      .then(function () { var id = Number(b.getAttribute("data-delete")); torries = torries.filter(function (t) { return t.id !== id; }); render(); })
      .catch(function (err) { b.disabled = false; b.textContent = err.message; });
  });

  $("torrie-refresh").addEventListener("click", loadTorries);
  window.addEventListener("hashchange", function () { if (location.hash === "#torrie") loadTorries(); });
  if (location.hash === "#torrie") loadTorries();
  else if (load("session", PW_KEY)) { gate.hidden = true; body.hidden = false; loadTorries(); }
})();
