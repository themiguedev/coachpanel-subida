-- ============================================================
-- CoachPanel — 03_datos_iniciales.sql
-- Retos por defecto y ajustes de la app.
-- Pegar después de 02_rls.sql.
--
-- >>> ANTES DE EJECUTAR: cambia 'CAMBIA-ESTE-TOKEN' por tu token secreto.
--     Ese mismo valor va en docs/js/config.js como TOKEN_ACCESO.
-- ============================================================

-- ------------------------------------------------------------
-- Retos / pistas típicas de un club de robótica LEGO
-- ------------------------------------------------------------
insert into public.retos (nombre, descripcion) values
  ('Pista WRO RoboMission',   'Mesa oficial de competencia con los elementos del reglamento vigente.'),
  ('Pista de seguimiento de línea', 'Recorrido negro con curvas: el robot debe completarlo sin salirse.'),
  ('Laberinto de paredes',    'Recorrido con paredes; se mide tiempo de salida.'),
  ('Transporte de objetos',   'Llevar piezas de un punto a otro de la mesa.'),
  ('Sumo de robots',          'Combate por rondas: gana quien empuja al rival fuera del círculo.'),
  ('Reto libre del coach',    'Cualquier práctica sin pista oficial definida.')
on conflict (nombre) do nothing;

-- ------------------------------------------------------------
-- Ajustes de la app
-- ------------------------------------------------------------
insert into public.app_ajustes (clave, valor) values
  ('token_acceso', 'CAMBIA-ESTE-TOKEN'),
  ('nombre_club',  'Club de Robótica LEGO'),
  ('zona_horaria', 'America/Caracas')
on conflict (clave) do nothing;

-- ------------------------------------------------------------
-- Verificación: si el token sigue siendo el de ejemplo, avisar fuerte.
-- ------------------------------------------------------------
do $$
declare
  v text;
begin
  select valor into v from public.app_ajustes where clave = 'token_acceso';

  if v = 'CAMBIA-ESTE-TOKEN' or v is null then
    raise warning 'ATENCION: el token de acceso sigue siendo el de ejemplo. Cambialo en la tabla app_ajustes y en docs/js/config.js';
  else
    raise notice 'Token de acceso configurado correctamente (no se muestra por seguridad).';
  end if;
end;
$$;
