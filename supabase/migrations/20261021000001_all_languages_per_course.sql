-- Todos los cursos ofrecen todos los idiomas: la API ya no lee ni escribe la lista por curso.
-- Se relaja en vez de borrarse para que la API anterior siga funcionando mientras se despliega
-- la nueva (el orden de migración y despliegue da igual). Se puede borrar más adelante.
alter table public.courses alter column allowed_target_languages drop not null;
alter table public.courses drop constraint if exists courses_allowed_target_languages_check;
comment on column public.courses.allowed_target_languages is 'Obsoleta desde 2026-10-21: todos los cursos ofrecen todos los idiomas.';
