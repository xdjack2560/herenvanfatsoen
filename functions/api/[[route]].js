// API voor de Heer van de Match-stemming.
// Routes:
//   POST /api/login       { wachtwoord }                         -> controleert het stemwachtwoord
//   POST /api/stem        { wachtwoord, wedstrijd, kiezer, heer } -> slaat een stem op (of past ze aan)
//   GET  /api/resultaten  header X-Beheer: <beheerwachtwoord>     -> alle stemmen
//
// Nodig in Cloudflare (Pages-project -> Settings):
//   Binding  : D1-database met variabelenaam DB
//   Secret   : STEM_WACHTWOORD    (het wachtwoord voor spelers)
//   Secret   : BEHEER_WACHTWOORD  (om de resultaten te bekijken; valt terug op STEM_WACHTWOORD als het ontbreekt)

const SCHEMA = `CREATE TABLE IF NOT EXISTS stemmen (
  wedstrijd TEXT NOT NULL,
  kiezer    TEXT NOT NULL,
  heer      INTEGER NOT NULL,
  tijd      TEXT NOT NULL,
  PRIMARY KEY (wedstrijd, kiezer)
)`;

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
    if (kiezer === String(heer)) return json({ fout: "Je kan niet op jezelf stemmen." }, 400);

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

  return json({ fout: "Onbekende route." }, 404);
}
