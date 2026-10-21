# Trabajo pendiente (deferred work)

Tareas aplazadas conscientemente. Al retomar una, se mueve a hecho o se borra.

## Pendiente

### Prueba real con micrófono y Deepgram (validación F0)
- **Desde:** 2026-10-19
- **Motivo del aplazamiento:** no se podía probar con micrófono en ese momento.
- **Estado:** `DEEPGRAM_API_KEY` configurada en `.env` (raíz). El backend arranca con `stt: deepgram`. Se ha comprobado que Deepgram acepta conexiones `nova-3` en `es` y `ca`, pero todavía no se ha probado con voz real.
- **Cómo probar:**
  1. `npx supabase start`, `npm run dev` y abrir http://localhost:5173 (el micrófono solo funciona en `localhost`/HTTPS).
  2. Entrar con el admin local y crear en `/admin` un curso en castellano y otro en catalán, asignándote como profesor.
  3. *Preparar clase* → *Probar micrófono* (el medidor debe moverse) → *Iniciar clase*.
  4. Hablar varias frases, incluidas negaciones, cifras y términos técnicos.
- **Qué validar (PRD §14, F0):**
  - Precisión de la transcripción con el micrófono y la sala reales, en castellano y en catalán.
  - Latencia: indicador del panel; objetivo de mediana ≤ 4 s y p95 ≤ 7 s (NFR-01).
  - Pausar/Reanudar: la transcripción se detiene y continúa en la misma sala.
  - Alumno desde el móvil en la misma Wi-Fi: `http://<IP-del-portátil>:5173/s/<id>`, o definir `VITE_PUBLIC_APP_URL` en `apps/web/.env` para que el QR funcione.
- **Si el catalán va mal:** probar `DEEPGRAM_MODEL=nova-2`, o valorar otro proveedor STT.

### Clave de DeepL
- **Desde:** 2026-10-21 (sustituye a Google Translation, que exige vincular facturación).
- **Estado:** adaptador hecho (`apps/api/src/providers/deepl.ts`) y clave configurada en local. Falta configurarla en el hosting de la API.
- **Pasos:** crear una cuenta de la API de DeepL → *API Keys* → `DEEPL_API_KEY=` en `.env` (raíz) y en el hosting de la API. `GET /api/health` debe indicar `translation: deepl`.
- **Qué validar:** calidad y latencia reales, y consumo de caracteres frente al límite del plan (`chars_translated` en `session_metrics`). Con cuota agotada, DeepL responde HTTP 456 y cuenta como error de proveedor.
- **Comprobado (2026-10-21):** con la clave real traduce es→en/fr/uk y ca→en, en 200–450 ms por frase.

### Historial de sesiones y métricas en `/admin`
- **Desde:** 2026-10-19
- **Motivo del aplazamiento:** decisión del usuario; se prioriza otro trabajo.
- **Estado:** las métricas ya se guardan al finalizar cada sesión (`sessions` + `session_metrics` en Supabase), pero solo se ven desde Supabase Studio.
- **Por qué importa:** es la base para decidir go/no-go en el piloto (PRD §11, AC-11, AC-12, NFR-10).
- **Alcance propuesto:**
  1. Tabla de sesiones recientes: curso, profesor, fecha, duración, pico de alumnos, idiomas, latencia mediana/p95 y errores. Filtros por curso y fechas.
  2. Resumen: horas de clase, % de sesiones sin errores (objetivo piloto ≥ 90 %) y latencia mediana global frente al objetivo de ≤ 4 s.
  3. Coste estimado por sesión y por hora con tarifas STT y de traducción configurables por env (verificar precios con el contrato).
  4. Exportación CSV.
  5. Tests de API y un caso E2E.
- **No requiere** cambios en el pipeline realtime: todo sale de los datos ya persistidos.
