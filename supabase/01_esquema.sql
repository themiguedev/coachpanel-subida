-- ============================================================
-- CoachPanel — 01_esquema.sql
-- Tablas, restricciones, índices y disparadores.
-- Pegar COMPLETO en Supabase → SQL Editor → Run.
-- Se puede ejecutar varias veces sin romper nada (idempotente).
-- ============================================================

-- ------------------------------------------------------------
-- ESTUDIANTES
-- ------------------------------------------------------------
create table if not exists public.estudiantes (
  id                bigint generated always as identity primary key,
  nombre            text not null,
  nombre_busqueda   text not null unique,           -- lower(trim(nombre)) — evita duplicados
  fecha_nacimiento  date,
  representante    text,
  telefono          text,
  activo            boolean not null default true,
  nota              text,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  constraint estudiantes_nombre_no_vacio check (length(trim(nombre)) between 2 and 80)
);

comment on table public.estudiantes is 'Niños y niñas del club de robótica.';

-- ------------------------------------------------------------
-- EQUIPOS
-- ------------------------------------------------------------
create table if not exists public.equipos (
  id               bigint generated always as identity primary key,
  nombre           text not null,
  nombre_busqueda  text not null unique,
  categoria_wro    text,
  wro_estado       text not null default 'no_participa',
  wro_resultado    text,
  wro_nota         text,
  activo           boolean not null default true,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  constraint equipos_nombre_no_vacio check (length(trim(nombre)) between 2 and 60),
  constraint equipos_wro_estado_valido check (
    wro_estado in ('no_participa', 'inscrito', 'participo', 'no_participo')
  )
);

comment on column public.equipos.wro_estado is
  'Participación en la WRO Venezuela: no_participa | inscrito | participo | no_participo';

-- ------------------------------------------------------------
-- INTEGRANTES DEL EQUIPO (máximo 3, garantizado por trigger)
-- ------------------------------------------------------------
create table if not exists public.equipo_integrantes (
  id             bigint generated always as identity primary key,
  equipo_id      bigint not null references public.equipos (id) on delete cascade,
  estudiante_id  bigint not null references public.estudiantes (id) on delete restrict,
  rol            text not null default 'integrante',
  creado_en      timestamptz not null default now(),
  constraint equipo_integrantes_rol_valido check (rol in ('capitan', 'integrante')),
  constraint equipo_integrantes_unico_en_equipo unique (equipo_id, estudiante_id),
  -- Un estudiante solo puede estar en un equipo a la vez:
  -- así los reportes de asistencia y puntaje nunca son ambiguos.
  constraint equipo_integrantes_un_equipo_por_estudiante unique (estudiante_id)
);

-- Un solo capitán por equipo.
create unique index if not exists ux_equipo_un_capitan
  on public.equipo_integrantes (equipo_id)
  where (rol = 'capitan');

-- ------------------------------------------------------------
-- SESIONES DE CLASE (clases vespertinas)
-- ------------------------------------------------------------
create table if not exists public.sesiones (
  id            bigint generated always as identity primary key,
  fecha         date not null unique,
  hora_inicio   time,
  hora_fin      time,
  titulo        text,
  nota          text,
  estado        text not null default 'abierta',
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint sesiones_estado_valido check (estado in ('abierta', 'cerrada'))
);

-- ------------------------------------------------------------
-- ASISTENCIA
-- ------------------------------------------------------------
create table if not exists public.asistencia (
  id             bigint generated always as identity primary key,
  sesion_id      bigint not null references public.sesiones (id) on delete cascade,
  estudiante_id  bigint not null references public.estudiantes (id) on delete restrict,
  estado         text not null,
  observacion    text,
  registrado_por text,
  registrado_en  timestamptz not null default now(),
  constraint asistencia_estado_valido check (
    estado in ('presente', 'ausente', 'tarde', 'justificado')
  ),
  constraint asistencia_unica_por_sesion unique (sesion_id, estudiante_id)
);

create index if not exists ix_asistencia_estudiante on public.asistencia (estudiante_id);
create index if not exists ix_asistencia_sesion on public.asistencia (sesion_id);

-- ------------------------------------------------------------
-- RETOS / PISTAS
-- ------------------------------------------------------------
create table if not exists public.retos (
  id           bigint generated always as identity primary key,
  nombre       text not null unique,
  descripcion  text,
  activo       boolean not null default true,
  creado_en    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PRÁCTICAS DE ROBÓTICA
-- duracion_ms: tiempo en pista en milisegundos (0:00.000 a 59:59.999).
--              null = práctica registrada solo con puntaje.
-- ------------------------------------------------------------
create table if not exists public.practicas (
  id             bigint generated always as identity primary key,
  fecha          date not null,
  equipo_id      bigint not null references public.equipos (id) on delete cascade,
  intento        smallint not null default 1,
  reto_id        bigint references public.retos (id) on delete set null,
  duracion_ms    integer,
  puntaje        integer not null,
  observaciones  text,
  registrado_por text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint practicas_intento_valido  check (intento between 1 and 99),
  constraint practicas_duracion_valida check (duracion_ms is null or duracion_ms between 0 and 3599999),
  constraint practicas_puntaje_valido  check (puntaje between 0 and 1000000)
);

create index if not exists ix_practicas_equipo_fecha on public.practicas (equipo_id, fecha desc);
create index if not exists ix_practicas_fecha on public.practicas (fecha desc);

-- ------------------------------------------------------------
-- CONTROL DE ACCESO POR LINK
-- ------------------------------------------------------------
create table if not exists public.app_ajustes (
  clave          text primary key,
  valor          text not null,
  actualizado_en timestamptz not null default now()
);

create table if not exists public.log_acceso (
  id             bigint generated always as identity primary key,
  token_etiqueta text,
  dispositivo    text,
  creado_en      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- TRIGGER: actualizar 'actualizado_en' automáticamente
-- ------------------------------------------------------------
create or replace function public.fn_marcar_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

do $$
declare
  t text;
  tablas text[] := array['estudiantes', 'equipos', 'sesiones', 'practicas'];
begin
  foreach t in array tablas loop
    execute format('drop trigger if exists trg_actualizado_en on public.%I', t);
    execute format(
      'create trigger trg_actualizado_en before update on public.%I
         for each row execute function public.fn_marcar_actualizado()', t);
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- TRIGGER: máximo 3 integrantes por equipo
-- La regla vive en la base de datos, no solo en la interfaz:
-- se cumple aunque alguien escriba directo por la API.
-- ------------------------------------------------------------
create or replace function public.fn_limite_integrantes()
returns trigger
language plpgsql
as $$
declare
  cantidad integer;
begin
  select count(*) into cantidad
  from public.equipo_integrantes
  where equipo_id = new.equipo_id
    and id is distinct from new.id;

  if cantidad >= 3 then
    raise exception 'Un equipo no puede tener más de 3 integrantes.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_limite_integrantes on public.equipo_integrantes;
create trigger trg_limite_integrantes
  before insert or update on public.equipo_integrantes
  for each row execute function public.fn_limite_integrantes();

-- ------------------------------------------------------------
-- TRIGGER: normalizar nombre_busqueda en estudiantes y equipos
-- ------------------------------------------------------------
create or replace function public.fn_normalizar_nombre()
returns trigger
language plpgsql
as $$
begin
  new.nombre := trim(regexp_replace(new.nombre, '\s+', ' ', 'g'));
  new.nombre_busqueda := lower(new.nombre);
  return new;
end;
$$;

drop trigger if exists trg_normalizar_estudiante on public.estudiantes;
create trigger trg_normalizar_estudiante
  before insert or update on public.estudiantes
  for each row execute function public.fn_normalizar_nombre();

drop trigger if exists trg_normalizar_equipo on public.equipos;
create trigger trg_normalizar_equipo
  before insert or update on public.equipos
  for each row execute function public.fn_normalizar_nombre();

-- ------------------------------------------------------------
-- TRIGGER: impedir editar la asistencia de una sesión cerrada
-- ------------------------------------------------------------
create or replace function public.fn_sesion_cerrada()
returns trigger
language plpgsql
as $$
declare
  est text;
begin
  select estado into est from public.sesiones where id = coalesce(new.sesion_id, old.sesion_id);
  if est = 'cerrada' then
    raise exception 'La sesión está cerrada: reábrela antes de modificar la asistencia.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sesion_cerrada on public.asistencia;
create trigger trg_sesion_cerrada
  before insert or update or delete on public.asistencia
  for each row execute function public.fn_sesion_cerrada();
