-- F3: perfiles, cursos, miembros, sesiones y métricas agregadas (PRD §9.1).
-- Privacidad (PRD §10): no se guarda audio ni texto de transcripciones/traducciones.
-- Todo acceso a datos pasa por el backend (service role); el navegador solo usa Supabase Auth.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'teacher' check (role in ('teacher', 'admin')),
  created_at timestamptz not null default now()
);

-- El rol nunca se toma de metadatos editables por el usuario: siempre 'teacher' al crear.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  source_language text not null check (source_language in ('es', 'ca')),
  allowed_target_languages text[] not null
    check (cardinality(allowed_target_languages) between 1 and 8),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.course_members (
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'teacher' check (role in ('teacher')),
  created_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

create index course_members_user on public.course_members (user_id);

create table public.sessions (
  id text primary key,
  course_id uuid not null references public.courses (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'ready' check (status in ('ready', 'live', 'paused', 'ended')),
  source_language text not null,
  target_languages text[] not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create index sessions_course_created on public.sessions (course_id, created_at desc);
create index sessions_teacher_created on public.sessions (teacher_id, created_at desc);
create index sessions_open on public.sessions (status) where status <> 'ended';

create table public.session_metrics (
  session_id text primary key references public.sessions (id) on delete cascade,
  duration_seconds integer not null default 0,
  audio_seconds numeric(12, 1) not null default 0,
  segments integer not null default 0,
  translations integer not null default 0,
  chars_translated bigint not null default 0,
  latency_median_ms integer,
  latency_p95_ms integer,
  provider_errors integer not null default 0,
  stt_reconnects integer not null default 0,
  peak_students integer not null default 0,
  languages_used text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_members enable row level security;
alter table public.sessions enable row level security;
alter table public.session_metrics enable row level security;

-- Sin políticas para anon/authenticated: deny by default. Solo el backend (service_role) accede.
revoke all on public.profiles, public.courses, public.course_members, public.sessions, public.session_metrics
  from anon, authenticated;
grant all on public.profiles, public.courses, public.course_members, public.sessions, public.session_metrics
  to service_role;
