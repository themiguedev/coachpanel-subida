-- ============================================================
-- CoachPanel — 04_vistas.sql
-- Vistas y funciones de resumen para el panel de control.
-- Pegar después de 03_datos_iniciales.sql.
-- ============================================================

-- ------------------------------------------------------------
-- Resumen de equipos: integrantes, prácticas y mejores marcas.
-- Evita traer miles de filas al navegador solo para sumar.
-- ------------------------------------------------------------
create or replace view public.vista_equipos_resumen as
select
  e.id,
  e.nombre,
  e.categoria_wro,
  e.wro_estado,
  e.wro_resultado,
  e.activo,
  (select count(*) from public.equipo_integrantes i where i.equipo_id = e.id) as integrantes,
  (select count(*) from public.practicas p where p.equipo_id = e.id)              as practicas,
  (select min(p.duracion_ms) from public.practicas p
     where p.equipo_id = e.id and p.duracion_ms is not null)                      as mejor_duracion_ms,
  (select max(p.puntaje) from public.practicas p where p.equipo_id = e.id)        as mejor_puntaje,
  (select max(p.fecha) from public.practicas p where p.equipo_id = e.id)          as ultima_practica
from public.equipos e;

-- ------------------------------------------------------------
-- Ranking por equipo y reto.
-- ------------------------------------------------------------
create or replace view public.vista_ranking_practicas as
select
  p.equipo_id,
  e.nombre                                      as equipo,
  p.reto_id,
  coalesce(r.nombre, 'Sin reto')                as reto,
  count(*)                                      as intentos,
  min(p.duracion_ms)                            as mejor_duracion_ms,
  round(avg(p.duracion_ms))::integer            as promedio_duracion_ms,
  max(p.puntaje)                                as mejor_puntaje,
  round(avg(p.puntaje))::integer                as promedio_puntaje,
  max(p.fecha)                                  as ultima_fecha
from public.practicas p
join public.equipos e on e.id = p.equipo_id
left join public.retos r on r.id = p.reto_id
group by p.equipo_id, e.nombre, p.reto_id, coalesce(r.nombre, 'Sin reto');

-- ------------------------------------------------------------
-- Asistencia por estudiante (porcentaje y conteos).
-- 'justificado' y 'tarde' cuentan como asistencia para el porcentaje;
-- la ausencia es lo único que resta.
-- ------------------------------------------------------------
create or replace view public.vista_asistencia_estudiante as
select
  es.id                                            as estudiante_id,
  es.nombre,
  es.activo,
  count(a.id)                                      as registros,
  count(*) filter (where a.estado = 'presente')     as presentes,
  count(*) filter (where a.estado = 'tarde')        as tardes,
  count(*) filter (where a.estado = 'justificado')  as justificados,
  count(*) filter (where a.estado = 'ausente')      as ausencias,
  case when count(a.id) = 0 then null
       else round(
         100.0 * count(*) filter (where a.estado <> 'ausente')
         / count(a.id)
       )::integer
  end                                              as porcentaje_asistencia
from public.estudiantes es
left join public.asistencia a on a.estudiante_id = es.id
group by es.id, es.nombre, es.activo;

-- ------------------------------------------------------------
-- Función: porcentaje de asistencia de la última sesión registrada.
-- Devuelve null si todavía no hay sesiones (evita dividir por cero).
-- ------------------------------------------------------------
create or replace function public.fn_resumen_ultima_sesion()
returns table (
  fecha            date,
  total            integer,
  presentes        integer,
  porcentaje       integer
)
language sql
stable
as $$
  with ultima as (
    select id, fecha from public.sesiones order by fecha desc limit 1
  )
  select
    u.fecha,
    count(a.id)::integer,
    count(*) filter (where a.estado <> 'ausente')::integer,
    case when count(a.id) = 0 then null
         else round(100.0 * count(*) filter (where a.estado <> 'ausente') / count(a.id))::integer
    end
  from ultima u
  left join public.asistencia a on a.sesion_id = u.id
  group by u.fecha;
$$;

-- ------------------------------------------------------------
-- Permitir leer las vistas
-- ------------------------------------------------------------
grant select on public.vista_equipos_resumen        to anon, authenticated;
grant select on public.vista_ranking_practicas      to anon, authenticated;
grant select on public.vista_asistencia_estudiante  to anon, authenticated;
grant execute on function public.fn_resumen_ultima_sesion() to anon, authenticated;

-- Las vistas heredan la seguridad de sus tablas base (security_invoker),
-- así que el RLS de estudiantes/equipos/practicas/asistencia sigue aplicando.
alter view public.vista_equipos_resumen       set (security_invoker = true);
alter view public.vista_ranking_practicas     set (security_invoker = true);
alter view public.vista_asistencia_estudiante set (security_invoker = true);

do $$ begin
  raise notice 'Vistas y funciones listas. Esquema de CoachPanel completo.';
end $$;
