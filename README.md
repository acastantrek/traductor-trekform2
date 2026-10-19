# ClassTranslate

Subtítulos traducidos en tiempo real para clases presenciales. El profesor habla y cada alumno lee la traducción en su móvil, entrando por QR. Requisitos en [docs/prd_classtranslate.md](docs/prd_classtranslate.md). Pendientes en [docs/deferred-work.md](docs/deferred-work.md).

Estado: **F0–F3**. Incluye pipeline de audio → STT → traducción → sala con QR, login de profesores (email + contraseña), cursos, sesiones persistidas y métricas agregadas.

## Estructura

```
apps/api         Fastify + WebSocket. Sesiones en directo en memoria; cursos, sesiones y métricas en Supabase
apps/web         React + Vite: /login · / (mis cursos) · /admin · /t/:id (panel profesor) · /s/:id (alumno, sin cuenta)
packages/shared  Contrato REST/WS compartido (tipos, idiomas)
supabase/        config.toml (puertos 556xx) y migraciones
docs/            PRD y trabajo pendiente
```

## Arranque local

Requisitos: Node 24 y Docker Desktop abierto.

```bash
npm install
npx supabase start          # Supabase local en 556xx (API 55621, DB 55622, Studio 55623)
```

Crea los `.env` con los valores de `npx supabase status`:

| Archivo | Variables |
|---|---|
| `apps/api/.env` | `SUPABASE_URL` (API_URL), `SUPABASE_SECRET_KEY` (SECRET_KEY) |
| `apps/web/.env` | `VITE_SUPABASE_URL` (API_URL), `VITE_SUPABASE_PUBLISHABLE_KEY` (PUBLISHABLE_KEY) |
| `.env` (raíz) | `DEEPGRAM_API_KEY`, `GOOGLE_TRANSLATE_API_KEY` (opcionales) |

El registro público está desactivado. Crea el primer admin:

```bash
npm run user:create -w @ct/api -- --email tu@email --password 'min-8-caracteres' --name 'Tu nombre' --admin
npm run dev                 # api :3001 + web :5173
```

Desde `/admin` el admin crea profesores y cursos (idioma del profesor: castellano o catalán, idiomas de destino y profesores asignados). Cada profesor ve sus cursos, pulsa *Preparar clase* y en el panel *Iniciar clase*.

Sin claves de proveedor, el backend usa **mocks**: una frase de ejemplo cada ~3 s de audio y traducciones `[en] …`. `GET /api/health` indica qué proveedores están activos.

Móviles en la misma red: abre el panel con la IP del portátil o define `VITE_PUBLIC_APP_URL` en `apps/web/.env` para que el QR apunte ahí. El micrófono del profesor solo funciona en `localhost` o HTTPS.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | API y web en modo desarrollo |
| `npm test` | Tests unitarios y de API (sin dependencias externas) |
| `npm run test:db -w @ct/api` | Integración contra Supabase **local** (se niega a correr contra otra URL) |
| `npm run test:e2e` | E2E con Playwright (requiere `npx supabase start`) |
| `npm run typecheck` | TypeScript en todos los paquetes y E2E |
| `npm run build` | Build de producción de la web |
| `npm run user:create -w @ct/api -- …` | Crear usuario (profesor o `--admin`) |

## Tests E2E

`npm run test:e2e` levanta su propia API (STT y traducción mock) en `:3101` y su propia web en `:5199`, así que puede convivir con `npm run dev`. Chrome usa un micrófono simulado. Cada ejecución crea un admin desechable en Supabase local y borra al terminar todo lo que ha creado.

Qué cubre:
- El admin crea un profesor y un curso desde la UI.
- El profesor prepara e inicia la clase.
- Dos alumnos sin cuenta (inglés y francés) reciben los subtítulos.
- Otro profesor no puede abrir el panel.
- Al cortar el WebSocket de un alumno, este se reconecta y recupera el buffer sin duplicados.
- Pausa y reanudación, cambio de idioma en directo y fin de la clase.
- Al terminar, el estado y las métricas quedan guardados en la BD.
- Accesos: redirecciones al login, credenciales incorrectas, `/admin` prohibido a profesores, cerrar sesión y sala inexistente.

Informe HTML de la última ejecución en `e2e/report/` (`npx playwright show-report e2e/report`).

## Diseño

- **Una traducción por segmento e idioma activo**, compartida por todos los alumnos de ese idioma (AC-05).
- Un idioma se activa al llegar el primer alumno. Al activarse traduce los últimos 3 segmentos y se desactiva `LANGUAGE_GRACE_MS` después de que se vaya el último.
- Buffer de los últimos `BUFFER_SIZE` segmentos para reconectar con `?since=<seq>` (FR-12).
- Pausa y fin cierran el stream STT. Sin profesor conectado tampoco hay stream abierto.
- El fallo de un idioma no corta los demás. Hay un circuit breaker por idioma (3 fallos → 30 s).
- **Autenticación**: Supabase Auth en el navegador. La API valida el access token con `auth.getUser` y lee el rol de `profiles`. Solo el profesor de la sesión o un admin la controlan, también por WebSocket (`hello`).
- **Datos**: todo acceso a tablas pasa por la API con la secret key. RLS activado sin políticas para `anon` y `authenticated`, así que el navegador no puede leer ni escribir directamente.
- **Privacidad (PRD §10)**: no se guarda audio ni texto. En la BD solo quedan cursos, sesiones (estado y fechas) y métricas agregadas (duración, segmentos, caracteres, latencia mediana/p95, errores, pico de alumnos, idiomas usados).
- Al arrancar, la API marca como finalizadas las sesiones abiertas de una ejecución anterior, porque el estado en directo vive en memoria.
