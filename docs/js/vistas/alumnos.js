/**
 * vistas/alumnos.js — Vista de consulta para alumnos y representantes.
 *
 * Es la pantalla principal del MODO CLUB (sin contraseña, solo lectura).
 * Muestra todo lo que le interesa a una familia, en un solo lugar y sin
 * ningún botón que pueda cambiar datos:
 *
 *   · Fichas del club: estudiantes activos, equipos, clases, prácticas.
 *   · Asistencia del mes y de la última clase.
 *   · Tabla de equipos con sus integrantes y mejores marcas.
 *   · Mejores tiempos y puntajes por reto.
 *
 * Si alguien llega aquí siendo coach, se le avisa y se le ofrece el panel.
 */

import {
  crear, limpiar, reemplazar, esqueletoKpis, esqueletoFilas, estadoVacio, icono,
  avisoAtencion, descargar, aCsv,
} from '../ui.js';
import {
  kpi, tabla, insignia, puntoEquipo, porcentajeAsistencia, conteoTexto, metrica,
} from '../componentes/ladrillo.js';
import {
  formatearDuracionCorta, formatearPuntaje, fechaLarga, fechaCorta, hoyISO, claveMes, nombreMes,
} from '../formato.js';
import { resumenSesion } from '../asistencia.js';
import { rankingPorReto } from '../estadisticas.js';
import { integrantesConNombre, integrantesEnTexto } from '../equipos.js';
import { mensajeDeError } from '../api.js';

export async function renderAlumnos(raiz, contexto) {
  const {
    api, cabecera, esCoach, navegar, CONFIG,
  } = contexto;

  let enPantalla = true;

  const contenedor = crear('div', { 'aria-busy': 'true' }, [esqueletoKpis(4), esqueletoFilas(4)]);

  raiz.append(cabecera({
    titulo: 'El club',
    descripcion: 'Consulta la asistencia, los equipos, los tiempos de pista y los puntajes.',
    acciones: [],
  }));

  // Si es el coach, se le recuerda que tiene el panel completo.
  if (esCoach?.()) {
    raiz.append(crear('div', { clase: 'banda banda--info' }, [
      crear('span', { html: icono('info', { tamano: 18 }) }),
      crear('span', {
        estilo: 'flex:1 1 auto',
        texto: 'Estás viendo la pantalla de alumnos y representantes. Como coach tienes el panel completo.',
      }),
      crear('button', {
        clase: 'boton boton--sm boton--primario',
        type: 'button',
        texto: 'Ir al panel',
        onclick: () => navegar('panel'),
      }),
    ]));
  }

  raiz.append(contenedor);

  /* ---------------- carga ---------------- */

  async function cargar() {
    limpiar(contenedor);
    contenedor.setAttribute('aria-busy', 'true');
    contenedor.append(esqueletoKpis(4), esqueletoFilas(4));

    try {
      const resultados = await Promise.allSettled([
        api.listarEquipos({ incluirInactivos: false }),
        api.listarEstudiantes({ incluirInactivos: false }),
        api.practicasRecientes(400),
        api.asistenciaReciente(1000),
        api.listarRetos(),
        api.listarEquiposResumen(),
      ]);

      const [resEquipos, resEstudiantes, resPracticas, resAsistencia, resRetos, resResumen] = resultados
        .map((r) => (r.status === 'fulfilled' ? r.value : { datos: [] }));

      if (!enPantalla) return;
      pintar({
        equipos: resEquipos?.datos ?? [],
        estudiantes: resEstudiantes?.datos ?? [],
        practicas: resPracticas?.datos ?? [],
        asistencia: resAsistencia?.datos ?? [],
        retos: resRetos?.datos ?? [],
        resumenes: new Map((resResumen?.datos ?? []).map((f) => [Number(f.id), f])),
        deCache: resultados.some((r) => r.status === 'fulfilled' && r.value?.deCache),
        antiguedad: resultados.map((r) => r.status === 'fulfilled' ? r.value?.antiguedad : null)
          .find(Boolean) ?? null,
      });
    } catch (error) {
      if (!enPantalla) return;
      contenedor.removeAttribute('aria-busy');
      reemplazar(contenedor, estadoVacio({
        titulo: 'No se pudo cargar la información',
        texto: mensajeDeError(error),
        accion: crear('button', {
          clase: 'boton boton--primario', type: 'button', texto: 'Reintentar', onclick: cargar,
        }),
      }));
    }
  }

  /* ---------------- pintado ---------------- */

  function pintar(datos) {
    const {
      equipos, estudiantes, practicas, asistencia, retos, resumenes,
    } = datos;

    reemplazar(contenedor);
    contenedor.removeAttribute('aria-busy');

    const mesActual = claveMes(hoyISO());
    const delMes = asistencia.filter((r) => String(r.sesiones?.fecha ?? '').startsWith(mesActual));
    const resumenMes = resumenSesion(delMes);

    // Última clase registrada.
    const porSesion = new Map();
    asistencia.forEach((r) => {
      const id = Number(r.sesion_id);
      if (!porSesion.has(id)) porSesion.set(id, { fecha: r.sesiones?.fecha ?? '', registros: [] });
      porSesion.get(id).registros.push(r);
    });
    const ultima = [...porSesion.values()]
      .filter((s) => s.fecha)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null;
    const resumenUltima = ultima ? resumenSesion(ultima.registros) : null;

    /* ---- Bienvenida ---- */
    contenedor.append(crear('section', {
      clase: 'tarjeta tarjeta--studs',
      estilo: 'margin-bottom:var(--e-5)',
    }, [
      crear('h2', { texto: `Hola 👋 — ${CONFIG?.NOMBRE_CLUB ?? 'nuestro club de robótica'}` }),
      crear('p', {
        clase: 'campo__ayuda',
        estilo: 'margin:0',
        texto: 'Aquí puedes ver cómo va el club: quién asistió, cómo están armados los equipos '
          + 'y cuánto tardan los robots en la pista. Los datos los registra el coach en cada clase.',
      }),
    ]));

    /* ---- Indicadores del club ---- */
    contenedor.append(crear('div', { clase: 'rejilla rejilla--kpi', estilo: 'margin-bottom:var(--e-5)' }, [
      kpi({
        etiqueta: 'Estudiantes en el club',
        valor: String(estudiantes.length),
        detalle: 'Activos',
        iconoNombre: 'estudiantes',
      }),
      kpi({
        etiqueta: 'Equipos',
        valor: String(equipos.length),
        detalle: `${equipos.filter((e) => ['inscrito', 'participo'].includes(e.wro_estado)).length} en la WRO`,
        color: 'var(--violeta)',
        iconoNombre: 'equipos',
      }),
      kpi({
        etiqueta: 'Asistencia del mes',
        valor: resumenMes.porcentaje === null ? '—' : `${resumenMes.porcentaje} %`,
        detalle: delMes.length
          ? `${conteoTexto(new Set(delMes.map((r) => r.sesion_id)).size, 'clase', 'clases')} este mes`
          : 'Sin clases registradas este mes',
        color: resumenMes.porcentaje === null
          ? 'var(--texto-apagado)'
          : (resumenMes.porcentaje >= 85 ? 'var(--verde)' : 'var(--ambar)'),
        iconoNombre: 'asistencia',
      }),
      kpi({
        etiqueta: 'Prácticas de pista',
        valor: String(practicas.length),
        detalle: practicas.length ? `Última: ${fechaCorta(practicas[0].fecha)}` : 'Aún no hay',
        color: 'var(--ambar)',
        iconoNombre: 'practicas',
      }),
    ]));

    /* ---- Última clase + asistencia del mes ---- */
    contenedor.append(crear('div', { clase: 'rejilla rejilla--2', estilo: 'margin-bottom:var(--e-5)' }, [
      crear('section', { clase: 'tarjeta tarjeta--studs' }, [
        crear('h2', { texto: 'Última clase' }),
        ultima
          ? crear('div', {}, [
            crear('p', { estilo: 'margin:0 0 var(--e-3);font-weight:600', texto: fechaLarga(ultima.fecha) }),
            crear('div', { estilo: 'display:flex;flex-wrap:wrap;gap:var(--e-3);align-items:center' }, [
              porcentajeAsistencia(resumenUltima.porcentaje),
              insignia('presente', `${resumenUltima.presente} presentes`),
              insignia('tarde', `${resumenUltima.tarde} tarde`),
              insignia('justificado', `${resumenUltima.justificado} justificados`),
              insignia('ausente', `${resumenUltima.ausente} ausentes`),
            ]),
          ])
          : estadoVacio({
            titulo: 'Todavía no hay clases registradas',
            texto: 'Cuando el coach tome la primera asistencia, aquí verás el resumen.',
            iconoNombre: 'asistencia',
          }),
      ]),

      crear('section', { clase: 'tarjeta tarjeta--studs' }, [
        crear('h2', { texto: `Asistencia de ${nombreMes(mesActual)}` }),
        resumenMes.total
          ? crear('div', { clase: 'utilidades' }, [
            crear('div', {}, [
              crear('span', { clase: 'metrica__etiqueta', texto: 'Asistencia' }),
              porcentajeAsistencia(resumenMes.porcentaje),
            ]),
            metrica('Presentes', String(resumenMes.presente)),
            metrica('Tarde', String(resumenMes.tarde)),
            metrica('Justificados', String(resumenMes.justificado)),
            metrica('Ausencias', String(resumenMes.ausente)),
          ])
          : crear('p', {
            clase: 'campo__ayuda',
            texto: 'Este mes todavía no se ha tomado asistencia.',
          }),
      ]),
    ]));

    /* ---- Equipos ---- */
    contenedor.append(crear('section', {
      clase: 'tarjeta tarjeta--studs',
      estilo: 'margin-bottom:var(--e-5)',
    }, [
      crear('h2', { texto: 'Equipos del club' }),
      equipos.length
        ? crear('div', { clase: 'rejilla rejilla--equipos' }, equipos.map((equipo) => {
          const integrantes = integrantesConNombre(equipo, estudiantes);
          const resumen = resumenes.get(Number(equipo.id));

          return crear('article', { clase: 'tarjeta tarjeta--plana resumen-equipo' }, [
            crear('div', { clase: 'equipo__cabecera' }, [
              crear('h3', { clase: 'equipo__nombre' }, [
                puntoEquipo(equipo.id),
                crear('span', { estilo: 'margin-left:.5rem', texto: equipo.nombre }),
              ]),
              insignia(equipo.wro_estado ?? 'no_participa'),
            ]),

            equipo.categoria_wro
              ? crear('span', { clase: 'campo__ayuda', texto: equipo.categoria_wro })
              : null,

            crear('p', { clase: 'campo__ayuda', estilo: 'margin:0', texto: integrantesEnTexto(integrantes, 3) }),

            resumen
              ? crear('div', { clase: 'equipo__metricas' }, [
                metrica('Mejor tiempo', formatearDuracionCorta(resumen.mejor_duracion_ms)),
                metrica('Mejor puntaje', formatearPuntaje(resumen.mejor_puntaje)),
                metrica('Prácticas', formatearPuntaje(resumen.practicas ?? 0)),
              ])
              : null,
          ]);
        }))
        : estadoVacio({
          titulo: 'Todavía no hay equipos',
          texto: 'Cuando el coach arme los equipos, aparecerán aquí con sus integrantes.',
          iconoNombre: 'equipos',
        }),
    ]));

    /* ---- Mejores marcas por reto ---- */
    const ranking = rankingPorReto(practicas, retos, equipos).slice(0, 12);

    contenedor.append(crear('section', { clase: 'tarjeta tarjeta--studs' }, [
      crear('div', { clase: 'tarjeta__titulo' }, [
        crear('h2', { texto: 'Mejores tiempos y puntajes' }),
        crear('button', {
          clase: 'boton boton--sm boton--fantasma',
          type: 'button',
          texto: 'Descargar (Excel)',
          onclick: () => exportar(practicas, equipos),
        }),
      ]),
      ranking.length
        ? tabla({
          titulo: 'Mejor marca de cada equipo en cada pista',
          filas: ranking,
          columnas: [
            { clave: 'reto', etiqueta: 'Reto o pista' },
            {
              clave: 'equipo',
              etiqueta: 'Equipo',
              celda: (fila) => crear('span', { estilo: 'display:inline-flex;align-items:center;gap:.5rem' }, [
                puntoEquipo(fila.equipoId),
                crear('strong', { texto: fila.equipo }),
              ]),
            },
            {
              clave: 'mejorDuracionMs',
              etiqueta: 'Mejor tiempo',
              alinear: 'derecha',
              numeros: true,
              celda: (fila) => crear('strong', {
                estilo: 'color:var(--verde)',
                texto: formatearDuracionCorta(fila.mejorDuracionMs),
              }),
            },
            {
              clave: 'medianaDuracionMs',
              etiqueta: 'Tiempo habitual',
              alinear: 'derecha',
              numeros: true,
              celda: (fila) => formatearDuracionCorta(fila.medianaDuracionMs),
            },
            {
              clave: 'mejorPuntaje',
              etiqueta: 'Mejor puntaje',
              alinear: 'derecha',
              numeros: true,
              celda: (fila) => crear('strong', {
                estilo: 'color:var(--ambar)',
                texto: formatearPuntaje(fila.mejorPuntaje),
              }),
            },
            {
              clave: 'intentos',
              etiqueta: 'Intentos',
              alinear: 'centro',
              numeros: true,
            },
          ],
        })
        : estadoVacio({
          titulo: 'Todavía no hay prácticas registradas',
          texto: 'Cuando el coach registre los intentos de pista, aquí verás los tiempos y puntajes.',
          iconoNombre: 'practicas',
        }),
      crear('p', {
        clase: 'campo__ayuda',
        estilo: 'margin-top:var(--e-3)',
        texto: 'En la pista, menos tiempo es mejor: el "mejor tiempo" es el recorrido más rápido. '
          + 'En puntaje es al revés: más es mejor.',
      }),
    ]));
  }

  /** Descarga las prácticas en CSV para que las familias las guarden. */
  function exportar(practicas, equipos) {
    if (!practicas.length) {
      avisoAtencion('Todavía no hay prácticas para descargar.');
      return;
    }
    const nombreEquipo = new Map(equipos.map((e) => [Number(e.id), e.nombre]));
    const filas = practicas.map((p) => ({
      fecha: p.fecha,
      equipo: nombreEquipo.get(Number(p.equipo_id)) ?? `Equipo ${p.equipo_id}`,
      intento: p.intento,
      tiempo: p.duracion_ms === null || p.duracion_ms === undefined
        ? ''
        : formatearDuracionCorta(p.duracion_ms),
      puntaje: p.puntaje,
    }));

    descargar(
      `practicas-club-${hoyISO()}.csv`,
      aCsv(filas, ['fecha', 'equipo', 'intento', 'tiempo', 'puntaje']),
      'text/csv',
    );
    avisoAtencion('Archivo descargado. Se abre con Excel.', { duracion: 5000 });
  }

  await cargar();

  return {
    destruir() { enPantalla = false; },
  };
}
