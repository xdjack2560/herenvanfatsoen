# Heren Van Fatsoen — website

- `public/` — de website zelf (pagina's, foto's, `spelers.js`, `wedstrijden.js`, `stemmen.js`, `torrie.js`)
- `functions/api/[[route]].js` — servercode voor Heer van de Match en Ballon T'orrie

## Na een wedstrijd bijwerken
Niets meer nodig voor competitiematchen: de site haalt score, datum, zaal en wedstrijdblad (goals/assists)
automatisch van lzvcup.be (`public/lzv-sync.js` + `/api/wedstrijden`). De Heer van de Match wordt 2 dagen
na de match automatisch de winnaar van de stemming (bij gelijkstand: niemand, vul dan zelf `heer` in).

In `public/wedstrijden.js` vul je alleen nog in wat niet op LZV staat of wat je wil overschrijven:
oefenmatchen (`oefen: true`), afgelaste matchen (`afgelast: true`), of een eigen `score`, `spelers` of `heer`
(wat hier staat, gaat altijd voor op LZV).

## Instellingen in Cloudflare (Pages-project → Settings)
- Build: framework preset "None", build command leeg, build output directory `public`
- Bindings: D1-database, variabelenaam `DB`
- Variables and Secrets (type Secret):
  - `STEM_WACHTWOORD` — het wachtwoord voor de spelers
  - `BEHEER_WACHTWOORD` — om de resultaten te bekijken op `/#resultaten`
- Bindings: R2-bucket, variabelenaam `MEDIA` (voor foto's en video's bij torries; zonder deze binding verdwijnt het uploadveld gewoon)

De databasetabellen worden automatisch aangemaakt bij de eerste stem of torrie.

## Torries verwijderen
Log eerst in op `/#resultaten` met het beheerwachtwoord. Ga daarna naar Ballon T'orrie: onder elke torrie staat dan een knop Verwijderen.
