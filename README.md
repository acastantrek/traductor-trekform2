# ClassTranslate

Subtítulos traducidos en tiempo real para clases presenciales. El profesor habla y cada alumno lee la traducción en su móvil, entrando por QR. Requisitos en [docs/prd_classtranslate.md](docs/prd_classtranslate.md).

Estado: **F0–F2** (micrófono → STT → traducción → sala multiusuario con QR). Sin login ni base de datos todavía (F3).

## Estructura

```
apps/api         Fastify + WebSocket: sesiones en memoria, pipeline STT → segmentos → traducción → fan-out
apps/web         React + Vite: /  (crear clase) · /t/:id (panel profesor) · /s/:id (alumno)
packages/shared  Contrato REST/WS compartido (tipos de eventos, idiomas)
docs/            PRD
```

## Arranque

```bash
npm install
cp apps/api/.env.example apps/api/.env   # opcional: claves reales
npm run dev                              # api :3001 + web :5173
```

Sin claves, el backend usa proveedores **mock**: una frase de ejemplo cada ~3 s de audio y traducciones `[en] …`. Con `DEEPGRAM_API_KEY` y `GOOGLE_TRANSLATE_API_KEY` en `apps/api/.env` usa los reales. `GET /api/health` indica cuáles están activos.

Móviles en la misma red: abre el panel con la IP del portátil (`http://192.168.x.x:5173`) o define `VITE_PUBLIC_APP_URL` en `apps/web/.env` para que el QR apunte ahí. El micrófono del profesor solo funciona en `localhost` o HTTPS.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | API y web en modo desarrollo |
| `npm test` | Tests del backend (Vitest) |
| `npm run typecheck` | TypeScript en todos los paquetes |
| `npm run build` | Build de producción de la web |

## Diseño

- **Una traducción por segmento e idioma activo**, compartida por todos los alumnos de ese idioma (AC-05).
- Un idioma se activa al llegar el primer alumno. Al activarse traduce los últimos 3 segmentos y se desactiva `LANGUAGE_GRACE_MS` después de que se vaya el último.
- Buffer de los últimos `BUFFER_SIZE` segmentos para reconectar con `?since=<seq>` (FR-12).
- Pausa y fin cierran el stream STT. Sin profesor conectado tampoco hay stream abierto.
- El fallo de un idioma no corta los demás. Hay un circuit breaker por idioma (3 fallos → 30 s).
- Las claves de los proveedores solo están en el backend. El token de profesor se guarda hasheado y los logs no registran query strings ni contenido.
