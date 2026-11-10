// API voor de Heer van de Match-stemming.
// Routes:
//   POST /api/login       { wachtwoord }                         -> controleert het stemwachtwoord
//   POST /api/stem        { wachtwoord, wedstrijd, kiezer, heer } -> slaat een stem op (of past ze aan)
//   GET  /api/resultaten  header X-Beheer: <beheerwachtwoord>     -> alle stemmen
//   GET  /api/torries     headers X-Wachtwoord, X-Kiezer (optioneel) -> alle torries met up/downvotes
//   POST /api/torries     { wachtwoord, titel, genomineerden[], verhaal, door, media[] } -> nieuwe torrie
//   POST /api/torries/<id>/stem { wachtwoord, kiezer, waarde: 1 | -1 | 0 } -> up/downvote (0 = stem weghalen)
//   PUT  /api/torries/<id> { wachtwoord, door, titel, genomineerden[], verhaal, media[] } -> eigen torrie bewerken
//   DELETE /api/torries/<id>  header X-Beheer: <beheerwachtwoord> -> torrie verwijderen
//   POST /api/media       header X-Wachtwoord, body = bestand      -> foto/video uploaden
//   GET  /api/media/<key>                                         -> foto/video tonen
//
// Nodig in Cloudflare (Pages-project -> Settings):
//   Binding  : D1-database met variabelenaam DB
//   Secret   : STEM_WACHTWOORD    (het wachtwoord voor spelers)
//   Secret   : BEHEER_WACHTWOORD  (om de resultaten te bekijken; valt terug op STEM_WACHTWOORD als het ontbreekt)
//   Binding  : R2-bucket met variabelenaam MEDIA (optioneel, voor foto's en video's bij torries)

const SCHEMA = `CREATE TABLE IF NOT EXISTS stemmen (
  wedstrijd TEXT NOT NULL,
  kiezer    TEXT NOT NULL,
  heer      INTEGER NOT NULL,
  tijd      TEXT NOT NULL,
  PRIMARY KEY (wedstrijd, kiezer)
)`;

const SCHEMA_TORRIES = `CREATE TABLE IF NOT EXISTS torries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  titel         TEXT NOT NULL,
  genomineerde  INTEGER NOT NULL,
  genomineerden TEXT,
  verhaal       TEXT NOT NULL,
  door          TEXT,
  media         TEXT,
  tijd          TEXT NOT NULL,
  bewerkt       TEXT
)`;

const SCHEMA_TORRIE_STEMMEN = `CREATE TABLE IF NOT EXISTS torrie_stemmen (
  torrie_id INTEGER NOT NULL,
  kiezer    TEXT NOT NULL,
  waarde    INTEGER NOT NULL,
  tijd      TEXT NOT NULL,
  PRIMARY KEY (torrie_id, kiezer)
)`;

const MEDIA_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,4}$/;
const MEDIA_TYPES = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
};
const MAX_IMAGE = 10 * 1048576;
const MAX_VIDEO = 90 * 1048576;
const MAX_MEDIA = 8;

let torrieSchemaReady = false;
async function ensureTorrieSchema(db) {
  if (torrieSchemaReady) return;
  await db.prepare(SCHEMA_TORRIES).run();
  // Oudere databases missen deze kolommen nog; voeg ze toe als ze ontbreken.
  for (const col of ["genomineerden TEXT", "media TEXT", "bewerkt TEXT"]) {
    try { await db.prepare("ALTER TABLE torries ADD COLUMN " + col).run(); } catch (e) {}
  }
  await db.prepare(SCHEMA_TORRIE_STEMMEN).run();
  torrieSchemaReady = true;
}

// Controleert de velden van een torrie. Geeft { fout } of { data } terug.
function parseTorrie(body) {
  const titel = String(body.titel || "").trim();
  const verhaal = String(body.verhaal || "").trim();
  const door = String(body.door || "").trim().slice(0, 60);
  const raw = Array.isArray(body.genomineerden) ? body.genomineerden : [body.genomineerde];
  const genomineerden = [...new Set(raw.map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 999);
  const media = (Array.isArray(body.media) ? body.media : [])
    .filter((m) => m && MEDIA_KEY.test(String(m.key)))
    .map((m) => ({ key: String(m.key), type: m.type === "video" ? "video" : "foto" }));
  if (!door) return { fout: "Kies eerst wie je bent. Anoniem insturen kan niet." };
  if (!titel) return { fout: "Geef je torrie een titel." };
  if (titel.length > 120) return { fout: "De titel mag maximaal 120 tekens lang zijn." };
  if (!genomineerden.length) return { fout: "Nomineer minstens één speler." };
  if (genomineerden.length > 15) return { fout: "Je kan maximaal 15 spelers nomineren." };
  if (!verhaal) return { fout: "Schrijf het verhaal nog even op." };
  if (verhaal.length > 4000) return { fout: "Het verhaal mag maximaal 4000 tekens lang zijn." };
  if (media.length > MAX_MEDIA) return { fout: "Je kan maximaal " + MAX_MEDIA + " foto's of video's toevoegen." };
  return { data: { titel, verhaal, door, genomineerden, media } };
}

function parseList(v) {
  try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch (e) { return []; }
}

function torrieRow(r) {
  const genomineerden = parseList(r.genomineerden).map(Number).filter(Number.isInteger);
  return {
    id: r.id, titel: r.titel, verhaal: r.verhaal, door: r.door, tijd: r.tijd, bewerkt: r.bewerkt || null,
    genomineerden: genomineerden.length ? genomineerden : [Number(r.genomineerde)],
    media: parseList(r.media),
    up: Number(r.up) || 0, down: Number(r.down) || 0, mijn: Number(r.mijn) || 0,
  };
}

async function serveMedia(bucket, key, request) {
  const obj = await bucket.get(key, { range: request.headers, onlyIf: request.headers });
  if (!obj) return new Response("Niet gevonden", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=31536000, immutable");
  if (!("body" in obj) || !obj.body) return new Response(null, { status: 304, headers });
  let status = 200;
  if (obj.range && request.headers.has("range")) {
    const offset = obj.range.offset !== undefined ? obj.range.offset : obj.size - obj.range.suffix;
    const length = obj.range.length !== undefined ? obj.range.length : obj.size - offset;
    headers.set("content-range", "bytes " + offset + "-" + (offset + length - 1) + "/" + obj.size);
    headers.set("content-length", String(length));
    status = 206;
  } else {
    headers.set("content-length", String(obj.size));
  }
  return new Response(request.method === "HEAD" ? null : obj.body, { status, headers });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function sameSecret(given, expected) {
  if (typeof given !== "string" || typeof expected !== "string" || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function vandaag() {
  // Datum in Brussel, zodat een match van 22u00 dezelfde avond al stembaar is.
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Brussels" }).format(new Date());
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

export async function onRequest({ request, env, params }) {
  const route = (params.route || []).join("/");
  const method = request.method;

  if (!env.STEM_WACHTWOORD) return json({ fout: "Het stemwachtwoord is nog niet ingesteld op de server." }, 503);
  if (!env.DB) return json({ fout: "De database is nog niet gekoppeld aan de site." }, 503);

  if (route === "login" && method === "POST") {
    const body = await readJson(request);
    const ok = await sameSecret(body && body.wachtwoord, env.STEM_WACHTWOORD);
    return ok ? json({ ok: true }) : json({ fout: "Dat wachtwoord klopt niet." }, 401);
  }

  if (route === "stem" && method === "POST") {
    const body = await readJson(request);
    if (!body || !(await sameSecret(body.wachtwoord, env.STEM_WACHTWOORD))) {
      return json({ fout: "Dat wachtwoord klopt niet. Log opnieuw in." }, 401);
    }
    const wedstrijd = String(body.wedstrijd || "");
    const kiezer = String(body.kiezer || "").slice(0, 60);
    const heer = Number(body.heer);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(wedstrijd)) return json({ fout: "Kies een wedstrijd." }, 400);
    if (wedstrijd > vandaag()) return json({ fout: "Die wedstrijd is nog niet gespeeld." }, 400);
    if (!kiezer) return json({ fout: "Kies eerst je eigen naam." }, 400);
    if (!Number.isInteger(heer) || heer < 0 || heer > 999) return json({ fout: "Kies wie de Heer van de Match was." }, 400);

    await env.DB.prepare(SCHEMA).run();
    const tijd = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO stemmen (wedstrijd, kiezer, heer, tijd) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (wedstrijd, kiezer) DO UPDATE SET heer = excluded.heer, tijd = excluded.tijd`
    ).bind(wedstrijd, kiezer, heer, tijd).run();
    return json({ ok: true, wedstrijd, kiezer, heer, tijd });
  }

  if (route === "resultaten" && method === "GET") {
    const beheer = env.BEHEER_WACHTWOORD || env.STEM_WACHTWOORD;
    if (!(await sameSecret(request.headers.get("X-Beheer"), beheer))) {
      return json({ fout: "Dat beheerwachtwoord klopt niet." }, 401);
    }
    await env.DB.prepare(SCHEMA).run();
    const { results } = await env.DB.prepare(
      "SELECT wedstrijd, kiezer, heer, tijd FROM stemmen ORDER BY wedstrijd DESC, tijd ASC"
    ).all();
    return json({ stemmen: results || [] });
  }

  // ---------- Ballon T'orrie ----------
  const parts = route.split("/");

  // Foto's en video's tonen. Geen wachtwoord nodig (een <img>/<video> kan geen header meesturen),
  // maar de bestandsnamen zijn willekeurig en alleen zichtbaar voor wie ingelogd is.
  if (parts[0] === "media" && parts.length === 2 && (method === "GET" || method === "HEAD")) {
    if (!env.MEDIA) return json({ fout: "Opslag voor foto's en video's is niet gekoppeld." }, 503);
    if (!MEDIA_KEY.test(parts[1])) return json({ fout: "Onbekend bestand." }, 404);
    return serveMedia(env.MEDIA, parts[1], request);
  }

  if (parts[0] === "media" && parts.length === 1 && method === "POST") {
    if (!(await sameSecret(request.headers.get("X-Wachtwoord"), env.STEM_WACHTWOORD))) {
      return json({ fout: "Dat wachtwoord klopt niet. Log opnieuw in." }, 401);
    }
    if (!env.MEDIA) return json({ fout: "Foto's en video's uploaden is nog niet ingesteld op de server." }, 503);
    const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const ext = MEDIA_TYPES[type];
    if (!ext) return json({ fout: "Dit bestandstype wordt niet ondersteund. Gebruik een foto (JPG, PNG, WebP, GIF) of video (MP4, MOV, WebM)." }, 400);
    const size = Number(request.headers.get("content-length") || 0);
    const max = type.startsWith("video/") ? MAX_VIDEO : MAX_IMAGE;
    if (size > max) return json({ fout: "Dit bestand is te groot (max " + Math.round(max / 1048576) + " MB)." }, 413);
    const key = crypto.randomUUID() + "." + ext;
    const obj = await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: type } });
    if (obj && obj.size > max) { await env.MEDIA.delete(key); return json({ fout: "Dit bestand is te groot." }, 413); }
    return json({ ok: true, key, type: type.startsWith("video/") ? "video" : "foto" });
  }

  if (parts[0] === "torries" && parts.length === 1 && method === "GET") {
    if (!(await sameSecret(request.headers.get("X-Wachtwoord"), env.STEM_WACHTWOORD))) {
      return json({ fout: "Dat wachtwoord klopt niet. Log opnieuw in." }, 401);
    }
    await ensureTorrieSchema(env.DB);
    const kiezer = String(request.headers.get("X-Kiezer") || "").slice(0, 60);
    const { results } = await env.DB.prepare(
      `SELECT t.id, t.titel, t.genomineerde, t.genomineerden, t.verhaal, t.door, t.media, t.tijd, t.bewerkt,
              COALESCE(SUM(CASE WHEN s.waarde > 0 THEN 1 ELSE 0 END), 0) AS up,
              COALESCE(SUM(CASE WHEN s.waarde < 0 THEN 1 ELSE 0 END), 0) AS down,
              MAX(CASE WHEN s.kiezer = ?1 THEN s.waarde END) AS mijn
       FROM torries t LEFT JOIN torrie_stemmen s ON s.torrie_id = t.id
       GROUP BY t.id ORDER BY t.id DESC`
    ).bind(kiezer).all();
    return json({ torries: (results || []).map(torrieRow), media: !!env.MEDIA });
  }

  if (parts[0] === "torries" && parts.length === 1 && method === "POST") {
    const body = await readJson(request);
    if (!body || !(await sameSecret(body.wachtwoord, env.STEM_WACHTWOORD))) {
      return json({ fout: "Dat wachtwoord klopt niet. Log opnieuw in." }, 401);
    }
    const parsed = parseTorrie(body);
    if (parsed.fout) return json({ fout: parsed.fout }, 400);
    const { titel, verhaal, door, genomineerden, media } = parsed.data;

    await ensureTorrieSchema(env.DB);
    const tijd = new Date().toISOString();
    const r = await env.DB.prepare(
      "INSERT INTO torries (titel, genomineerde, genomineerden, verhaal, door, media, tijd) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
    ).bind(titel, genomineerden[0], JSON.stringify(genomineerden), verhaal, door, JSON.stringify(media), tijd).run();
    const id = r && r.meta ? r.meta.last_row_id : null;
    return json({ ok: true, torrie: { id, titel, genomineerden, verhaal, door, media, tijd, up: 0, down: 0, mijn: 0 } });
  }

  if (parts[0] === "torries" && parts.length === 2 && method === "PUT") {
    const body = await readJson(request);
    if (!body || !(await sameSecret(body.wachtwoord, env.STEM_WACHTWOORD))) {
      return json({ fout: "Dat wachtwoord klopt niet. Log opnieuw in." }, 401);
    }
    const id = Number(parts[1]);
    if (!Number.isInteger(id)) return json({ fout: "Onbekende torrie." }, 400);
    const parsed = parseTorrie(body);
    if (parsed.fout) return json({ fout: parsed.fout }, 400);
    const { titel, verhaal, door, genomineerden, media } = parsed.data;
    await ensureTorrieSchema(env.DB);
    const found = await env.DB.prepare("SELECT door, media FROM torries WHERE id = ?1").bind(id).all();
    const oud = found.results && found.results[0];
    if (!oud) return json({ fout: "Deze torrie bestaat niet meer." }, 404);
    if (!oud.door || oud.door !== door) return json({ fout: "Je kan alleen je eigen torries bewerken." }, 403);
    const bewerkt = new Date().toISOString();
    await env.DB.prepare(
      "UPDATE torries SET titel = ?1, genomineerde = ?2, genomineerden = ?3, verhaal = ?4, media = ?5, bewerkt = ?6 WHERE id = ?7"
    ).bind(titel, genomineerden[0], JSON.stringify(genomineerden), verhaal, JSON.stringify(media), bewerkt, id).run();
    // Foto's en video's die uit de torrie gehaald zijn, ook uit de opslag verwijderen.
    const blijft = new Set(media.map((m) => m.key));
    const weg = parseList(oud.media).map((m) => m.key).filter((k) => MEDIA_KEY.test(k) && !blijft.has(k));
    if (weg.length && env.MEDIA) { try { await env.MEDIA.delete(weg); } catch (e) {} }
    return json({ ok: true, torrie: { id, titel, genomineerden, verhaal, door, media, bewerkt } });
  }

  if (parts[0] === "torries" && parts.length === 3 && parts[2] === "stem" && method === "POST") {
    const body = await readJson(request);
    if (!body || !(await sameSecret(body.wachtwoord, env.STEM_WACHTWOORD))) {
      return json({ fout: "Dat wachtwoord klopt niet. Log opnieuw in." }, 401);
    }
    const id = Number(parts[1]);
    const kiezer = String(body.kiezer || "").trim().slice(0, 60);
    const waarde = Number(body.waarde);
    if (!Number.isInteger(id)) return json({ fout: "Onbekende torrie." }, 400);
    if (!kiezer) return json({ fout: "Kies eerst wie je bent." }, 400);
    if (![-1, 0, 1].includes(waarde)) return json({ fout: "Ongeldige stem." }, 400);
    await ensureTorrieSchema(env.DB);
    const bestaat = await env.DB.prepare("SELECT id FROM torries WHERE id = ?1").bind(id).all();
    if (!bestaat.results || !bestaat.results.length) return json({ fout: "Deze torrie bestaat niet meer." }, 404);
    if (waarde === 0) {
      await env.DB.prepare("DELETE FROM torrie_stemmen WHERE torrie_id = ?1 AND kiezer = ?2").bind(id, kiezer).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO torrie_stemmen (torrie_id, kiezer, waarde, tijd) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (torrie_id, kiezer) DO UPDATE SET waarde = excluded.waarde, tijd = excluded.tijd`
      ).bind(id, kiezer, waarde, new Date().toISOString()).run();
    }
    const t = await env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN waarde > 0 THEN 1 ELSE 0 END), 0) AS up,
              COALESCE(SUM(CASE WHEN waarde < 0 THEN 1 ELSE 0 END), 0) AS down
       FROM torrie_stemmen WHERE torrie_id = ?1`
    ).bind(id).all();
    const row = (t.results && t.results[0]) || { up: 0, down: 0 };
    return json({ ok: true, id, up: Number(row.up), down: Number(row.down), mijn: waarde });
  }

  if (parts[0] === "torries" && parts.length === 2 && method === "DELETE") {
    const beheer = env.BEHEER_WACHTWOORD || env.STEM_WACHTWOORD;
    if (!(await sameSecret(request.headers.get("X-Beheer"), beheer))) {
      return json({ fout: "Alleen beheer kan torries verwijderen." }, 401);
    }
    const id = Number(parts[1]);
    if (!Number.isInteger(id)) return json({ fout: "Onbekende torrie." }, 400);
    await ensureTorrieSchema(env.DB);
    const found = await env.DB.prepare("SELECT media FROM torries WHERE id = ?1").bind(id).all();
    const keys = found.results && found.results[0] ? parseList(found.results[0].media).map((m) => m.key).filter((k) => MEDIA_KEY.test(k)) : [];
    await env.DB.prepare("DELETE FROM torrie_stemmen WHERE torrie_id = ?1").bind(id).run();
    await env.DB.prepare("DELETE FROM torries WHERE id = ?1").bind(id).run();
    if (keys.length && env.MEDIA) { try { await env.MEDIA.delete(keys); } catch (e) {} }
    return json({ ok: true });
  }

  return json({ fout: "Onbekende route." }, 404);
}
