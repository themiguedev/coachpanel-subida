-- ============================================================
-- CoachPanel — 02_rls.sql
-- Seguridad a nivel de fila (RLS) y permisos.
-- Pegar COMPLETO después de 01_esquema.sql.
--
-- IMPORTANTE (léelo, por favor):
-- El token de acceso es un FILTRO, no seguridad real. Como el sitio
-- está publicado en GitHub Pages, el token y la clave 'anon' son
-- visibles en el código fuente de la página.
--
-- La protección que SÍ es real y no se puede saltar es esta:
--   * Sin RLS no se devuelve ni una fila.
--   * DELETE queda PROHIBIDO para el rol anon: nadie puede borrar
--     el historial desde la web. Borrar solo desde el panel de Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Activar RLS en todas las tablas
-- ------------------------------------------------------------
alter table public.estudiantes        enable row level security;
alter table public.equipos            enable row level security;
alter table public.equipo_integrantes enable row level security;
alter table public.sesiones           enable row level security;
alter table public.asistencia         enable row level security;
alter table public.retos              enable row level security;
alter table public.practicas          enable row level security;
alter table public.app_ajustes        enable row level security;
alter table public.log_acceso         enable row level security;

-- ------------------------------------------------------------
-- 2. Permisos por tabla
--
-- DELETE solo se permite en equipo_integrantes: quitar a un niño de un
-- equipo es una operación normal del club (no es historial). En todas las
-- demás tablas el borrado queda prohibido: el historial es sagrado.
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, insert, update on public.estudiantes        to anon, authenticated;
grant select, insert, update on public.equipos            to anon, authenticated;
grant select, insert, update, delete on public.equipo_integrantes to anon, authenticated;
grant select, insert, update on public.sesiones           to anon, authenticated;
grant select, insert, update on public.asistencia         to anon, authenticated;
grant select, insert, update on public.retos              to anon, authenticated;
grant select, insert, update on public.practicas          to anon, authenticated;
grant select, insert, update on public.app_ajustes        to anon, authenticated;
grant select, insert          on public.log_acceso        to anon, authenticated;

-- Necesario para que los 'insert' con identidad generada devuelvan el id.
grant usage, select on all sequences in schema public to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Políticas de lectura y escritura
-- ------------------------------------------------------------
do $$
declare
  t text;
  tablas text[] := array[
    'estudiantes', 'equipos', 'equipo_integrantes', 'sesiones',
    'asistencia', 'retos', 'practicas'
  ];
begin
  foreach t in array tablas loop
    execute format('drop policy if exists p_%s_leer on public.%I', t, t);
    execute format('drop policy if exists p_%s_insertar on public.%I', t, t);
    execute format('drop policy if exists p_%s_editar on public.%I', t, t);

    -- Lectura abierta (la puerta de acceso de la app filtra el acceso casual)
    execute format(
      'create policy p_%s_leer on public.%I for select to anon, authenticated using (true)', t, t);

    -- Inserción permitida (registrar asistencia, prácticas, estudiantes, equipos)
    execute format(
      'create policy p_%s_insertar on public.%I for insert to anon, authenticated with check (true)', t, t);

    -- Edición permitida (corregir un error de tipeo, cambiar de equipo, etc.)
    execute format(
      'create policy p_%s_editar on public.%I for update to anon, authenticated using (true) with check (true)', t, t);

    -- NO se crea política de DELETE => queda denegado para anon y authenticated.
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 4. equipo_integrantes: la única tabla donde se puede borrar
--    (quitar a un integrante de un equipo). Sin esta política, el editor
--    de equipos no podría sacar a nadie.
-- ------------------------------------------------------------
drop policy if exists p_equipo_integrantes_borrar on public.equipo_integrantes;
create policy p_equipo_integrantes_borrar on public.equipo_integrantes
  for delete to anon, authenticated using (true);

-- ------------------------------------------------------------
-- 5. app_ajustes: lectura para validar el token; escritura permitida
--    (así el coach puede rotar el token desde la propia app o desde el panel)
-- ------------------------------------------------------------
drop policy if exists p_app_ajustes_leer on public.app_ajustes;
create policy p_app_ajustes_leer on public.app_ajustes
  for select to anon, authenticated using (true);

drop policy if exists p_app_ajustes_editar on public.app_ajustes;
create policy p_app_ajustes_editar on public.app_ajustes
  for update to anon, authenticated using (true) with check (true);

drop policy if exists p_app_ajustes_insertar on public.app_ajustes;
create policy p_app_ajustes_insertar on public.app_ajustes
  for insert to anon, authenticated with check (true);

-- ------------------------------------------------------------
-- 6. log_acceso: solo se puede escribir y leer (auditoría del link)
-- ------------------------------------------------------------
drop policy if exists p_log_acceso_leer on public.log_acceso;
create policy p_log_acceso_leer on public.log_acceso
  for select to anon, authenticated using (true);

drop policy if exists p_log_acceso_insertar on public.log_acceso;
create policy p_log_acceso_insertar on public.log_acceso
  for insert to anon, authenticated with check (true);

-- ------------------------------------------------------------
-- 7. Comprobación final
-- ------------------------------------------------------------
do $$
declare
  faltantes text;
begin
  select string_agg(c.relname, ', ') into faltantes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if faltantes is not null then
    raise exception 'Estas tablas quedaron SIN RLS: %', faltantes;
  end if;

  raise notice 'RLS activo en todas las tablas. DELETE denegado para anon. Listo.';
end;
$$;
