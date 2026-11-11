// Spelerslijst — pas hier namen, bijnamen en foto's aan.
// foto: pad naar de foto in de map img/spelers/ (bv. "img/spelers/5.jpg"), of "" als er nog geen is.
// staf: true zet iemand onder "Staf" in plaats van bij de spelers.
// kruis: true zet een ✝ achter de naam, overal op de site.
window.SPELERS = [
  { nummer: 1,  naam: "Louis Depreeuw",    bijnaam: "Mustafa",      foto: "img/spelers/1.jpg" },
  { nummer: 2,  naam: "Lucas Buhendwa",    bijnaam: "Caske",        foto: "img/spelers/2.jpg" },
  { nummer: 3,  naam: "Wolf Smets",        bijnaam: "El Luchador",  foto: "img/spelers/3.jpg" },
  { nummer: 5,  naam: "Jack Goormans",     bijnaam: "The Giant",    foto: "img/spelers/5.jpg" },
  { nummer: 6,  naam: "Jonas Wuyts",       bijnaam: "Jokke Sins",   foto: "img/spelers/6.jpg", kruis: true },
  { nummer: 7,  naam: "Maxime Seutin",     bijnaam: "Capi",         foto: "img/spelers/7.jpg" },
  { nummer: 8,  naam: "Hendrik Smets",     bijnaam: "Thrust King",  foto: "img/spelers/8.jpg" },
  { nummer: 9,  naam: "Niels Cardoen",     bijnaam: "Camel",        foto: "img/spelers/9.jpg" },
  { nummer: 10, naam: "Maarten De Feyter", bijnaam: "Great White",  foto: "img/spelers/10.jpg", rol: "Teammanager" },
  { nummer: 11, naam: "Sterre Dieltjens",  bijnaam: "Blitzkrieg",   foto: "img/spelers/11.jpg" },
  { nummer: 17, naam: "Wies Goossens",     bijnaam: "Trapjack",     foto: "img/spelers/17.jpg" },
  { nummer: 20, naam: "Gilles Berghmans",  bijnaam: "",             foto: "" },
  { nummer: 22, naam: "Len Dieltiens",     bijnaam: "Baffinator",   foto: "img/spelers/22.jpg" },
  { nummer: 93, naam: "Pieter Dieltjens",  bijnaam: "The Kenyan",   foto: "img/spelers/93.jpg" },
  { nummer: 94, naam: "Alexander Keersmaekers", bijnaam: "",      foto: "" },

  { nummer: 11, naam: "PMD",               bijnaam: "",             foto: "img/spelers/coach.jpg", rol: "Coach", staf: true }
];

// Naam zoals hij op de site getoond wordt (met ✝ als kruis: true). kort = alleen voornaam.
window.naamVan = function (p, kort) {
  if (!p) return "";
  var n = kort ? p.naam.split(" ")[0] : p.naam;
  return p.kruis ? n + " \u271D" : n;
};
// Zelfde, maar voor een naam die als tekst opgeslagen is (bv. "ingestuurd door").
window.naamVanTekst = function (naam) {
  var p = (window.SPELERS || []).filter(function (x) { return x.naam === naam; })[0];
  return p ? window.naamVan(p) : naam;
};
