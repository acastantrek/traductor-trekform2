# Trabajo pendiente (deferred work)

Tareas aplazadas conscientemente. Al retomar una, se mueve a hecho o se borra.

## Pendiente

### Prueba real con micrófono y Deepgram (validación F0)
- **Desde:** 2026-10-19
- **Motivo del aplazamiento:** no se podía probar con micrófono en ese momento.
- **Estado:** `DEEPGRAM_API_KEY` configurada en `.env` (raíz). El backend arranca con `stt: deepgram`. Se ha comprobado que Deepgram acepta conexiones `nova-3` en `es` y `ca`, pero todavía no se ha probado con voz real.
- **Cómo probar:**
  1. `npm run dev` y abrir http://localhost:5173 (el micrófono solo funciona en `localhost`/HTTPS).
  2. Crear una clase en castellano y otra en catalán.
  3. *Probar micrófono* (el medidor debe moverse) → *Iniciar clase*.
  4. Hablar varias frases, incluidas negaciones, cifras y términos técnicos.
- **Qué validar (PRD §14, F0):**
  - Precisión de la transcripción con el micrófono y la sala reales, en castellano y en catalán.
  - Latencia: indicador del panel; objetivo de mediana ≤ 4 s y p95 ≤ 7 s (NFR-01).
  - Pausar/Reanudar: la transcripción se detiene y continúa en la misma sala.
  - Alumno desde el móvil en la misma Wi-Fi: `http://<IP-del-portátil>:5173/s/<id>`, o definir `VITE_PUBLIC_APP_URL` en `apps/web/.env` para que el QR funcione.
- **Si el catalán va mal:** probar `DEEPGRAM_MODEL=nova-2`, o valorar otro proveedor STT.

### Clave de Google Translation
- **Desde:** 2026-10-19
- **Motivo del aplazamiento:** Google Cloud exige vincular facturación.
- **Mientras tanto:** la traducción usa el mock (`[en] texto original`).
- **Pasos:** Console → proyecto → Facturación → habilitar *Cloud Translation API* → Credenciales → *Clave de API* restringida a Cloud Translation API → `GOOGLE_TRANSLATE_API_KEY=` en `.env`. Crear un presupuesto con alerta.
- **Alternativas, si no se quiere facturación de Google:** DeepL API Free, Azure Translator F0 o LibreTranslate autoalojado (requieren un adaptador nuevo en `apps/api/src/providers/`).
