# atalaya

Monitor de caídas de las webs de la casa, sin servidores ni cuentas: un flujo de GitHub Actions que cada 5 minutos
prueba que respondan y, si alguna deja de hacerlo, **falla**. Esa corrida fallida es la que hace que GitHub mande su
correo de «workflow failed» a la cuenta dueña del repo.

| Qué mira | Cómo sabe que anda |
|---|---|
| inmo · plataforma | `https://inmo.ssslabs.com.ar/api/health` responde 200 con `"status":"ok"` (la app y su base) |
| inmo · demo | `https://inmo-demo.ssslabs.com.ar/` responde 200 (un sitio de cliente, que pasa por el Worker de Cloudflare) |
| ssslabs | `https://ssslabs.com.ar/` responde 200 |
| silphy | `https://silphy.ssslabs.com.ar/api/salud` responde 200 con `"ok":true` |

- **Sin falsas alarmas por un corte de segundos**: si algo falla, se vuelve a probar a los 30 s antes de darlo por caído.
- **Un correo por caída**: avisa cuando algo se cae y, si sigue caído, cada 6 horas; la vuelta queda en `ESTADO.md`.
- **Panel**: [`ESTADO.md`](ESTADO.md) (estado de cada sitio y las últimas caídas) y la pestaña *Actions* (cada corrida).
- **Siempre vivo**: GitHub apaga los flujos programados de un repo sin actividad en 60 días; el propio flujo reescribe
  `ESTADO.md` al menos una vez por semana.
- **Gratis**: el repo es público porque los flujos de un repo público no gastan minutos de Actions. No tiene secretos:
  solo direcciones que ya son públicas.

Para sumar o sacar un sitio, editar `SITES` en [`check.mjs`](check.mjs). Para probarlo a mano: *Actions › atalaya ›
Run workflow*, o `node check.mjs` en la máquina (Node 20 o más).

Nació el 2026-10-30 para INMO-15 del monorepo `lab` (un monitor externo de caídas), en lugar de una cuenta de UptimeRobot.
