# PRD — Plataforma de traducción simultánea para cursos presenciales

> Subtitulado multilingüe en tiempo real para alumnos mediante navegador web

| Campo | Valor |
|---|---|
| Versión | 1.0 |
| Fecha | 15 de octubre de 2026 |
| Estado | Propuesta / MVP |
| Nombre de trabajo | ClassTranslate |

### Visión del producto

Permitir que un profesor imparta una clase en su idioma habitual mientras cada alumno extranjero recibe subtítulos traducidos en tiempo casi real en su móvil, tableta o portátil, sin instalar una aplicación.

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Problema y oportunidad](#2-problema-y-oportunidad)
3. [Objetivos y no objetivos](#3-objetivos-y-no-objetivos)
4. [Usuarios y casos de uso](#4-usuarios-y-casos-de-uso)
5. [Experiencia de usuario](#5-experiencia-de-usuario)
6. [Requisitos funcionales](#6-requisitos-funcionales)
7. [Requisitos no funcionales](#7-requisitos-no-funcionales)
8. [Arquitectura propuesta](#8-arquitectura-propuesta)
9. [Modelo de datos y APIs](#9-modelo-de-datos-y-apis)
10. [Seguridad, privacidad y RGPD](#10-seguridad-privacidad-y-rgpd)
11. [Métricas y analítica](#11-métricas-y-analítica)
12. [Riesgos y mitigaciones](#12-riesgos-y-mitigaciones)
13. [Alcance del MVP](#13-alcance-del-mvp)
14. [Roadmap](#14-roadmap)
15. [Criterios de aceptación](#15-criterios-de-aceptación-del-mvp)
16. [Decisiones abiertas y anexos](#16-decisiones-abiertas-y-anexos)

---

## 1. Resumen ejecutivo

ClassTranslate es una plataforma web para traducción simultánea de clases presenciales mediante subtítulos. El profesor habla a través de un micrófono; el sistema transcribe su voz, traduce cada segmento a los idiomas activos y distribuye los subtítulos a los alumnos conectados mediante una URL o un código QR.

El producto debe priorizar tres factores: **baja latencia**, **simplicidad operativa** y **escalabilidad por idioma**. Una misma traducción se reutilizará para todos los alumnos que hayan seleccionado ese idioma, evitando procesar una traducción por alumno.

> **Principio de diseño**
> El profesor no debe tener que "gestionar una herramienta de IA" durante la clase. Su interacción debe limitarse a iniciar, pausar y finalizar la sesión, comprobar el micrófono y visualizar el estado del servicio.

### Propuesta de valor

- Mejorar la comprensión de alumnos que no dominan el idioma de impartición.
- Evitar depender de intérpretes humanos para todos los cursos e idiomas.
- Permitir que cada alumno utilice su propio dispositivo y elija su idioma.
- Reducir el coste marginal: el número de alumnos no multiplica las traducciones si comparten idioma.
- Crear una base tecnológica reutilizable para subtítulos, audio traducido, resúmenes y materiales multilingües.

---

## 2. Problema y oportunidad

En cursos presenciales con alumnado internacional, el profesor suele impartir la formación en un único idioma. Parte de los asistentes puede entender únicamente fragmentos, depender de compañeros o necesitar traducción manual. Esto reduce la eficacia formativa y puede convertirse en un problema especialmente relevante en contenidos técnicos o de seguridad.

### Problemas actuales

| Problema | Impacto |
|---|---|
| Barreras lingüísticas | Pérdida de información, menor participación y peor aprovechamiento del curso. |
| Intérpretes humanos por idioma | Coste elevado y dificultad logística para grupos pequeños o cursos frecuentes. |
| Aplicaciones de traducción individuales | Cada alumno opera su propio sistema; no existe una fuente común ni control de la sesión. |
| Ruido y vocabulario técnico | Los sistemas genéricos pueden cometer errores relevantes si no existe una buena captación de voz y contexto. |
| Configuración compleja | Si el profesor necesita soporte técnico constante, el sistema no será viable operacionalmente. |

### Oportunidad

Centralizar una única captura de voz del profesor y distribuir traducciones sincronizadas permite ofrecer una experiencia uniforme y controlada. La solución puede utilizarse de forma recurrente en diferentes cursos, sedes e idiomas sin necesidad de desplegar hardware individual para cada alumno.

---

## 3. Objetivos y no objetivos

### Objetivos del MVP

| ID | Objetivo | Indicador inicial |
|---|---|---|
| OBJ-01 | Mostrar subtítulos traducidos con retraso suficientemente bajo para seguir una clase. | Mediana objetivo <= 4 s desde el final de una frase hasta su aparición traducida. |
| OBJ-02 | Permitir acceso sencillo del alumno. | Entrada por QR/URL sin instalación y sin registro obligatorio. |
| OBJ-03 | Soportar varios idiomas simultáneamente. | Al menos 4 idiomas de destino activos por sesión en el piloto. |
| OBJ-04 | Mantener la operación simple para el profesor. | Inicio de sesión en <= 3 acciones después de seleccionar el curso y el micrófono. |
| OBJ-05 | Escalar por idioma, no por alumno. | Una traducción calculada se distribuye a todos los alumnos del mismo idioma. |
| OBJ-06 | Proteger credenciales y datos. | Claves de proveedores solo en backend; transporte cifrado; conservación mínima. |

### No objetivos del MVP

- No sustituir a un intérprete certificado cuando la normativa o el riesgo del contenido lo requieran.
- No traducir conversaciones simultáneas de múltiples personas de forma automática.
- No ofrecer inicialmente una app nativa iOS/Android; el acceso será web responsive.
- No guardar grabaciones de audio por defecto.
- No generar voz traducida en auriculares durante la primera versión.
- No garantizar traducción perfecta de instrucciones críticas o terminología especializada sin validación.

---

## 4. Usuarios y casos de uso

| Usuario | Necesidad principal | Permisos |
|---|---|---|
| Profesor | Impartir la clase sin distraerse con la herramienta. | Crear/iniciar/pausar/finalizar sesión, seleccionar micrófono, ver estado y texto original. |
| Alumno | Leer la traducción en su idioma con la mínima fricción. | Entrar en una sesión, seleccionar/cambiar idioma, personalizar visualización. |
| Administrador | Preparar cursos y controlar uso, idiomas y costes. | Gestionar cursos, usuarios, idiomas, sesiones, métricas y configuración. |
| Soporte técnico | Diagnosticar incidencias. | Ver telemetría, estado de conexiones y errores sin acceder a más contenido del necesario. |

### Casos de uso prioritarios

1. Un profesor abre el panel, selecciona un curso, comprueba el micrófono y pulsa "Iniciar".
2. El sistema genera una sala y un QR visible para los alumnos.
3. Cada alumno escanea el QR, selecciona su idioma y comienza a recibir subtítulos.
4. Cuando aparece el primer alumno de un idioma, el sistema activa ese idioma de traducción.
5. Si todos los alumnos abandonan un idioma durante un periodo definido, el sistema puede desactivarlo para reducir consumo.
6. El profesor pausa y reanuda la sesión sin perder la sala ni los alumnos conectados.
7. Al finalizar, el sistema cierra conexiones, registra métricas y elimina datos temporales conforme a la política configurada.

---

## 5. Experiencia de usuario

### 5.1 Flujo del profesor

| Paso | Pantalla / acción | Resultado |
|---|---|---|
| 1 | Login | El profesor accede a sus cursos. |
| 2 | Seleccionar curso | Se carga idioma de origen, idiomas permitidos y configuración. |
| 3 | Comprobar audio | Medidor de nivel, selección de micrófono y prueba corta. |
| 4 | Iniciar clase | Se crea la sesión, se muestra QR y comienza la captura. |
| 5 | Durante la clase | Texto original, alumnos conectados, idiomas activos, estado de servicios y controles. |
| 6 | Finalizar | Se detiene la captura y se cierra la sesión. |

#### Pantalla del profesor — elementos mínimos

- Nombre del curso y estado: Preparada / En directo / Pausada / Finalizada.
- Selector de micrófono y medidor de nivel.
- Botones grandes: Iniciar, Pausar/Reanudar y Finalizar.
- QR y enlace de acceso para alumnos.
- Últimas líneas de transcripción original.
- Número total de alumnos conectados e idiomas activos.
- Indicador de salud: audio, transcripción, traducción y distribución.

### 5.2 Flujo del alumno

| Paso | Acción | Resultado |
|---|---|---|
| 1 | Escanear QR | Abre la sesión en el navegador. |
| 2 | Elegir idioma | Se suscribe al canal correspondiente. |
| 3 | Leer subtítulos | Los nuevos segmentos aparecen automáticamente. |
| 4 | Personalizar | Puede ajustar tamaño, contraste, scroll automático o cambiar idioma. |
| 5 | Reconexión | Si pierde red, la interfaz intenta reconectarse y recupera un buffer reciente. |

> **UX crítica**
> El alumno no debería necesitar crear una cuenta para una sesión estándar. El enlace/QR debe contener únicamente un identificador o token temporal, nunca credenciales permanentes.

---

## 6. Requisitos funcionales

| ID | Área | Requisito | Prioridad |
|---|---|---|---|
| FR-01 | Gestión de cursos | El administrador puede crear un curso con nombre, idioma de origen, idiomas de destino permitidos y configuración básica. | Must |
| FR-02 | Creación de sesión | Un profesor autorizado puede crear una sesión asociada a un curso. | Must |
| FR-03 | Captura de micrófono | El navegador del profesor puede solicitar permiso, seleccionar una entrada de audio y enviar audio en streaming. | Must |
| FR-04 | Monitor de audio | La interfaz muestra si existe señal y si el audio está llegando al backend. | Must |
| FR-05 | Transcripción streaming | El backend envía audio al motor STT y recibe resultados parciales y finales. | Must |
| FR-06 | Segmentación | El sistema convierte resultados finales en segmentos coherentes adecuados para traducción. | Must |
| FR-07 | Traducción por idioma activo | Cada segmento final se traduce una vez por idioma activo. | Must |
| FR-08 | Distribución realtime | Cada traducción se publica a los alumnos suscritos al idioma correspondiente. | Must |
| FR-09 | Acceso por QR/URL | La sesión genera un enlace compartible y QR. | Must |
| FR-10 | Selección de idioma | El alumno puede seleccionar y cambiar idioma durante la sesión. | Must |
| FR-11 | Subtítulos en directo | El alumno ve el texto traducido con desplazamiento automático. | Must |
| FR-12 | Buffer reciente | Al conectar/reconectar se pueden recuperar los últimos segmentos de la sesión. | Should |
| FR-13 | Pausa/reanudación | El profesor puede pausar captura/procesamiento y reanudar la misma sesión. | Must |
| FR-14 | Finalización | El profesor finaliza la sesión y se invalidan accesos temporales según política. | Must |
| FR-15 | Conteo de audiencia | El profesor puede ver alumnos conectados por idioma. | Should |
| FR-16 | Activación dinámica de idiomas | Un idioma puede activarse al aparecer demanda y desactivarse sin necesidad de reiniciar la clase. | Should |
| FR-17 | Glosario por curso | El administrador puede definir términos técnicos y traducciones preferidas. | Could |
| FR-18 | Historial exportable | Si la política lo permite, se puede exportar transcripción y traducciones de la sesión. | Could |
| FR-19 | Audio traducido | El alumno puede escuchar voz sintetizada/traducida. | Won't MVP |

---

## 7. Requisitos no funcionales

| ID | Categoría | Definición |
|---|---|---|
| NFR-01 | Latencia | Objetivo inicial: mediana <= 4 s y p95 <= 7 s desde cierre de segmento de voz hasta subtítulo traducido visible. |
| NFR-02 | Disponibilidad | Objetivo piloto >= 99 % durante ventanas de formación programadas; se revisará tras medir uso real. |
| NFR-03 | Escalabilidad | Una sesión debe soportar inicialmente 100 alumnos conectados y >= 6 idiomas activos sin cambiar la arquitectura. |
| NFR-04 | Reconexión | Cliente y backend reintentan conexiones transitorias sin intervención manual cuando sea seguro. |
| NFR-05 | Compatibilidad | Profesor: Chrome/Edge actuales en escritorio. Alumno: navegadores móviles modernos iOS/Android y escritorio. |
| NFR-06 | Accesibilidad | Contraste suficiente, controles por teclado, texto redimensionable y semántica básica WCAG 2.2 AA en pantallas principales. |
| NFR-07 | Seguridad | HTTPS/WSS, secretos solo en servidor, autorización por rol y tokens temporales para alumnos. |
| NFR-08 | Privacidad | No almacenar audio por defecto. Retención de texto configurable y mínima. |
| NFR-09 | Observabilidad | Registrar errores, latencia por etapa, consumo por proveedor e idiomas activos sin registrar más contenido del necesario. |
| NFR-10 | Coste | Medir coste por hora de clase e idioma; permitir límites y alertas de consumo. |
| NFR-11 | Mantenibilidad | Separar proveedor STT, traducción y realtime mediante interfaces/adaptadores. |
| NFR-12 | Resiliencia | Si falla la traducción de un idioma, la transcripción original y los otros idiomas deben continuar cuando sea posible. |

---

## 8. Arquitectura propuesta

### 8.1 Arquitectura lógica

```text
Profesor / navegador
  -> captura de micrófono (Web Audio / MediaDevices)
  -> WebSocket seguro al backend de audio

Backend Node.js / TypeScript
  -> adaptador STT en streaming
  -> segmentador de frases
  -> orquestador de traducción
  -> adaptador de traducción por idioma
  -> publicación realtime

Alumnos / navegador
  <- canales de subtítulos por sesión e idioma
```

### 8.2 Stack inicial recomendado

| Capa | Tecnología inicial | Responsabilidad |
|---|---|---|
| Frontend | React + TypeScript + Vite | Panel profesor, experiencia alumno y administración. |
| Backend realtime | Node.js + TypeScript | WebSocket de audio, orquestación, adaptación a proveedores y control de sesión. |
| Transcripción | Proveedor STT streaming (p. ej., Deepgram) | Audio -> texto parcial/final. |
| Traducción | Proveedor de traducción (p. ej., Google Cloud Translation) | Texto origen -> textos por idioma. |
| Datos | Supabase PostgreSQL | Cursos, sesiones, configuración, métricas e historial opcional. |
| Distribución | Supabase Realtime o WebSocket propio | Fan-out de subtítulos hacia alumnos. |
| Hosting frontend | Vercel | Aplicación web estática/SSR si procede. |
| Hosting backend | Servicio persistente (Railway/Render/Fly.io/AWS/etc.) | Mantener conexiones WebSocket durante las clases. |

### 8.3 Decisiones de diseño

- No acoplar el dominio a un proveedor concreto: definir interfaces `SpeechToTextProvider` y `TranslationProvider`.
- Traducir solo segmentos finales o estabilizados; los parciales pueden mostrarse únicamente en el panel del profesor.
- Reutilizar una traducción por idioma para todos los alumnos de ese idioma.
- Mantener un buffer pequeño de segmentos recientes para reconexión, preferiblemente en memoria/Redis según escala.
- Separar el backend de audio del frontend porque la sesión de streaming requiere procesos persistentes.
- Añadir circuit breakers, timeouts y reintentos controlados para proveedores externos.

---

## 9. Modelo de datos y APIs

### 9.1 Entidades principales

| Entidad | Campos mínimos |
|---|---|
| `courses` | id, name, source_language, allowed_target_languages, glossary_id, created_at |
| `course_members` | course_id, user_id, role |
| `sessions` | id, course_id, teacher_id, status, started_at, ended_at, access_code/token_version |
| `session_languages` | session_id, language, status, connected_count, activated_at |
| `transcript_segments` | id, session_id, seq, source_text, final, started_at_ms, ended_at_ms, created_at |
| `translations` | segment_id, target_language, translated_text, provider, latency_ms |
| `session_metrics` | session_id, stt_seconds, chars_translated, avg_latency_ms, reconnects, provider_errors |

El almacenamiento de `transcript_segments` y `translations` puede deshabilitarse o aplicar una retención corta según la política del cliente. Para una versión de máxima minimización, los subtítulos pueden procesarse de forma efímera y conservar solo métricas agregadas.

### 9.2 API orientativa

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/sessions` | Crear sesión. |
| POST | `/api/sessions/:id/start` | Iniciar. |
| POST | `/api/sessions/:id/pause` | Pausar. |
| POST | `/api/sessions/:id/resume` | Reanudar. |
| POST | `/api/sessions/:id/end` | Finalizar. |
| GET | `/api/sessions/:id/public` | Metadatos públicos mínimos para alumno. |
| POST | `/api/sessions/:id/join` | Obtener token temporal / registrar idioma. |
| POST | `/api/sessions/:id/language` | Cambiar idioma del alumno. |
| WS | `/ws/teacher/:sessionId` | Streaming de audio del profesor. |

### 9.3 Formato de evento realtime

```json
{
  "type": "subtitle.final",
  "sessionId": "...",
  "sequence": 128,
  "language": "en",
  "text": "Before using the machine, check the safety systems.",
  "sourceStartedAtMs": 356210,
  "sourceEndedAtMs": 359480,
  "publishedAt": "2026-10-15T10:24:31.234Z"
}
```

---

## 10. Seguridad, privacidad y RGPD

La voz del profesor y, potencialmente, intervenciones de terceros captadas por el micrófono pueden constituir datos personales. El diseño debe aplicar minimización de datos desde el inicio y documentar la relación con los proveedores que procesen audio o texto.

| Control | Requisito |
|---|---|
| Autenticación | Profesores y administradores mediante proveedor de identidad seguro. MFA recomendable para administradores. |
| Autorización | Roles y políticas por organización/curso; el profesor solo opera sesiones autorizadas. |
| Alumno | Token temporal de sala con permisos exclusivamente de lectura/suscripción. |
| Secretos | API keys únicamente en backend/secret manager; nunca embebidas en el frontend. |
| Transporte | HTTPS/WSS en todo el recorrido. |
| Retención | Audio no persistente por defecto; texto con retención definida y configurable. |
| Logs | No registrar audio ni texto completo en logs técnicos salvo modo de diagnóstico explícito y controlado. |
| Proveedores | DPA, región de procesamiento, subencargados y transferencias internacionales revisados antes de producción. |
| Borrado | Mecanismo de borrado de sesiones y datos derivados cuando exista almacenamiento. |
| Información | Aviso de privacidad y señalización del uso de transcripción/traducción en la sesión. |

> **Decisión de privacidad recomendada**
> Para el MVP: procesar audio en streaming sin guardarlo y conservar únicamente métricas agregadas. El historial textual será una función opcional y no una dependencia del producto.

---

## 11. Métricas y analítica

| Métrica | Definición | Por qué importa |
|---|---|---|
| Latencia end-to-end | Tiempo desde el cierre de un segmento de voz hasta su visualización traducida. | Principal indicador de experiencia. |
| Precisión percibida | Valoración de profesores/alumnos o revisión de muestras. | Determina utilidad real. |
| Sesiones completadas | Sesiones iniciadas que finalizan sin incidente crítico. | Fiabilidad operacional. |
| Errores por proveedor | Fallos STT/traducción/realtime por hora. | Diagnóstico y selección de proveedores. |
| Reconexiones | Reconexiones de profesor y alumnos por sesión. | Calidad de red/cliente. |
| Idiomas activos | Número y duración de idiomas usados. | Planificación de costes. |
| Coste por hora | Coste STT + traducción + infraestructura / hora de clase. | Viabilidad económica. |
| Alumnos concurrentes | Pico y promedio por sesión. | Capacidad y dimensionamiento. |
| Tiempo de puesta en marcha | Desde abrir el panel hasta emitir subtítulos. | Facilidad de uso. |

### Objetivos de éxito del piloto

- >= 90 % de las sesiones piloto completadas sin interrupción crítica atribuible a la plataforma.
- Latencia mediana <= 4 s y p95 <= 7 s en una red adecuada.
- >= 80 % de los alumnos de prueba califican los subtítulos como "útiles" o mejores.
- El profesor puede iniciar una nueva clase sin ayuda técnica tras una breve formación inicial.
- Coste por hora y por idioma medido y predecible antes del despliegue general.

---

## 12. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Ruido del aula | Mala transcripción. | Micrófono de solapa/diadema cercano, prueba previa, reducción de ruido y guía de uso. |
| Profesor habla muy rápido | Segmentos tardíos o traducciones incompletas. | Segmentación adaptativa, visualización de parciales y ajuste de endpointing. |
| Terminología técnica | Errores semánticos. | Glosarios por curso, prompts/adaptación cuando el proveedor lo admita y validación de términos. |
| Negaciones/cantidades mal traducidas | Riesgo en formación de seguridad. | Avisos de uso, glosarios, revisión previa de vocabulario crítico; no usar como única salvaguarda en instrucciones críticas. |
| Pérdida de Internet | Corte de subtítulos. | Reconexión automática, buffer reciente y red dedicada/redundante en sedes críticas. |
| Caída de proveedor externo | Interrupción parcial. | Timeouts, circuit breaker y segundo proveedor opcional en fases posteriores. |
| Coste inesperado | Presupuesto descontrolado. | Activación dinámica de idiomas, límites, métricas y alertas. |
| Abuso de enlaces | Acceso no autorizado. | Tokens temporales, caducidad y posibilidad de rotar el código. |
| Problemas RGPD | Riesgo legal. | Minimización, DPA, región, política de retención y evaluación antes de producción. |
| Batería/micrófono | Pérdida de audio. | Equipo conectado a corriente, indicador de nivel y checklist previo. |

---

## 13. Alcance del MVP

### Incluido

- Panel web de profesor con login.
- Cursos básicos con idioma origen e idiomas destino permitidos.
- Captura de un micrófono desde navegador de escritorio.
- Streaming de audio hacia backend persistente.
- Transcripción en tiempo real mediante proveedor STT.
- Traducción a varios idiomas mediante proveedor externo.
- Sala de alumnos accesible por QR/URL.
- Selección de idioma y subtítulos en tiempo real.
- Pausa, reanudación y finalización.
- Estado básico, métricas de latencia/errores y alumnos conectados.
- Sin almacenamiento de audio por defecto.

### Fuera del MVP

- Aplicaciones nativas móviles.
- Interpretación de voz a voz con auriculares.
- Detección y mezcla automática de múltiples ponentes.
- Modo offline.
- Integración con LMS, videoconferencia o sistemas de asistencia.
- Facturación automática y multi-tenant comercial completa.
- Resúmenes y generación de apuntes post-clase.

### Idiomas del piloto

Se recomienda iniciar con el idioma real del profesor y 3-4 idiomas de destino que aparezcan con frecuencia en los cursos. La elección definitiva debe validarse con los idiomas reales del alumnado y las capacidades/calidad del proveedor seleccionado.

---

## 14. Roadmap

| Fase | Entregable | Salida / decisión |
|---|---|---|
| F0 — Spike técnico | Captura de audio -> STT -> texto en una única página. | Validar precisión y latencia del audio real del aula. |
| F1 — Traducción | Texto final -> 2-4 idiomas. | Validar calidad de traducción y segmentación. |
| F2 — Sala multiusuario | QR, selector de idioma y distribución realtime. | Validar fan-out y reconexión con varios móviles. |
| F3 — MVP operativo | Login, cursos, sesión, panel profesor, métricas y seguridad mínima. | Usable por un profesor sin desarrollador presente. |
| F4 — Piloto real | Varias clases reales, revisión de métricas y feedback. | Go/no-go para producción. |
| F5 — Producción | Hardening, RGPD, monitorización, backups/configuración, soporte. | Despliegue recurrente. |
| F6 — Evolución | Glosarios, audio traducido, resúmenes, integraciones. | Mejoras según uso y ROI. |

---

## 15. Criterios de aceptación del MVP

| ID | Criterio |
|---|---|
| AC-01 | Un profesor autorizado puede iniciar una sesión desde un navegador compatible y el sistema detecta audio del micrófono. |
| AC-02 | La voz del profesor aparece como transcripción en el sistema durante la sesión. |
| AC-03 | Un alumno puede entrar mediante QR/URL sin instalar software. |
| AC-04 | El alumno puede elegir al menos uno de los idiomas configurados para el curso. |
| AC-05 | Dos alumnos con el mismo idioma reciben el mismo segmento traducido sin ejecutar dos traducciones independientes. |
| AC-06 | Alumnos de idiomas distintos reciben traducciones diferentes derivadas del mismo segmento fuente. |
| AC-07 | El profesor puede pausar y reanudar sin crear una nueva sala. |
| AC-08 | Una pérdida temporal de conexión del alumno provoca intento de reconexión y recuperación del buffer reciente cuando esté disponible. |
| AC-09 | Las claves de STT/traducción no son accesibles desde el código cliente entregado al navegador. |
| AC-10 | Al finalizar la sesión, deja de procesarse audio y se cierran/invalidan los accesos según la política definida. |
| AC-11 | Se registran métricas de latencia, errores, duración e idiomas sin depender de almacenar el audio. |
| AC-12 | En una prueba controlada de clase, la latencia cumple los umbrales acordados o queda cuantificada con precisión para decidir ajustes. |

---

## 16. Decisiones abiertas y anexos

### Decisiones que deben cerrarse antes del desarrollo de producción

| Decisión | Opciones / pregunta |
|---|---|
| Idiomas prioritarios | ¿Cuáles son los 3-6 idiomas que aparecen con mayor frecuencia en los cursos? |
| Idioma de origen | ¿Solo español, también catalán u otros? ¿Hay cambio de idioma dentro de una misma clase? |
| Volumen | Horas de formación al mes, número de aulas simultáneas y alumnos por aula. |
| Hardware | Portátil fijo, móvil/tablet, micrófono de solapa, diadema o salida de la megafonía existente. |
| Retención | ¿Debe guardarse el texto? ¿Durante cuánto tiempo? ¿Se necesitan exportaciones? |
| Entorno | Una sede o varias; calidad de Wi-Fi; necesidad de red dedicada. |
| Nivel de criticidad | ¿Los cursos incluyen instrucciones de seguridad, maquinaria o requisitos regulatorios? |
| Modelo de negocio | Uso interno, producto para clientes o servicio multi-tenant. |
| Proveedor | Comparativa final mediante prueba real de precisión, idiomas, latencia, región, DPA y coste. |

### Supuestos de trabajo

- El profesor es el único emisor principal durante la mayoría del tiempo.
- El profesor dispone de conexión estable y un micrófono razonablemente cercano a la boca.
- Los alumnos tienen smartphone, tableta o portátil con conexión a Internet/Wi-Fi.
- La traducción textual es suficiente para el MVP; la voz traducida se considera evolución.
- La organización acepta utilizar proveedores cloud tras la revisión correspondiente de privacidad y contratación.

### Definición de "hecho" para el piloto

> **Piloto superado**
> Se considera que el piloto ha demostrado viabilidad cuando una clase real puede impartirse de principio a fin, varios alumnos reciben subtítulos útiles en distintos idiomas, la latencia y el coste se miden, no aparecen fallos operativos críticos y queda identificado cualquier límite de precisión para contenidos sensibles.

### Notas sobre proveedores y costes

Los proveedores mencionados en este documento son opciones iniciales, no dependencias contractuales. Antes de cerrar la arquitectura se realizará una prueba comparativa con audio real del aula y los idiomas prioritarios. Los precios, regiones, límites y capacidades de las APIs cambian y deben verificarse en el momento de contratación.

---

*Fin del PRD*
