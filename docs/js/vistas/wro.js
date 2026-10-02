/**
 * vistas/wro.js — Participación en la WRO Venezuela.
 *
 * Registro simple, como se pidió: qué equipos participan, en qué categoría
 * y con qué resultado. Incluye un reporte imprimible para llevar a la
 * competencia o compartir con los representantes.
 */

import {
  crear, limpiar, reemplazar, esqueletoKpis, estadoVacio, avisoOk, icono,
} from '../ui.js';
import { kpi, insignia, puntoEquipo, tabla } from '../componentes/ladrillo.js';
import { ESTADOS_WRO, ETIQUETAS_WRO, integrantesConNombre, integrantesEnTexto } from '../equipos.js';
import { formatearPuntaje, formatearDuracionCorta, fechaCorta } from '../formato.js';
import { resumirPracticas } from '../estadisticas.js';
import { mensajeDeError } from '../api.js';

const ESTADOS_ORDEN = ['inscrito', 'participo', 'no_participo', 'no_participa'];

export async function renderWro(raiz, contexto) {
  const {
    api, cabecera, modal, CONFIG, esCoach = () => true, permitirEdicion = () => true,
  } = contexto;

  /** ¿Esta modalidad puede editar la participación en la WRO? */
  const puedeEditar = () => esCoach();

  let equipos = [];
  let estudiantes = [];
  let practicas = [];
  let enPantalla = true;

  const contenedor = crear('div', { 'aria-busy': 'true' }, [esqueletoKpis(3)]);

  raiz.append(cabecera({
    titulo: 'WRO Venezuela',
    descripcion: 'Registro de qué equipos participan, en qué categoría y con qué resultado.',
    acciones: [
      crear('button', {
        clase: 'boton boton--fantasma',
        type: 'button',
        onclick: () => window.print(),
      }, [
        crear('span', { html: icono('imprimir', { tamano: 16, clase: 'boton__icono' }) }),
        crear('span', { texto: 'Imprimir reporte' }),
      ]),
    ],
  }));

  raiz.append(contenedor);

  /* ---------------- carga ---------------- */

  async function cargar() {
    limpiar(contenedor);
    contenedor.setAttribute('aria-busy', 'true');
    contenedor.append(esqueletoKpis(3));

    try {
      const [resEquipos, resEstudiantes, resPracticas] = await Promise.all([
        api.listarEquipos({ incluirInactivos: false }),
        api.listarEstudiantes({ incluirInactivos: true }),
        api.practicasRecientes(500),
      ]);

      equipos = resEquipos.datos ?? [];
      estudiantes = resEstudiantes.datos ?? [];
      practicas = resPracticas.datos ?? [];

      if (!enPantalla) return;
      pintar();
    } catch (error) {
      if (!enPantalla) return;
      contenedor.removeAttribute('aria-busy');
      reemplazar(contenedor, estadoVacio({
        titulo: 'No se pudo cargar la participación',
        texto: mensajeDeError(error),
        iconoNombre: 'wro',
        accion: crear('button', { clase: 'boton boton--primario', type: 'button', texto: 'Reintentar', onclick: cargar }),
      }));
    }
  }

  /* ---------------- pintado ---------------- */

  function equiposPorEstado() {
    const grupos = new Map(ESTADOS_ORDEN.map((estado) => [estado, []]));
    equipos.forEach((equipo) => {
      const estado = ESTADOS_WRO.includes(equipo.wro_estado) ? equipo.wro_estado : 'no_participa';
      grupos.get(estado).push(equipo);
    });
    return grupos;
  }

  function mejoresMarcas(equipoId) {
    return resumirPracticas(practicas.filter((p) => Number(p.equipo_id) === Number(equipoId)));
  }

  function pintar() {
    reemplazar(contenedor);
    contenedor.removeAttribute('aria-busy');

    // Encabezado para la versión impresa.
    const encabezadoImpresion = crear('div', { clase: 'encabezado-impresion' }, [
      crear('h1', { texto: `Participación en la WRO Venezuela — ${CONFIG?.NOMBRE_CLUB ?? ''}` }),
      crear('p', { texto: `Reporte generado el ${fechaCorta(new Date().toISOString().slice(0, 10))}` }),
    ]);

    if (equipos.length === 0) {
      contenedor.append(estadoVacio({
        titulo: 'Todavía no hay equipos',
        texto: 'Crea los equipos en la sección Equipos; después podrás marcar aquí cuáles participan en la WRO.',
        iconoNombre: 'wro',
        accion: crear('a', { clase: 'boton boton--primario', href: '#/equipos', texto: 'Ir a Equipos' }),
      }));
      return;
    }

    const grupos = equiposPorEstado();
    const inscritos = [...grupos.get('inscrito'), ...grupos.get('participo')];
    const conResultado = equipos.filter((e) => (e.wro_resultado ?? '').trim() !== '');

    contenedor.append(
      encabezadoImpresion,

      crear('div', { clase: 'rejilla rejilla--kpi no-imprimir', estilo: 'margin-bottom:var(--e-5)' }, [
        kpi({
          etiqueta: 'Participan en la WRO',
          valor: String(inscritos.length),
          detalle: `${grupos.get('inscrito').length} inscritos · ${grupos.get('participo').length} participaron`,
          color: 'var(--violeta)',
          iconoNombre: 'wro',
        }),
        kpi({
          etiqueta: 'Con resultado registrado',
          valor: String(conResultado.length),
          detalle: 'Puesto, medalla o mención',
          color: 'var(--ambar)',
          iconoNombre: 'trofeo',
        }),
        kpi({
          etiqueta: 'Equipos fuera de la WRO',
          valor: String(grupos.get('no_participa').length),
          detalle: 'Solo entrenan en el club',
          color: 'var(--texto-apagado)',
          iconoNombre: 'equipos',
        }),
      ]),

      crear('div', { clase: 'rejilla rejilla--2' }, equipos.map((equipo) => {
        const integrantes = integrantesConNombre(equipo, estudiantes);
        const resumen = mejoresMarcas(equipo.id);
        const resultado = (equipo.wro_resultado ?? '').trim();

        return crear('article', { clase: 'tarjeta tarjeta--studs tarjeta-wro' }, [
          crear('div', { clase: 'equipo__cabecera' }, [
            crear('div', {}, [
              crear('h3', { clase: 'equipo__nombre' }, [
                puntoEquipo(equipo.id),
                crear('span', { texto: equipo.nombre, estilo: 'margin-left:.5rem' }),
              ]),
              equipo.categoria_wro
                ? crear('span', { clase: 'campo__ayuda', texto: equipo.categoria_wro })
                : crear('span', { clase: 'campo__ayuda', texto: 'Categoría sin definir' }),
            ]),
            insignia(equipo.wro_estado ?? 'no_participa'),
          ]),

          crear('p', { clase: 'campo__ayuda', texto: integrantesEnTexto(integrantes, 3) }),

          resultado
            ? crear('p', { estilo: 'margin:0' }, [
              crear('strong', { texto: 'Resultado: ' }),
              crear('span', { texto: resultado }),
            ])
            : null,

          equipo.wro_nota
            ? crear('p', { clase: 'campo__ayuda', estilo: 'margin:0', texto: equipo.wro_nota })
            : null,

          crear('div', { clase: 'equipo__metricas' }, [
            crear('div', {}, [
              crear('span', { clase: 'metrica__etiqueta', texto: 'Mejor tiempo' }),
              crear('span', { clase: 'metrica__valor', texto: formatearDuracionCorta(resumen.mejorDuracionMs) }),
            ]),
            crear('div', {}, [
              crear('span', { clase: 'metrica__etiqueta', texto: 'Mejor puntaje' }),
              crear('span', { clase: 'metrica__valor', texto: formatearPuntaje(resumen.mejorPuntaje) }),
            ]),
            crear('div', {}, [
              crear('span', { clase: 'metrica__etiqueta', texto: 'Prácticas' }),
              crear('span', { clase: 'metrica__valor', texto: formatearPuntaje(resumen.cantidad) }),
            ]),
          ]),

          puedeEditar()
            ? crear('div', { clase: 'acciones no-imprimir' }, [
              crear('button', {
                clase: 'boton boton--sm boton--primario',
                type: 'button',
                texto: 'Registrar participación',
                onclick: () => abrirEditorWro(equipo),
              }),
            ])
            : null,
        ]);
      })),

      crear('section', { clase: 'tarjeta tarjeta--studs', estilo: 'margin-top:var(--e-5)' }, [
        crear('h2', { texto: 'Resumen por estado' }),
        tabla({
          titulo: 'Equipos agrupados por su estado de participación en la WRO',
          filas: ESTADOS_ORDEN.map((estado) => ({
            estado,
            cantidad: grupos.get(estado).length,
            equipos: grupos.get(estado).map((e) => e.nombre).join(', ') || '—',
          })).filter((fila) => fila.cantidad > 0),
          columnas: [
            { clave: 'estado', etiqueta: 'Estado', celda: (fila) => insignia(fila.estado) },
            { clave: 'cantidad', etiqueta: 'Equipos', alinear: 'centro', numeros: true },
            { clave: 'equipos', etiqueta: 'Cuáles' },
          ],
          vacio: estadoVacio({ titulo: 'Sin datos', texto: 'Marca la participación de tus equipos.' }),
        }),
      ]),

      crear('p', {
        clase: 'campo__ayuda no-imprimir',
        estilo: 'margin-top:var(--e-4)',
        texto: 'Consejo: registra las rondas oficiales igual que una práctica (sección Prácticas) con el reto "Pista WRO RoboMission". '
          + 'Así el mejor tiempo y el mejor puntaje aparecen aquí solos.',
      }),
    );
  }

  /* ---------------- editor ---------------- */

  function abrirEditorWro(equipo) {
    // Doble comprobación: en modo consulta no se abre el editor.
    if (!permitirEdicion()) return;

    const campoEstado = crear('select', { id: 'wro-estado' });
    campoEstado.append(...ESTADOS_WRO.map((estado) => crear('option', {
      value: estado,
      texto: ETIQUETAS_WRO[estado] ?? estado,
      selected: (equipo.wro_estado ?? 'no_participa') === estado ? true : null,
    })));

    const campoCategoria = crear('input', {
      type: 'text', id: 'wro-categoria', maxlength: '60',
      value: equipo.categoria_wro ?? '', placeholder: 'Ej.: RoboMission Elementary',
    });

    const campoResultado = crear('input', {
      type: 'text', id: 'wro-resultado', maxlength: '120',
      value: equipo.wro_resultado ?? '', placeholder: 'Ej.: 3.er lugar nacional',
    });

    const campoNota = crear('textarea', {
      id: 'wro-nota', maxlength: '300', value: equipo.wro_nota ?? '',
      placeholder: 'Cómo les fue, qué aprendieron, qué viene para la próxima.',
    });

    const errorGeneral = crear('p', { clase: 'campo__error', role: 'alert' });

    const contenido = crear('form', {}, [
      crear('p', { clase: 'campo__ayuda', texto: `Equipo: ${equipo.nombre}` }),
      crear('div', { clase: 'campo' }, [
        crear('label', { for: 'wro-estado', texto: 'Estado de participación' }),
        campoEstado,
      ]),
      crear('div', { clase: 'campo' }, [
        crear('label', { for: 'wro-categoria', texto: 'Categoría' }),
        campoCategoria,
      ]),
      crear('div', { clase: 'campo' }, [
        crear('label', { for: 'wro-resultado', texto: 'Resultado' }),
        campoResultado,
      ]),
      crear('div', { clase: 'campo' }, [
        crear('label', { for: 'wro-nota', texto: 'Nota' }),
        campoNota,
      ]),
      errorGeneral,
    ]);

    const guardar = async () => {
      errorGeneral.textContent = '';
      try {
        await api.actualizarWro(equipo.id, {
          estado: campoEstado.value,
          categoria: campoCategoria.value,
          resultado: campoResultado.value,
          nota: campoNota.value,
        });
        avisoOk(`Participación de ${equipo.nombre} guardada.`);
        instanciaModal.cerrar();
        await cargar();
      } catch (error) {
        errorGeneral.textContent = mensajeDeError(error);
      }
    };

    const instanciaModal = modal({
      titulo: `Participación de ${equipo.nombre}`,
      contenido,
      pie: [
        crear('button', {
          clase: 'boton boton--fantasma', type: 'button', texto: 'Cancelar',
          onclick: () => instanciaModal.cerrar(),
        }),
        crear('button', {
          clase: 'boton boton--primario', type: 'button', texto: 'Guardar',
          onclick: guardar,
        }),
      ],
    });

    contenido.addEventListener('submit', (evento) => {
      evento.preventDefault();
      guardar();
    });
  }

  await cargar();

  return {
    destruir() { enPantalla = false; },
  };
}
