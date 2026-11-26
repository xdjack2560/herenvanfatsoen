// In de Android-app geeft de app het ploegwachtwoord door, zodat spelers daar niet hoeven in te loggen.
// (Het beheerwachtwoord voor de resultaten blijft altijd nodig.)
try {
  if (window.HVFApp && window.HVFApp.wachtwoord && !sessionStorage.getItem("hvf-stem-wachtwoord")) {
    var hvfAppPw = window.HVFApp.wachtwoord();
    if (hvfAppPw) sessionStorage.setItem("hvf-stem-wachtwoord", hvfAppPw);
  }
} catch (e) {}

// Spelerslijst — pas hier namen, bijnamen en foto's aan.
// foto: pad naar de foto in de map img/spelers/ (bv. "img/spelers/5.jpg"), of "" als er nog geen is.
// staf: true zet iemand onder "Staf" in plaats van bij de spelers.
// kruis: true zet een ✝ achter de naam, overal op de site.
window.SPELERS = [
  { nummer: 1,  naam: "Louis Depreeuw",    bijnaam: "Mustafa",      foto: "img/spelers/1.jpg" },
  { nummer: 2,  naam: "Lucas Buhendwa",    bijnaam: "Caske",        foto: "img/spelers/2.jpg" },
  { nummer: 3,  naam: "Wolf Smets",        bijnaam: "El Luchador",  foto: "img/spelers/3.jpg" },
  { nummer: 5,  naam: "Jack Goormans",     bijnaam: "Vector",    foto: "img/spelers/5.jpg" },
  { nummer: 6,  naam: "Jonas Wuyts",       bijnaam: "Jokke Sins",   foto: "img/spelers/6.jpg" },
  { nummer: 7,  naam: "Maxime Seutin",     bijnaam: "Capi",         foto: "img/spelers/7.jpg" },
  { nummer: 8,  naam: "Hendrik Smets",     bijnaam: "Thrust King",  foto: "img/spelers/8.jpg" },
  { nummer: 9,  naam: "Niels Cardoen",     bijnaam: "Camel",        foto: "img/spelers/9.jpg" },
  { nummer: 10, naam: "Maarten De Feyter", bijnaam: "Great White",  foto: "img/spelers/10.jpg", rol: "Teammanager" },
  { nummer: 11, naam: "Sterre Dieltjens",  bijnaam: "Blitzkrieg",   foto: "img/spelers/11.jpg" },
  { nummer: 17, naam: "Wies Goossens",     bijnaam: "Trapjack",     foto: "img/spelers/17.jpg" },
  { nummer: 20, naam: "G.B.", bijnaam: "", foto: "" }, // openbaar alleen initialen; volledige naam achter het wachtwoord (zie /api/namen)
  { nummer: 22, naam: "Len Dieltiens",     bijnaam: "Baffinator",   foto: "img/spelers/22.jpg" },
  { nummer: 93, naam: "Pieter Dieltjens",  bijnaam: "The Kenyan",   foto: "img/spelers/93.jpg" },
  { nummer: 94, naam: "Alexander Keersmaekers", bijnaam: "",      foto: "" },

  { nummer: 11, naam: "PMD",               bijnaam: "",             foto: "img/spelers/coach.jpg", rol: "Coach", staf: true }
];

// Naam zoals hij op de site getoond wordt (met ✝ als kruis: true). kort = alleen voornaam.
// Verborgen namen tonen als bewegende tekens (scramble.js); achter het wachtwoord de echte naam (prive = true).
window.HVF_VERBORGEN = "\u2591\u2591\u2591\u2591\u2591\u2591";
window.naamVan = function (p, kort, prive) {
  if (!p) return "";
  var naam = (prive && p.echteNaam) || p.naam;
  if (!naam) return window.HVF_VERBORGEN;
  var n = kort ? naam.split(" ")[0] : naam;
  return p.kruis ? n + " \u271D" : n;
};
// Zelfde, maar voor een naam die als tekst opgeslagen is (bv. "ingestuurd door").
window.naamVanTekst = function (naam) {
  var p = (window.SPELERS || []).filter(function (x) { return x.naam === naam; })[0];
  return p ? window.naamVan(p) : naam;
};

// Naam voor pagina's achter het wachtwoord.
window.naamPriv = function (p, kort) { return window.naamVan(p, kort, true); };
window.echteNaam = function (p) { return p ? (p.echteNaam || p.naam || "") : ""; };
// Haalt na het inloggen de verborgen namen op en laat de wachtwoordpagina's opnieuw tekenen.
window.hvfLaadNamen = function (pw) {
  if (!pw || !window.fetch) return;
  fetch("/api/namen", { headers: { "X-Wachtwoord": pw } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !d.namen) return;
    (window.SPELERS || []).forEach(function (p) { if (d.namen[p.nummer]) p.echteNaam = d.namen[p.nummer]; });
    try { window.dispatchEvent(new Event("hvf:namen")); } catch (e) {}
  }).catch(function () {});
};
