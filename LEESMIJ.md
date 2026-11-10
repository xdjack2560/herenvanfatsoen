# Heren Van Fatsoen — website

- `public/` — de website zelf (pagina's, foto's, `spelers.js`, `wedstrijden.js`, `stemmen.js`, `torrie.js`)
- `functions/api/[[route]].js` — servercode voor Heer van de Match en Ballon T'orrie

## Na een wedstrijd bijwerken
Open `public/wedstrijden.js` en vul bij de match in (extra opties: `oefen: true`, `afgelast: true`, `datum: null` voor nog te plannen):
- `score: [thuis, uit]`
- `heer:` het rugnummer van de Heer van de Match (staat op de resultatenpagina)
- `spelers:` per speler `{ nr, goals, assists }`

Opslaan (commit) in GitHub, en Cloudflare zet de nieuwe versie binnen een minuut online.

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
