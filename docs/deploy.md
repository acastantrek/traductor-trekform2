# Despliegue

Tres piezas, cada una en su servicio:

| Pieza | Dónde | Por qué |
|---|---|---|
| Base de datos y Auth | Supabase (nube) | Postgres gestionado + login de profesores |
| API (`apps/api`) | Servicio con procesos persistentes: Railway, Fly.io, Render… (imagen Docker) | Mantiene WebSockets abiertos toda la clase; no sirve un hosting serverless |
| Web (`apps/web`) | Vercel (o cualquier hosting estático con HTTPS) | SPA estática |

Todo con **HTTPS**: el micrófono del profesor solo funciona en HTTPS, y los WebSockets pasan a `wss://`.

> La API mantiene las sesiones en directo en memoria: **una sola instancia**, sin autoescalado horizontal. Un reinicio corta las clases en curso.

## 1. Supabase

1. Crea un proyecto en https://supabase.com y elige una región de la UE (RGPD, PRD §10).
2. En *Authentication → Sign In / Providers*: desactiva **Allow new users to sign up**, mantén Email activo y desactiva *Confirm email* (las cuentas las crea el admin).
3. En *Authentication → URL Configuration*: pon como **Site URL** la URL pública de la web.
4. Aplica las migraciones desde tu máquina:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-del-proyecto>
   npx supabase db push
   ```
5. En *Project Settings → API Keys* anota la **URL**, la **publishable key** (para la web) y la **secret key** (solo para la API; nunca en el frontend).

## 2. API

Variables de entorno:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` (ya viene en la imagen) |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SECRET_KEY` | secret key de Supabase |
| `ALLOWED_ORIGINS` | URL pública de la web, p. ej. `https://classtranslate.vercel.app` (varias separadas por comas) |
| `DEEPGRAM_API_KEY` | clave de Deepgram |
| `GOOGLE_TRANSLATE_API_KEY` | clave de Google Translation |
| `TRUST_PROXY` | `1` detrás del proxy del hosting (Railway/Fly/Render), para que el rate limit vea la IP real |
| `PORT` | la que indique el hosting (por defecto 3001) |

Opcionales: `RATE_LIMIT_PER_MINUTE` (600), `MAX_STUDENTS_PER_SESSION` (150), `LANGUAGE_GRACE_MS` (15000), `DEEPGRAM_MODEL` (nova-3) y `ALLOW_MOCK_PROVIDERS=true`, solo para una demo sin claves.

En producción la API **no arranca** sin `ALLOWED_ORIGINS` ni con proveedores mock (salvo `ALLOW_MOCK_PROVIDERS=true`). También rechaza WebSockets de orígenes que no estén en `ALLOWED_ORIGINS`.

Despliegue con el `Dockerfile` de la raíz (contexto: raíz del repo):
- **Railway / Render**: nuevo servicio desde el repo de GitHub y detección automática del `Dockerfile`. Health check: `/api/health`.
- **Fly.io**: `fly launch` en la raíz (usa el `Dockerfile`), `fly secrets set ...`, una sola máquina y `auto_stop_machines = false`, para que no se pare durante una clase.

Para probar la imagen en local: `npm run docker:build`. En Windows con el repo en OneDrive, `docker build .` falla con *invalid file request*; el script lo evita.

## 3. Web (Vercel)

1. Importa el repo y en **Root Directory** pon `apps/web`. Vercel detecta Vite; `vercel.json` ya incluye las rewrites de SPA y las cabeceras de seguridad.
2. Variables de entorno (se incrustan en el build):

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable key |
| `VITE_API_URL` | URL pública de la API, p. ej. `https://classtranslate-api.fly.dev` |

El build añade una CSP que solo permite conectar con la propia web, Supabase y la API: si cambias la URL de la API, **vuelve a desplegar la web**.

## 4. Primer admin

Con las variables de producción de la API en tu terminal (nunca en el repo):

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=... \
  npx tsx apps/api/scripts/create-user.ts --email tu@email --password '...' --name 'Tu nombre' --admin
```

El resto de profesores y cursos se crean desde `/admin`.

## 5. Comprobación tras desplegar

- `https://<api>/api/health` → `{"ok":true,"providers":{"stt":"deepgram","translation":"google"}}`.
- Login en la web → crear curso → *Preparar clase* → *Probar micrófono* → *Iniciar clase*.
- Abrir el QR en un móvil con datos móviles (fuera de la Wi-Fi) y comprobar que llegan los subtítulos.

## CI

`.github/workflows/ci.yml` se ejecuta en cada push a `develop`/`main` y en cada PR:
- typecheck, tests unitarios y de API, y build;
- build de la imagen Docker;
- Supabase local + integración de BD + E2E (dev y build de producción).
