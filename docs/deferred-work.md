# Trabajo pendiente (deferred work)

Tareas aplazadas conscientemente. Al retomar una, se mueve a hecho o se borra.

## Pendiente

### Borrar la columna `courses.allowed_target_languages`
- **Desde:** 2026-10-21
- **Contexto:** desde que todos los cursos ofrecen todos los idiomas, la columna no se usa. La migración `20261021000001_all_languages_per_course.sql` (aplicada en producción el 2026-10-21) solo la hizo opcional, para no romper la API anterior durante el despliegue.
- **Cuándo:** cuando la API nueva lleve desplegada un tiempo; basta una migración con `alter table public.courses drop column allowed_target_languages;`.

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
