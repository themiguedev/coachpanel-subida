/**
 * vistas/panel.js — Pantalla principal con el resumen del club.
 *
 * Responde de un vistazo: ¿cuántos niños hay?, ¿cómo va la asistencia este
 * mes?, ¿cómo van los robots en la pista? y ¿qué toca hacer ahora?
 */

import {
  crear, limpiar, reemplazar, esqueletoKpis, esqueletoFilas, estadoVacio, icono,
} from '../ui.js';
import { kpi, insignia, puntoEquipo, tabla, porcentajeAsistencia, conteoTexto } from '../componentes/ladrillo.js';
import { formatearDuracionCorta, formatearPuntaje, fechaCorta, fechaLarga, hoyISO, claveMes } from '../formato.js';
import { serieSemanal, resumenSesion } from '../asistencia.js';
import { graficoBarrasSvg, rankingEquipos } from '../estadisticas.js';
import { mensajeDeError } from '../api.js';

export async function renderPanel(raiz, contexto) {
  const { api, cabecera, navegar, CONFIG } = contexto;

  let enPantalla = true;
  let datos = null;

  const contenedor = crear('div', { 'aria-busy': 'true' }, [esqueletoKpis(4), esqueletoFilas(4)]);

  raiz.append(cabecera({
    titulo: 'Panel',
    descripcion: fechaLarga(hoyISO()),
    acciones: [
      crear('button', {
        clase: 'boton boton--primario',
        type: 'button',
        onclick: () => navegar('asistencia'),
      }, [
        crear('span', { html: icono('asistencia', { tamano: 16, clase: 'boton__icono' }) }),
        crear('span', { texto: 'Tomar asistencia de hoy' }),
      ]),
    ],
  }));

  raiz.append(contenedor);

  /* ---------------- carga ---------------- */

  async function cargar() {
    limpiar(contenedor);
    contenedor.setAttribute('aria-busy', 'true');
    contenedor.append(esqueletoKpis(4), esqueletoFilas(4));

    try {
      const [resEstudiantes, resEquipos, resPracticas, resAsistencia, resSesiones] = await Promise.all([
        api.listarEstudiantes({ incluirInactivos: true }),
        api.listarEquipos({ incluirInactivos: true }),
        api.practicasRecientes(400),
        api.asistenciaReciente(1000),
        api.listarSesiones({ limite: 400 }),
      ]);

      datos = {
        estudiantes: resEstudiantes.datos ?? [],
        equipos: resEquipos.datos ?? [],
        practicas: resPracticas.datos ?? [],
        asistencia: resAsistencia.datos ?? [],
        sesiones: resSesiones.datos ?? [],
      };

      if (!enPantalla) return;
      pintar();
    } catch (error) {
      if (!enPantalla) return;
      contenedor.removeAttribute('aria-busy');
      reemplazar(contenedor, estadoVacio({
        titulo: 'No se pudo cargar el panel',
        texto: mensajeDeError(error),
        iconoNombre: 'panel',
        accion: crear('button', {
          clase: 'boton boton--primario', type: 'button', texto: 'Reintentar', onclick: cargar,
        }),
      }));
    }
  }

  /* ---------------- cálculos ---------------- */

  function asistenciaDelMes(mes) {
    return datos.asistencia.filter((registro) => String(registro.sesiones?.fecha ?? '').startsWith(mes));
  }

  function pintar() {
    reemplazar(contenedor);
    contenedor.removeAttribute('aria-busy');

    const { estudiantes, equipos, practicas, asistencia, sesiones } = datos;

    const activos = estudiantes.filter((e) => e.activo !== false);
    const equiposActivos = equipos.filter((e) => e.activo !== false);
    const mesActual = claveMes(hoyISO());

    // ---- Asistencia del mes ----
    const delMes = asistenciaDelMes(mesActual);
    const resumenMes = resumenSesion(delMes);
    const sesionesDelMes = new Set(delMes.map((r) => r.sesion_id)).size;

    // ---- Última sesión registrada ----
    const ultimaSesion = sesiones[0] ?? null;
    const registrosUltima = ultimaSesion
      ? asistencia.filter((r) => Number(r.sesion_id) === Number(ultimaSesion.id))
      : [];
    const resumenUltima = resumenSesion(registrosUltima);

    // ---- Gráfico de las últimas 8 semanas ----
    const serie = serieSemanal(asistencia, 8);

    // ---- Mejores marcas por equipo ----
    const ranking = rankingEquipos(practicas, equipos).slice(0, 6);

    // ---- Equipos inscritos en la WRO ----
    const inscritosWro = equipos.filter((e) => ['inscrito', 'participo'].includes(e.wro_estado));

    // ---- Estudiantes sin equipo ----
    const idsConEquipo = new Set(
      equipos.flatMap((e) => (e.equipo_integrantes ?? []).map((i) => Number(i.estudiante_id))),
    );
    const sinEquipo = activos.filter((e) => !idsConEquipo.has(Number(e.id)));

    contenedor.append(
      /* ---- Indicadores principales ---- */
      crear('div', { clase: 'rejilla rejilla--kpi', estilo: 'margin-bottom:var(--e-5)' }, [
        kpi({
          etiqueta: 'Estudiantes activos',
          valor: String(activos.length),
          detalle: estudiantes.length !== activos.length
            ? `${estudiantes.length - activos.length} dados de baja`
            : 'Todos activos',
          iconoNombre: 'estudiantes',
          color: 'var(--primario)',
        }),
        kpi({
          etiqueta: 'Equipos',
          valor: String(equiposActivos.length),
          detalle: `${inscritosWro.length} en la WRO`,
          iconoNombre: 'equipos',
          color: 'var(--violeta)',
        }),
        kpi({
          etiqueta: 'Asistencia del mes',
          valor: resumenMes.porcentaje === null ? '—' : `${resumenMes.porcentaje} %`,
          detalle: sesionesDelMes
            ? `${conteoTexto(sesionesDelMes, 'clase', 'clases')} · ${resumenMes.ausente} ausencias`
            : 'Todavía no hay clases este mes',
          iconoNombre: 'asistencia',
          color: resumenMes.porcentaje === null
            ? 'var(--texto-apagado)'
            : (resumenMes.porcentaje >= 85 ? 'var(--verde)' : 'var(--ambar)'),
        }),
        kpi({
          etiqueta: 'Prácticas registradas',
          valor: String(practicas.length),
          detalle: practicas.length
            ? `Última: ${fechaCorta(practicas[0].fecha)}`
            : 'Sin prácticas todavía',
          iconoNombre: 'practicas',
          color: 'var(--ambar)',
        }),
      ]),

      /* ---- Acciones rápidas ---- */
      crear('section', { clase: 'tarjeta tarjeta--studs', estilo: 'margin-bottom:var(--e-5)' }, [
        crear('h2', { texto: 'Acciones rápidas' }),
        crear('div', { clase: 'acciones-rapidas' }, [
          crear('button', {
            clase: 'boton boton--primario',
            type: 'button',
            onclick: () => navegar('asistencia'),
          }, [crear('span', { texto: '✅ Tomar asistencia' })]),
          crear('button', {
            clase: 'boton',
            type: 'button',
            onclick: () => navegar('practicas'),
          }, [crear('span', { texto: '⏱️ Registrar práctica' })]),
          crear('button', {
            clase: 'boton',
            type: 'button',
            onclick: () => navegar('estudiantes'),
          }, [crear('span', { texto: '🧑‍🤝‍🧑 Agregar estudiante' })]),
          crear('button', {
            clase: 'boton',
            type: 'button',
            onclick: () => navegar('equipos'),
          }, [crear('span', { texto: '🧱 Armar equipo' })]),
        ]),
      ]),

      /* ---- Última clase + gráfico ---- */
      crear('div', { clase: 'rejilla rejilla--2', estilo: 'margin-bottom:var(--e-5)' }, [
        crear('section', { clase: 'tarjeta tarjeta--studs' }, [
          crear('h2', { texto: 'Última clase registrada' }),
          ultimaSesion
            ? crear('div', {}, [
              crear('p', { estilo: 'margin:0 0 var(--e-3)' }, [
                crear('strong', { texto: fechaLarga(ultimaSesion.fecha) }),
                ultimaSesion.titulo ? crear('span', { texto: ` · ${ultimaSesion.titulo}` }) : null,
              ]),
              crear('div', {
                estilo: 'display:flex;flex-wrap:wrap;gap:var(--e-3);align-items:center',
              }, [
                porcentajeAsistencia(resumenUltima.porcentaje),
                insignia('presente', `${resumenUltima.presente} presentes`),
                insignia('tarde', `${resumenUltima.tarde} tarde`),
                insignia('justificado', `${resumenUltima.justificado} justificados`),
                insignia('ausente', `${resumenUltima.ausente} ausentes`),
                ultimaSesion.estado === 'cerrada' ? insignia('no_participa', 'Sesión cerrada') : null,
              ]),
              crear('div', { clase: 'acciones', estilo: 'margin-top:var(--e-4)' }, [
                crear('button', {
                  clase: 'boton boton--sm boton--fantasma',
                  type: 'button',
                  texto: 'Ver o corregir esa clase',
                  onclick: () => navegar('asistencia'),
                }),
              ]),
            ])
            : estadoVacio({
              titulo: 'Todavía no hay clases registradas',
              texto: 'Cuando tomes la primera asistencia, aquí verás el resumen de la última clase.',
              iconoNombre: 'asistencia',
              accion: crear('button', {
                clase: 'boton boton--primario',
                type: 'button',
                texto: 'Tomar asistencia de hoy',
                onclick: () => navegar('asistencia'),
              }),
            }),
        ]),

        crear('section', { clase: 'tarjeta tarjeta--studs' }, [
          crear('h2', { texto: 'Asistencia de las últimas 8 semanas' }),
          crear('div', {}, [
            graficoBarrasSvg(serie, {
              titulo: 'Porcentaje de asistencia por semana',
              descripcion: 'Cada barra es una semana. Las barras grises son semanas en las que no se registró ninguna clase.',
            }),
          ]),
          crear('p', {
            clase: 'campo__ayuda',
            texto: 'Las barras grises son semanas en las que no se registró ninguna clase.',
          }),
        ]),
      ]),

      /* ---- Mejores marcas ---- */
      crear('div', { clase: 'rejilla rejilla--2', estilo: 'margin-bottom:var(--e-5)' }, [
        crear('section', { clase: 'tarjeta tarjeta--studs' }, [
          crear('div', { clase: 'tarjeta__titulo' }, [
            crear('h2', { texto: 'Mejores marcas por equipo' }),
            crear('button', {
              clase: 'boton boton--sm boton--fantasma',
              type: 'button',
              texto: 'Ver prácticas',
              onclick: () => navegar('practicas'),
            }),
          ]),
          tabla({
            titulo: 'Mejor tiempo y mejor puntaje de cada equipo',
            filas: ranking,
            columnas: [
              {
                clave: 'equipo',
                etiqueta: 'Equipo',
                celda: (fila) => crear('span', { estilo: 'display:inline-flex;align-items:center;gap:.5rem' }, [
                  puntoEquipo(fila.equipoId),
                  crear('span', { texto: fila.equipo }),
                ]),
              },
              {
                clave: 'mejorDuracionMs',
                etiqueta: 'Mejor tiempo',
                alinear: 'derecha',
                numeros: true,
                celda: (fila) => formatearDuracionCorta(fila.mejorDuracionMs),
              },
              {
                clave: 'mejorPuntaje',
                etiqueta: 'Mejor puntaje',
                alinear: 'derecha',
                numeros: true,
                celda: (fila) => formatearPuntaje(fila.mejorPuntaje),
              },
              {
                clave: 'intentos',
                etiqueta: 'Prácticas',
                alinear: 'centro',
                numeros: true,
                celda: (fila) => String(fila.cantidad),
              },
            ],
            vacio: estadoVacio({
              titulo: 'Todavía no hay prácticas',
              texto: 'Registra la primera práctica de pista para ver las mejores marcas.',
              iconoNombre: 'practicas',
            }),
          }),
        ]),

        crear('section', { clase: 'tarjeta tarjeta--studs' }, [
          crear('h2', { texto: 'Pendientes y avisos' }),
          crear('ul', { estilo: 'margin:0;padding-left:1.1rem;line-height:2' }, [
            sinEquipo.length
              ? crear('li', {}, [
                crear('span', { texto: `${conteoTexto(sinEquipo.length, 'estudiante')} sin equipo asignado. ` }),
                crear('a', { href: '#/equipos', texto: 'Armar equipos' }),
              ])
              : crear('li', { texto: '✅ Todos los estudiantes activos tienen equipo.' }),

            activos.length > 0 && equiposActivos.length === 0
              ? crear('li', {}, [
                crear('span', { texto: 'No hay equipos creados todavía. ' }),
                crear('a', { href: '#/equipos', texto: 'Crear el primero' }),
              ])
              : null,

            inscritosWro.length
              ? crear('li', { texto: `🏆 ${conteoTexto(inscritosWro.length, 'equipo')} en la WRO Venezuela.` })
              : crear('li', { texto: 'Todavía no hay equipos marcados para la WRO.', estilo: 'color:var(--texto-apagado)' }),

            practicas.length === 0
              ? crear('li', { texto: 'Aún no se ha registrado ninguna práctica de pista.' })
              : crear('li', {
                texto: `Última práctica: ${fechaLarga(practicas[0].fecha)} `
                  + `(${practicas[0].equipos?.nombre ?? 'equipo'}).`,
              }),

            resumenMes.porcentaje !== null && resumenMes.porcentaje < 70
              ? crear('li', {
                estilo: 'color:var(--ambar);font-weight:600',
                texto: `La asistencia de este mes está en ${resumenMes.porcentaje} %. Vale la pena avisar a los representantes.`,
              })
              : null,
          ].filter(Boolean)),
        ]),
      ]),

      /* ---- Pie con información útil ---- */
      crear('p', {
        clase: 'campo__ayuda',
        texto: 'Los datos se guardan en la nube de Supabase: todos los dispositivos que abran este link ven lo mismo. '
          + 'Recuerda descargar un respaldo de vez en cuando (botón en el menú lateral).',
      }),
    );
  }

  await cargar();

  return {
    destruir() { enPantalla = false; },
  };
}
