// Atalaya: prueba que las webs de la casa respondan y deja el estado en estado.json y ESTADO.md.
// Lo corre GitHub Actions cada 5 minutos (.github/workflows/atalaya.yml). Sale con 1 solo cuando hay que
// avisar (una caída nueva, o la misma caída cada REALERT_HOURS): esa corrida fallida es la que hace que
// GitHub mande su correo de «workflow failed». Sin dependencias: Node 20+ trae fetch.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const SITES = [
  { name: "inmo · plataforma", url: "https://inmo.ssslabs.com.ar/api/health", expect: (body) => body.includes('"status":"ok"') },
  { name: "inmo · demo (pasa por el Worker)", url: "https://inmo-demo.ssslabs.com.ar/" },
  { name: "ssslabs", url: "https://ssslabs.com.ar/" },
  { name: "silphy", url: "https://silphy.ssslabs.com.ar/api/salud", expect: (body) => body.includes('"ok":true') },
  { name: "cargo · plataforma", url: "https://cargo.ssslabs.com.ar/api/health", expect: (body) => body.includes('"status":"ok"') },
  { name: "cargo · demo (el panel de una agencia)", url: "https://cargo-demo.ssslabs.com.ar/admin/login" },
];

const TIMEOUT_MS = 20_000;
// Un corte de segundos (un deploy, la red de GitHub) no es una caída: se reintenta antes de darla por buena.
const RETRY_DELAY_MS = 30_000;
// Mientras siga caído, se vuelve a avisar cada tanto (un solo correo por caída se pierde fácil).
const REALERT_HOURS = 6;
// GitHub apaga los flujos programados de un repo sin actividad en 60 días: un commit por semana lo mantiene vivo.
const KEEPALIVE_DAYS = 7;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function probe(site) {
  const started = Date.now();
  try {
    const response = await fetch(site.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "atalaya (monitor de caídas de caviglia80)" },
    });
    const body = await response.text();
    const ok = response.status === 200 && (site.expect ? site.expect(body) : true);
    return { ok, status: response.status, ms: Date.now() - started, error: ok ? null : `respondió ${response.status}${site.expect ? " sin el estado esperado" : ""}` };
  } catch (error) {
    return { ok: false, status: null, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
  }
}

async function check(site) {
  const first = await probe(site);
  if (first.ok) return { name: site.name, url: site.url, ...first };
  await sleep(RETRY_DELAY_MS);
  const second = await probe(site);
  return { name: site.name, url: site.url, ...second };
}

function readPrevious() {
  if (!existsSync("estado.json")) return null;
  try {
    return JSON.parse(readFileSync("estado.json", "utf8"));
  } catch {
    return null;
  }
}

function render(state) {
  const icon = (ok) => (ok ? "🟢" : "🔴");
  const rows = state.results.map((r) => `| ${icon(r.ok)} ${r.name} | ${r.url} | ${r.ok ? `${r.ms} ms` : r.error} |`).join("\n");
  const incidents = state.incidents.slice(0, 20).map((i) => `- ${i.at} · ${i.text}`).join("\n") || "- Sin caídas registradas.";
  return `# Estado

Última vez que cambió algo o que se confirmó que todo sigue igual: **${state.writtenAt}** (UTC). Cada corrida, cada
5 minutos, se ve en la pestaña *Actions* del repo; este archivo se reescribe cuando algo cambia y, si no, una vez por
semana.

| Sitio | Dirección | Respuesta |
|---|---|---|
${rows}

## Caídas y vueltas (las 20 más recientes)

${incidents}
`;
}

const now = new Date();
const previous = readPrevious();
const results = await Promise.all(SITES.map(check));
const down = results.filter((r) => !r.ok).map((r) => r.name);
const wasDown = previous?.down ?? [];
const changed = JSON.stringify([...down].sort()) !== JSON.stringify([...wasDown].sort());

const incidents = [...(previous?.incidents ?? [])];
for (const name of down.filter((n) => !wasDown.includes(n))) incidents.unshift({ at: now.toISOString(), text: `🔴 ${name} dejó de responder` });
for (const name of wasDown.filter((n) => !down.includes(n))) incidents.unshift({ at: now.toISOString(), text: `🟢 ${name} volvió` });

// Se avisa con una caída nueva y, mientras siga, cada REALERT_HOURS.
const lastAlert = previous?.alertedAt ? new Date(previous.alertedAt).getTime() : 0;
const newlyDown = down.some((n) => !wasDown.includes(n));
const alert = down.length > 0 && (newlyDown || now.getTime() - lastAlert > REALERT_HOURS * 3_600_000);

const lastWrite = previous?.writtenAt ? new Date(previous.writtenAt).getTime() : 0;
const keepalive = now.getTime() - lastWrite > KEEPALIVE_DAYS * 86_400_000;

for (const r of results) console.log(`${r.ok ? "OK  " : "MAL "} ${r.name} · ${r.ok ? `${r.status} en ${r.ms} ms` : r.error}`);

if (changed || alert || keepalive || previous === null) {
  const state = {
    writtenAt: now.toISOString(),
    down,
    alertedAt: alert ? now.toISOString() : (down.length > 0 ? previous?.alertedAt ?? null : null),
    results,
    incidents: incidents.slice(0, 50),
  };
  writeFileSync("estado.json", `${JSON.stringify(state, null, 2)}\n`);
  writeFileSync("ESTADO.md", render(state));
  console.log("estado reescrito");
}

if (alert) {
  console.error(`::error::No responde: ${down.join(", ")}`);
  process.exit(1);
}
