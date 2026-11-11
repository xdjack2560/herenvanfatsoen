// Ballon T'orrie: verhalen van het seizoen, achter het ploegwachtwoord.
// Iedereen kiest eerst wie hij is; daarmee stuurt hij torries in en stemt hij (1 stem per persoon per torrie).
(function () {
  var PW_KEY = "hvf-stem-wachtwoord", ADMIN_KEY = "hvf-beheer-wachtwoord", WHO_KEY = "hvf-kiezer", SORT_KEY = "hvf-torrie-sort";
  var MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  var MAX_FILES = 8, MAX_VIDEO = 90 * 1048576;

  var spelers = window.SPELERS || [];
  var players = spelers.filter(function (p) { return !p.staf; }).sort(function (a, b) { return a.nummer - b.nummer; });
  var everyone = players.concat(spelers.filter(function (p) { return p.staf; }));
  var byNr = {};
  players.forEach(function (p) { byNr[p.nummer] = p; });

  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
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
  function when(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.getDate() + " " + MAANDEN[d.getMonth()] + " " + d.getFullYear(); }
  function keyOf(p) { return p.staf ? "staf:" + p.naam : String(p.nummer); }
  function personByKey(k) { for (var i = 0; i < everyone.length; i++) if (keyOf(everyone[i]) === k) return everyone[i]; return null; }
  function first(n) { var p = byNr[n]; return p ? p.naam.split(" ")[0] : "#" + n; }

  // Past de pagina niet bij dit script (oude versie uit de cache)? Dan niet vastlopen maar vragen om te vernieuwen.
  if (!$("torrie-me") || !$("torrie-nominees") || !$("torrie-cancel")) {
    var m = $("torrie-msg") || $("torrie-gate-msg");
    if (m) { m.textContent = "Er is een nieuwe versie van de site. Vernieuw de pagina (op gsm: trek de pagina naar beneden of herlaad hem)."; m.className = "form-msg err"; }
    return;
  }
  var gate = $("torrie-gate"), body = $("torrie-body"), feed = $("torrie-feed"), stand = $("torrie-stand");
  var form = $("torrie-form"), compose = $("torrie-compose"), meSel = $("torrie-me"), whoBox = $("torrie-whoami");
  var torries = [], mediaEnabled = true, sortMode = load("local", SORT_KEY) === "nieuw" ? "nieuw" : "beste", files = [];
  var editing = null, kept = []; // torrie die bewerkt wordt + de foto's/video's die al bij die torrie horen

  /* ---------- Wie ben jij? ---------- */
  meSel.innerHTML = '<option value="">Kies je naam</option>' + everyone.map(function (p) {
    return '<option value="' + esc(keyOf(p)) + '">' + esc(p.staf ? p.naam + " (" + (p.rol || "staf") + ")" : "#" + p.nummer + " " + p.naam) + "</option>";
  }).join("");
  function me() { return meSel.value ? personByKey(meSel.value) : null; }
  function syncMe() {
    var p = me();
    whoBox.classList.toggle("need", !p);
    $("torrie-me-note").textContent = p
      ? "Je stemt en schrijft als " + p.naam + ". Ben je dat niet? Kies dan je eigen naam."
      : "Kies eerst je naam. Daarmee stem je en stuur je torries in, en je kan maar één keer per torrie stemmen.";
    $("torrie-by").innerHTML = "Ingestuurd door: <strong>" + (p ? esc(p.naam) : "kies eerst wie je bent (bovenaan)") + "</strong>";
  }
  var saved = load("local", WHO_KEY);
  if (saved && personByKey(saved)) meSel.value = saved;
  meSel.addEventListener("change", function () {
    store("local", WHO_KEY, meSel.value || null); syncMe();
    if (editing && (!me() || editing.door !== me().naam)) resetForm();
    loadTorries();
  });
  syncMe();

  /* ---------- Formulier ---------- */
  $("torrie-nominees").innerHTML = players.map(function (p) {
    var img = p.foto ? '<img src="' + esc(p.foto) + '" alt="" loading="lazy">' : '<span class="nom-ghost">' + p.nummer + "</span>";
    return '<label class="nom" title="' + esc(p.naam) + '"><input type="checkbox" name="nom" id="nom-' + p.nummer + '" value="' + p.nummer + '">' + img + '<span class="nm">' + esc(p.naam.split(" ")[0]) + "</span></label>";
  }).join("");
  try { if (window.matchMedia("(min-width: 900px)").matches) compose.open = true; } catch (e) {}

  var area = $("torrie-text"), counter = $("torrie-count");
  area.addEventListener("input", function () { counter.textContent = area.value.length + " / 4000"; });

  function guessType(f) {
    if (f.type) return f.type;
    var ext = (f.name.split(".").pop() || "").toLowerCase();
    return { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic" }[ext] || "";
  }
  function renderPreview() {
    $("torrie-preview").innerHTML = kept.map(function (m, i) {
      var src = "/api/media/" + encodeURIComponent(m.key);
      var inner = m.type === "video" ? '<video src="' + src + '" muted preload="metadata"></video>' : '<img src="' + src + '" alt="">';
      return '<div class="mp">' + inner + '<button type="button" data-rm-old="' + i + '" aria-label="Verwijder deze ' + (m.type === "video" ? "video" : "foto") + '">×</button></div>';
    }).join("") + files.map(function (f, i) {
      var t = guessType(f), url = f._url || (f._url = URL.createObjectURL(f));
      var inner = t.indexOf("image/") === 0 ? '<img src="' + url + '" alt="">' : t.indexOf("video/") === 0 ? '<video src="' + url + '" muted></video>' : esc(f.name);
      return '<div class="mp">' + inner + '<button type="button" data-rm="' + i + '" aria-label="Verwijder ' + esc(f.name) + '">×</button></div>';
    }).join("");
  }
  $("torrie-files").addEventListener("change", function (e) {
    var out = $("torrie-form-msg"), added = Array.prototype.slice.call(e.target.files || []);
    e.target.value = "";
    for (var i = 0; i < added.length; i++) {
      var f = added[i], t = guessType(f);
      if (t.indexOf("image/") !== 0 && t.indexOf("video/") !== 0) { msg(out, f.name + " is geen foto of video.", "err"); continue; }
      if (t.indexOf("video/") === 0 && f.size > MAX_VIDEO) { msg(out, f.name + " is te groot (" + Math.round(f.size / 1048576) + " MB). Video's mogen max 90 MB zijn.", "err"); continue; }
      if (kept.length + files.length >= MAX_FILES) { msg(out, "Je kan maximaal " + MAX_FILES + " foto's of video's toevoegen.", "err"); break; }
      files.push(f);
    }
    renderPreview();
  });
  $("torrie-preview").addEventListener("click", function (e) {
    var o = e.target.closest("[data-rm-old]");
    if (o) { kept.splice(Number(o.getAttribute("data-rm-old")), 1); renderPreview(); return; }
    var b = e.target.closest("[data-rm]"); if (!b) return;
    var f = files.splice(Number(b.getAttribute("data-rm")), 1)[0];
    if (f && f._url) URL.revokeObjectURL(f._url);
    renderPreview();
  });

  // Foto's verkleinen tot max 1600 px (scheelt veel opslag en laadtijd). GIF's blijven zoals ze zijn.
  function prepare(f) {
    var t = guessType(f);
    if (t.indexOf("image/") !== 0 || t === "image/gif" || !window.createImageBitmap) return Promise.resolve({ blob: f, type: t });
    return createImageBitmap(f).then(function (bmp) {
      var s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      var c = document.createElement("canvas");
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (res) {
        c.toBlob(function (b) { res(b && (b.size < f.size || t === "image/heic") ? { blob: b, type: "image/jpeg" } : { blob: f, type: t }); }, "image/jpeg", 0.82);
      });
    }).catch(function () { return { blob: f, type: t }; });
  }
  function uploadAll(out) {
    var keys = [], pw = load("session", PW_KEY) || "";
    return files.reduce(function (chain, f, i) {
      return chain.then(function () {
        msg(out, "Bestand " + (i + 1) + " van " + files.length + " uploaden…");
        return prepare(f).then(function (p) {
          return api("/api/media", { method: "POST", headers: { "content-type": p.type, "X-Wachtwoord": pw }, body: p.blob });
        }).then(function (d) { keys.push({ key: d.key, type: d.type }); });
      });
    }, Promise.resolve()).then(function () { return keys; });
  }

  function resetForm() {
    editing = null; kept = [];
    $("torrie-title").value = ""; area.value = ""; counter.textContent = "0 / 4000";
    form.querySelectorAll('input[name="nom"]').forEach(function (i) { i.checked = false; });
    files.forEach(function (f) { if (f._url) URL.revokeObjectURL(f._url); }); files = []; renderPreview();
    $("torrie-compose-title").textContent = "+ Nieuwe torrie schrijven";
    $("torrie-submit").textContent = "Torrie plaatsen";
    $("torrie-cancel").hidden = true;
    compose.classList.remove("editing");
  }
  function startEdit(t) {
    resetForm();
    editing = t; kept = (t.media || []).slice();
    $("torrie-title").value = t.titel; area.value = t.verhaal; counter.textContent = area.value.length + " / 4000";
    (t.genomineerden || []).forEach(function (n) { var i = $("nom-" + n); if (i) i.checked = true; });
    renderPreview();
    $("torrie-compose-title").textContent = "Torrie bewerken";
    $("torrie-submit").textContent = "Wijzigingen opslaan";
    $("torrie-cancel").hidden = false;
    compose.classList.add("editing"); compose.open = true;
    msg($("torrie-form-msg"), "");
    compose.scrollIntoView({ behavior: "smooth", block: "start" });
    $("torrie-title").focus({ preventScroll: true });
  }
  $("torrie-cancel").addEventListener("click", function () { resetForm(); msg($("torrie-form-msg"), ""); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var out = $("torrie-form-msg"), btn = $("torrie-submit"), p = me();
    var titel = $("torrie-title").value.trim(), verhaal = area.value.trim();
    var noms = Array.prototype.map.call(form.querySelectorAll('input[name="nom"]:checked'), function (i) { return Number(i.value); });
    if (!p) { msg(out, "Kies bovenaan eerst wie je bent.", "err"); meSel.focus(); return; }
    if (!titel) { msg(out, "Geef je torrie een titel.", "err"); $("torrie-title").focus(); return; }
    if (!noms.length) { msg(out, "Nomineer minstens één speler.", "err"); return; }
    if (!verhaal) { msg(out, "Schrijf het verhaal nog even op.", "err"); area.focus(); return; }
    btn.disabled = true;
    var ed = editing;
    (files.length ? uploadAll(out) : Promise.resolve([])).then(function (nieuw) {
      msg(out, ed ? "Wijzigingen opslaan…" : "Torrie wordt geplaatst…");
      return api(ed ? "/api/torries/" + ed.id : "/api/torries", {
        method: ed ? "PUT" : "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ wachtwoord: load("session", PW_KEY) || "", titel: titel, genomineerden: noms, verhaal: verhaal, door: p.naam, media: kept.concat(nieuw) })
      });
    }).then(function (d) {
      if (ed) {
        ["titel", "genomineerden", "verhaal", "media", "bewerkt"].forEach(function (k) { ed[k] = d.torrie[k]; });
      } else {
        torries.unshift(d.torrie);
      }
      render(); resetForm();
      msg(out, ed ? "Wijzigingen opgeslagen." : "Torrie geplaatst.", "ok");
    }).catch(function (err) {
      if (err.status === 401) { store("session", PW_KEY, null); gate.hidden = false; body.hidden = true; msg($("torrie-gate-msg"), err.message, "err"); }
      else msg(out, err.message, "err");
    }).then(function () { btn.disabled = false; });
  });

  /* ---------- Weergave ---------- */
  function score(t) { return (t.up || 0) - (t.down || 0); }
  // De volgorde wordt alleen opnieuw berekend bij laden of sorteren, zodat een torrie niet wegspringt als je erop stemt.
  var order = [];
  function resort() {
    var list = torries.slice();
    if (sortMode === "beste") list.sort(function (a, b) { return score(b) - score(a) || (b.up - a.up) || (b.id - a.id); });
    else list.sort(function (a, b) { return b.id - a.id; });
    order = list.map(function (t) { return t.id; });
  }
  function sorted() {
    var byId = {}; torries.forEach(function (t) { byId[t.id] = t; });
    var list = order.map(function (id) { return byId[id]; }).filter(Boolean);
    torries.forEach(function (t) { if (order.indexOf(t.id) < 0) list.unshift(t); });
    return list;
  }
  function mediaHtml(t) {
    if (!t.media || !t.media.length) return "";
    return '<div class="torrie-gallery">' + t.media.map(function (m) {
      var src = "/api/media/" + encodeURIComponent(m.key);
      return m.type === "video"
        ? '<video src="' + src + '" controls preload="metadata" playsinline></video>'
        : '<a href="' + src + '" target="_blank" rel="noopener"><img src="' + src + '" alt="Foto bij ' + esc(t.titel) + '" loading="lazy"></a>';
    }).join("") + "</div>";
  }
  function render() {
    var isAdmin = !!load("session", ADMIN_KEY), mine = me(), canVote = !!mine;
    var list = sorted();
    if (!list.length) {
      feed.innerHTML = '<div class="panel"><h2>Nog geen torries</h2><p>Wees de eerste: schrijf op wat er gebeurde en nomineer de hoofdrolspelers.</p></div>';
    } else {
      feed.innerHTML = list.map(function (t) {
        var noms = t.genomineerden || [];
        var photos = noms.slice(0, 5).map(function (n) {
          var p = byNr[n];
          return "<span>" + (p && p.foto ? '<img src="' + esc(p.foto) + '" alt="" loading="lazy">' : n) + "</span>";
        }).join("");
        var names = noms.map(function (n) { var p = byNr[n]; return esc(p ? p.naam : "#" + n) + (p && p.bijnaam ? ' <em>“' + esc(p.bijnaam) + "”</em>" : ""); }).join(", ");
        var dis = canVote ? "" : ' disabled title="Kies bovenaan eerst wie je bent"';
        return '<article class="torrie" data-id="' + t.id + '">' +
          '<header class="torrie-head"><div class="torrie-photos">' + photos + "</div>" +
          '<div class="torrie-meta"><span class="torrie-nom">Genomineerd: ' + names + "</span>" +
          "<h3>" + esc(t.titel) + "</h3>" +
          '<span class="torrie-by">' + (t.door ? "Ingestuurd door " + esc(t.door) : "Anoniem ingestuurd") + " · " + when(t.tijd) + (t.bewerkt ? " · bewerkt" : "") + "</span></div></header>" +
          '<p class="torrie-text">' + esc(t.verhaal) + "</p>" + mediaHtml(t) +
          '<div class="torrie-foot"><div class="votes">' +
            '<button type="button" class="tvote up' + (t.mijn > 0 ? " on" : "") + '" data-vote="1" aria-label="Upvote" aria-pressed="' + (t.mijn > 0) + '"' + dis + '>▲ ' + (t.up || 0) + "</button>" +
            '<span class="score-n" title="Score">' + score(t) + "</span>" +
            '<button type="button" class="tvote down' + (t.mijn < 0 ? " on" : "") + '" data-vote="-1" aria-label="Downvote" aria-pressed="' + (t.mijn < 0) + '"' + dis + '>▼ ' + (t.down || 0) + "</button>" +
          "</div>" +
          '<div class="torrie-actions">' +
            (mine && t.door === mine.naam ? '<button class="btn ghost small" type="button" data-edit="' + t.id + '">Bewerken</button>' : "") +
            (isAdmin ? '<button class="btn ghost small" type="button" data-delete="' + t.id + '">Verwijderen</button>' : "") +
          "</div></div></article>";
      }).join("");
    }

    var agg = {};
    torries.forEach(function (t) {
      (t.genomineerden || []).forEach(function (n) {
        agg[n] = agg[n] || { n: 0, pts: 0 };
        agg[n].n++; agg[n].pts += score(t);
      });
    });
    var ranked = Object.keys(agg).map(Number).sort(function (a, b) { return agg[b].pts - agg[a].pts || agg[b].n - agg[a].n || a - b; });
    stand.innerHTML = ranked.length
      ? ranked.map(function (n, i) {
          var p = byNr[n];
          return "<li" + (i === 0 ? ' class="first"' : "") + '><span class="stand-name">' + esc(p ? p.naam : "#" + n) + '</span><span class="stand-n"><b>' + agg[n].pts + " pt</b> · " + agg[n].n + " torrie" + (agg[n].n === 1 ? "" : "s") + "</span></li>";
        }).join("")
      : '<li class="empty">Nog geen nominaties.</li>';

    document.querySelectorAll(".seg-btn").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-sort") === sortMode); });
  }

  function loadTorries() {
    var pw = load("session", PW_KEY);
    if (!pw) return Promise.resolve();
    msg($("torrie-msg"), torries.length ? "" : "Torries laden…");
    return api("/api/torries", { headers: { "X-Wachtwoord": pw, "X-Kiezer": meSel.value || "" } }).then(function (d) {
      torries = d.torries || []; mediaEnabled = d.media !== false;
      $("torrie-media-field").hidden = !mediaEnabled;
      gate.hidden = true; body.hidden = false; msg($("torrie-msg"), ""); resort(); render();
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

  document.querySelectorAll(".seg-btn").forEach(function (b) {
    b.addEventListener("click", function () { sortMode = b.getAttribute("data-sort"); store("local", SORT_KEY, sortMode); resort(); render(); });
  });

  feed.addEventListener("click", function (e) {
    var ed = e.target.closest("[data-edit]");
    if (ed) {
      var et = torries.filter(function (x) { return x.id === Number(ed.getAttribute("data-edit")); })[0];
      if (et) startEdit(et);
      return;
    }
    var v = e.target.closest("[data-vote]");
    if (v) {
      var card = v.closest(".torrie"), id = Number(card.getAttribute("data-id"));
      var t = torries.filter(function (x) { return x.id === id; })[0];
      if (!t || !me()) return;
      var want = Number(v.getAttribute("data-vote")), waarde = t.mijn === want ? 0 : want;
      card.querySelectorAll(".tvote").forEach(function (b) { b.disabled = true; });
      api("/api/torries/" + id + "/stem", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ wachtwoord: load("session", PW_KEY) || "", kiezer: meSel.value, waarde: waarde })
      }).then(function (d) { t.up = d.up; t.down = d.down; t.mijn = d.mijn; render(); })
        .catch(function (err) { msg($("torrie-msg"), err.message, "err"); render(); });
      return;
    }
    // Verwijderen (alleen als je via de resultatenpagina als beheer bent ingelogd), met bevestiging in de pagina zelf
    var b = e.target.closest("[data-delete]");
    if (!b) return;
    if (b.getAttribute("data-confirm") !== "1") { b.setAttribute("data-confirm", "1"); b.textContent = "Zeker? Klik nogmaals om te verwijderen"; return; }
    b.disabled = true;
    api("/api/torries/" + b.getAttribute("data-delete"), { method: "DELETE", headers: { "X-Beheer": load("session", ADMIN_KEY) || "" } })
      .then(function () {
        var id = Number(b.getAttribute("data-delete"));
        if (editing && editing.id === id) resetForm();
        torries = torries.filter(function (t) { return t.id !== id; }); render();
      })
      .catch(function (err) { b.disabled = false; b.textContent = err.message; });
  });

  $("torrie-refresh").addEventListener("click", loadTorries);
  window.addEventListener("hashchange", function () {
    if (location.hash === "#torrie") {
      var s = load("local", WHO_KEY); if (s && personByKey(s) && meSel.value !== s) { meSel.value = s; syncMe(); }
      loadTorries();
    }
  });
  if (location.hash === "#torrie") loadTorries();
  else if (load("session", PW_KEY)) { gate.hidden = true; body.hidden = false; loadTorries(); }
})();
