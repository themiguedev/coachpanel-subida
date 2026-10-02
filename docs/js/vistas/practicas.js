/**
 * vistas/practicas.js — Prácticas de pista.
 *
 * Se registra la fecha, el equipo, el intento, el reto, el tiempo en pista
 * (mm:ss.ms) y el puntaje. El tiempo es opcional: hay prácticas que solo se
 * puntúan.
 */

import {
  crear, limpiar, reemplazar, esqueletoFilas, estadoVacio, avisoOk, icono,
} from '../ui.js';
import { tabla, kpi, nombreEquipo } from '../componentes/ladrillo.js';
import {
  formatearDuracionCorta, formatearPuntaje, parsearDuracion, parsearPuntaje, fechaCorta, hoyISO, ErrorFormato,
} from '../formato.js';
import {
  resumirPracticas, rankingPorReto, siguienteIntento, compararTiempos, resumenParaMostrar,
} from '../estadisticas.js';
import { mensajeDeError } from '../api.js';

export async function renderPracticas(raiz, contexto) {
  const {
    api, cabecera, modal, confirmar, esCoach = () => true, permitirEdicion = () => true,
  } = contexto;

  /** ¿Esta modalidad puede registrar y editar prácticas? */
  const puedeEditar = () => esCoach();

  let practicas = [];
  let equipos = [];
  let retos = [];
  let equipoFiltro = '';
  let retoFiltro = '';
  let enPantalla = true;

  const contenedorResumen = crear('div');
  const contenedorTabla = crear('div', { 'aria-busy': 'true' }, [esqueletoFilas(6)]);

  raiz.append(cabecera({
    titulo: 'Prácticas de pista',
    descripcion: 'Tiempo en que el robot completa la pista y puntaje obtenido. Menos tiempo y más puntaje es mejor.',
    acciones: puedeEditar()
      ? [
        crear('button', {
          clase: 'boton boton--primario',
          type: 'button',
          onclick: () => abrirFormulario(null),
        }, [
          crear('span', { html: icono('mas', { tamano: 16, clase: 'boton__icono' }) }),
          crear('span', { texto: 'Registrar práctica' }),
        ]),
      ]
      : [],
  }));

  /* ---------------- filtros ---------------- */

  const selectorEquipo = crear('select', {
    'aria-label': 'Filtrar por equipo',
    onchange: (evento) => {
      equipoFiltro = evento.target.value;
      cargar();
    },
  });

  const selectorReto = crear('select', {
    'aria-label': 'Filtrar por reto',
    onchange: (evento) => {
      retoFiltro = evento.target.value;
      cargar();
    },
  });

  raiz.append(
    contenedorResumen,
    crear('div', { clase: 'barra-busqueda no-imprimir' }, [
      crear('label', { clase: 'campo__ayuda', for: 'filtro-equipo', texto: 'Equipo:' }),
      selectorEquipo,
      crear('label', { clase: 'campo__ayuda', for: 'filtro-reto', texto: 'Reto:' }),
      selectorReto,
      crear('button', {
        clase: 'boton boton--sm boton--fantasma',
        type: 'button',
        texto: 'Ver ranking por reto',
        onclick: abrirRanking,
      }),
      crear('button', {
        clase: 'boton boton--sm boton--fantasma',
        type: 'button',
        texto: 'Imprimir',
        onclick: () => window.print(),
      }),
    ]),
    contenedorTabla,
  );

  /* ---------------- carga ---------------- */

  async function cargar() {
    limpiar(contenedorTabla);
    contenedorTabla.setAttribute('aria-busy', 'true');
    contenedorTabla.append(esqueletoFilas(6));

    try {
      const [resPracticas, resEquipos, resRetos] = await Promise.all([
        api.listarPracticas({
          equipoId: equipoFiltro || null,
          retoId: retoFiltro || null,
          porPagina: 80,
        }),
        equipos.length ? Promise.resolve({ datos: equipos }) : api.listarEquipos({ incluirInactivos: true }),
        retos.length ? Promise.resolve({ datos: retos }) : api.listarRetos(),
      ]);

      practicas = resPracticas.datos ?? [];
      equipos = resEquipos.datos ?? [];
      retos = resRetos.datos ?? [];

      if (!enPantalla) return;
      pintarFiltros();
      pintarResumen();
      pintarTabla();
    } catch (error) {
      if (!enPantalla) return;
      contenedorTabla.removeAttribute('aria-busy');
      reemplazar(contenedorTabla, estadoVacio({
        titulo: 'No se pudieron cargar las prácticas',
        texto: mensajeDeError(error),
        iconoNombre: 'practicas',
        accion: crear('button', { clase: 'boton boton--primario', type: 'button', texto: 'Reintentar', onclick: cargar }),
      }));
    }
  }

  function pintarFiltros() {
    limpiar(selectorEquipo);
    selectorEquipo.append(
      crear('option', { value: '', texto: 'Todos los equipos' }),
      ...equipos.map((equipo) => crear('option', {
        value: String(equipo.id), texto: equipo.nombre,
        selected: String(equipoFiltro) === String(equipo.id) ? true : null,
      })),
    );

    limpiar(selectorReto);
    selectorReto.append(
      crear('option', { value: '', texto: 'Todos los retos' }),
      ...retos.map((reto) => crear('option', {
        value: String(reto.id), texto: reto.nombre,
        selected: String(retoFiltro) === String(reto.id) ? true : null,
      })),
    );
  }

  function nombreReto(practica) {
    return practica.retos?.nombre ?? 'Sin reto';
  }

  function pintarResumen() {
    limpiar(contenedorResumen);

    if (practicas.length === 0) return;

    const resumen = resumirPracticas(practicas);
    const mostrar = resumenParaMostrar(resumen);

    // Mejor tiempo y mejor puntaje del conjunto filtrado.
    const mejores = practicas.reduce((acumulado, practica) => {
      if (practica.duracion_ms !== null && practica.duracion_ms !== undefined) {
        if (acumulado.tiempo === null || Number(practica.duracion_ms) < acumulado.tiempo) {
          acumulado.tiempo = Number(practica.duracion_ms);
          acumulado.practicaTiempo = practica;
        }
      }
      if (acumulado.puntaje === null || Number(practica.puntaje) > acumulado.puntaje) {
        acumulado.puntaje = Number(practica.puntaje);
        acumulado.practicaPuntaje = practica;
      }
      return acumulado;
    }, { tiempo: null, puntaje: null, practicaTiempo: null, practicaPuntaje: null });

    contenedorResumen.replaceChildren(crear('div', {
      clase: 'rejilla rejilla--kpi no-imprimir', estilo: 'margin-bottom:var(--e-5)',
    }, [
      kpi({
        etiqueta: 'Prácticas registradas',
        valor: mostrar.cantidad,
        detalle: `${resumen.conTiempo} con tiempo`,
        iconoNombre: 'practicas',
      }),
      kpi({
        etiqueta: 'Mejor tiempo',
        valor: formatearDuracionCorta(mejores.tiempo),
        detalle: mejores.practicaTiempo
          ? `${mejores.practicaTiempo.equipos?.nombre ?? 'Equipo'} · ${fechaCorta(mejores.practicaTiempo.fecha)}`
          : 'Ninguna práctica con tiempo',
        color: 'var(--verde)',
        iconoNombre: 'reloj',
      }),
      kpi({
        etiqueta: 'Mejor puntaje',
        valor: formatearPuntaje(mejores.puntaje),
        detalle: mejores.practicaPuntaje
          ? `${mejores.practicaPuntaje.equipos?.nombre ?? 'Equipo'} · ${fechaCorta(mejores.practicaPuntaje.fecha)}`
          : '—',
        color: 'var(--ambar)',
        iconoNombre: 'trofeo',
      }),
      kpi({
        etiqueta: 'Mediana de puntaje',
        valor: mostrar.medianaPuntaje,
        detalle: `Promedio: ${mostrar.promedioPuntaje}`,
        color: 'var(--violeta)',
        iconoNombre: 'panel',
      }),
    ]));
  }

  function pintarTabla() {
    reemplazar(contenedorTabla);
    contenedorTabla.removeAttribute('aria-busy');

    if (practicas.length === 0) {
      contenedorTabla.append(estadoVacio({
        titulo: equipos.length ? 'Todavía no hay prácticas registradas' : 'Todavía no hay equipos',
        texto: !puedeEditar()
          ? 'Cuando el coach registre los intentos de pista, aquí verás los tiempos y los puntajes.'
          : (equipos.length
            ? 'Registra la primera práctica de pista: el tiempo y el puntaje que obtuvo el robot.'
            : 'Las prácticas se registran por equipo. Crea uno en la sección Equipos y vuelve aquí.'),
        iconoNombre: 'practicas',
        accion: !puedeEditar()
          ? null
          : (equipos.length
            ? crear('button', {
              clase: 'boton boton--primario', type: 'button', texto: 'Registrar práctica',
              onclick: () => abrirFormulario(null),
            })
            : crear('a', { clase: 'boton boton--primario', href: '#/equipos', texto: 'Ir a Equipos' })),
      }));
      return;
    }

    // Evolución por equipo: para marcar si cada práctica mejoró la anterior.
    const porEquipo = new Map();
    [...practicas].forEach((practica) => {
      const id = Number(practica.equipo_id);
      if (!porEquipo.has(id)) porEquipo.set(id, []);
      porEquipo.get(id).push(practica);
    });

    contenedorTabla.append(tabla({
      titulo: 'Prácticas registradas, de la más reciente a la más antigua',
      filas: practicas,
      columnas: [
        { clave: 'fecha', etiqueta: 'Fecha', celda: (fila) => fechaCorta(fila.fecha) },
        {
          clave: 'equipo',
          etiqueta: 'Equipo',
          celda: (fila) => nombreEquipo(fila.equipos ?? { id: fila.equipo_id, nombre: `Equipo ${fila.equipo_id}` }),
        },
        { clave: 'reto', etiqueta: 'Reto', celda: (fila) => nombreReto(fila) },
        { clave: 'intento', etiqueta: 'Intento', alinear: 'centro', celda: (fila) => `#${fila.intento}` },
        {
          clave: 'duracion_ms',
          etiqueta: 'Tiempo',
          alinear: 'derecha',
          numeros: true,
          celda: (fila) => {
            if (fila.duracion_ms === null || fila.duracion_ms === undefined) {
              return crear('span', { clase: 'campo__ayuda', texto: '—' });
            }

            // Compara con la práctica anterior del mismo equipo y reto.
            const hermanas = (porEquipo.get(Number(fila.equipo_id)) ?? [])
              .filter((p) => p.reto_id === fila.reto_id && p.duracion_ms !== null)
              .sort((a, b) => {
                const comparacion = String(a.fecha).localeCompare(String(b.fecha));
                return comparacion !== 0 ? comparacion : Number(a.intento) - Number(b.intento);
              });

            const posicion = hermanas.findIndex((p) => p.id === fila.id);
            const anterior = posicion > 0 ? hermanas[posicion - 1] : null;
            const comparacion = anterior ? compararTiempos(fila.duracion_ms, anterior.duracion_ms) : null;

            return crear('span', {
              titulo: comparacion ? `${comparacion.texto} que el intento anterior` : '',
              estilo: 'display:inline-flex;align-items:center;gap:.4rem;justify-content:flex-end',
            }, [
              crear('strong', { texto: formatearDuracionCorta(fila.duracion_ms) }),
              comparacion && !comparacion.empate
                ? crear('span', {
                  estilo: { color: comparacion.mejora ? 'var(--verde)' : 'var(--rojo)', fontSize: 'var(--tam-xs)' },
                  texto: comparacion.mejora ? '▲' : '▼',
                })
                : null,
            ]);
          },
        },
        {
          clave: 'puntaje',
          etiqueta: 'Puntaje',
          alinear: 'derecha',
          numeros: true,
          celda: (fila) => crear('strong', {
            estilo: { color: Number(fila.puntaje) === 0 ? 'var(--texto-apagado)' : 'var(--ambar)' },
            texto: formatearPuntaje(fila.puntaje),
          }),
        },
        {
          clave: 'observaciones',
          etiqueta: 'Observaciones',
          celda: (fila) => crear('span', {
            clase: 'campo__ayuda',
            texto: fila.observaciones ?? '—',
            title: fila.observaciones ?? '',
          }),
        },
        {
          clave: 'acciones',
          etiqueta: '',
          alinear: 'derecha',
          celda: (fila) => (puedeEditar()
            ? crear('div', { clase: 'acciones' }, [
              crear('button', {
                clase: 'boton boton--sm boton--fantasma',
                type: 'button',
                texto: 'Editar',
                'aria-label': `Editar la práctica del ${fechaCorta(fila.fecha)}`,
                onclick: () => abrirFormulario(fila),
              }),
            ])
            : crear('span', { clase: 'campo__ayuda', texto: '—' })),
        },
      ],
    }));
  }

  /* ---------------- formulario ---------------- */

  function abrirFormulario(practica) {
    // Doble comprobación: en modo consulta no se abre el formulario.
    if (!permitirEdicion()) return;

    const editando = Boolean(practica);

    const campoFecha = crear('input', { type: 'date', id: 'practica-fecha', value: practica?.fecha ?? hoyISO(), required: true });
    const campoEquipo = crear('select', { id: 'practica-equipo', required: true });
    const campoReto = crear('select', { id: 'practica-reto' });
    const campoIntento = crear('input', { type: 'number', id: 'practica-intento', min: '1', max: '99', value: String(practica?.intento ?? 1) });
    const campoTiempo = crear('input', {
      type: 'text', id: 'practica-tiempo', inputmode: 'decimal', placeholder: '1:23.45',
      value: practica?.duracion_ms !== null && practica?.duracion_ms !== undefined
        ? formatearDuracionCorta(practica.duracion_ms)
        : '',
      autocomplete: 'off',
    });
    const campoPuntaje = crear('input', {
      type: 'text', id: 'practica-puntaje', inputmode: 'numeric', placeholder: '250', required: true,
      value: practica ? String(practica.puntaje) : '',
    });
    const campoObservaciones = crear('textarea', { id: 'practica-observaciones', maxlength: '300', value: practica?.observaciones ?? '' });

    const ayudaTiempo = crear('span', { clase: 'campo__ayuda', texto: 'Escríbelo como 1:23.45 (minutos:segundos) o 83.45 (segundos). Déjalo vacío si no se tomó tiempo.' });
    const errorGeneral = crear('p', { clase: 'campo__error', role: 'alert' });

    // Equipos y retos en los selectores.
    campoEquipo.append(
      crear('option', { value: '', texto: '— Elegir equipo —' }),
      ...equipos.map((equipo) => crear('option', {
        value: String(equipo.id), texto: equipo.nombre,
        selected: String(practica?.equipo_id ?? '') === String(equipo.id) ? true : null,
      })),
    );

    campoReto.append(
      crear('option', { value: '', texto: 'Sin reto' }),
      ...retos.map((reto) => crear('option', {
        value: String(reto.id), texto: reto.nombre,
        selected: String(practica?.reto_id ?? '') === String(reto.id) ? true : null,
      })),
    );

    // Vista previa en vivo del tiempo y del puntaje.
    const vistaTiempo = crear('span', { clase: 'campo__ayuda' });

    campoTiempo.addEventListener('input', () => {
      try {
        const ms = parsearDuracion(campoTiempo.value);
        campoTiempo.setAttribute('aria-invalid', 'false');
        vistaTiempo.textContent = ms === null
          ? ''
          : `Se guardará como ${formatearDuracionCorta(ms)} (${ms} ms)`;
      } catch (error) {
        campoTiempo.setAttribute('aria-invalid', 'true');
        vistaTiempo.textContent = error.message;
      }
    });

    // Sugerir el intento siguiente al elegir equipo y fecha.
    const sugerirIntento = () => {
      if (editando) return;
      const equipoId = Number(campoEquipo.value);
      if (!Number.isFinite(equipoId) || equipoId <= 0) return;
      const siguiente = siguienteIntento(practicas, equipoId, campoFecha.value);
      campoIntento.value = String(siguiente);
    };
    campoEquipo.addEventListener('change', sugerirIntento);
    campoFecha.addEventListener('change', sugerirIntento);

    const contenido = crear('form', {}, [
      crear('div', { clase: 'rejilla rejilla--2' }, [
        crear('div', { clase: 'campo' }, [
          crear('label', { for: 'practica-fecha', texto: 'Fecha *' }),
          campoFecha,
        ]),
        crear('div', { clase: 'campo' }, [
          crear('label', { for: 'practica-equipo', texto: 'Equipo *' }),
          campoEquipo,
        ]),
      ]),
      crear('div', { clase: 'rejilla rejilla--2' }, [
        crear('div', { clase: 'campo' }, [
          crear('label', { for: 'practica-reto', texto: 'Reto o pista' }),
          campoReto,
        ]),
        crear('div', { clase: 'campo campo--numero' }, [
          crear('label', { for: 'practica-intento', texto: 'Intento' }),
          campoIntento,
          crear('span', { clase: 'campo__ayuda', texto: 'Número de intento del día.' }),
        ]),
      ]),
      crear('div', { clase: 'rejilla rejilla--2' }, [
        crear('div', { clase: 'campo campo--numero' }, [
          crear('label', { for: 'practica-tiempo', texto: 'Tiempo en pista' }),
          campoTiempo,
          ayudaTiempo,
          vistaTiempo,
        ]),
        crear('div', { clase: 'campo campo--numero' }, [
          crear('label', { for: 'practica-puntaje', texto: 'Puntaje *' }),
          campoPuntaje,
          crear('span', { clase: 'campo__ayuda', texto: 'Puntos que obtuvo el robot en la mesa.' }),
        ]),
      ]),
      crear('div', { clase: 'campo' }, [
        crear('label', { for: 'practica-observaciones', texto: 'Observaciones' }),
        campoObservaciones,
        crear('span', { clase: 'campo__ayuda', texto: 'Qué falló, qué mejoró, qué se va a ajustar.' }),
      ]),
      errorGeneral,
      editando
        ? crear('div', { estilo: 'margin-top:var(--e-4)' }, [
          crear('button', {
            clase: 'boton boton--sm boton--peligro',
            type: 'button',
            texto: 'Eliminar esta práctica',
            onclick: async () => {
              const seguro = await confirmar({
                titulo: '¿Eliminar esta práctica?',
                mensaje: 'Se borra solo este registro de práctica. El resto del historial no se toca.',
                textoConfirmar: 'Eliminar',
                peligro: true,
              });
              if (!seguro) return;
              try {
                await api.borrarPractica(practica.id);
                avisoOk('Práctica eliminada.');
                instanciaModal.cerrar();
                await cargar();
              } catch (error) {
                errorGeneral.textContent = mensajeDeError(error);
              }
            },
          }),
        ])
        : null,
    ]);

    const guardar = async () => {
      errorGeneral.textContent = '';

      let duracionMs = null;
      try {
        duracionMs = parsearDuracion(campoTiempo.value);
      } catch (error) {
        if (error instanceof ErrorFormato) {
          campoTiempo.setAttribute('aria-invalid', 'true');
          errorGeneral.textContent = error.message;
          campoTiempo.focus();
          return;
        }
        throw error;
      }

      let puntaje;
      try {
        puntaje = parsearPuntaje(campoPuntaje.value);
      } catch (error) {
        campoPuntaje.setAttribute('aria-invalid', 'true');
        errorGeneral.textContent = error.message;
        campoPuntaje.focus();
        return;
      }

      if (!campoEquipo.value) {
        errorGeneral.textContent = 'Elige el equipo que hizo la práctica.';
        campoEquipo.focus();
        return;
      }

      const datos = {
        fecha: campoFecha.value,
        equipoId: Number(campoEquipo.value),
        retoId: campoReto.value ? Number(campoReto.value) : null,
        intento: Number(campoIntento.value),
        duracionMs,
        puntaje,
        observaciones: campoObservaciones.value,
      };

      try {
        if (editando) {
          await api.actualizarPractica(practica.id, datos);
          avisoOk('Práctica actualizada.');
        } else {
          await api.crearPractica(datos);
          const equipo = equipos.find((e) => Number(e.id) === datos.equipoId);
          avisoOk(`Práctica registrada para ${equipo?.nombre ?? 'el equipo'}.`);
        }
        instanciaModal.cerrar();
        await cargar();
      } catch (error) {
        errorGeneral.textContent = mensajeDeError(error);
      }
    };

    const instanciaModal = modal({
      titulo: editando ? 'Editar práctica' : 'Registrar práctica de pista',
      contenido,
      ancho: true,
      pie: [
        crear('button', {
          clase: 'boton boton--fantasma', type: 'button', texto: 'Cancelar',
          onclick: () => instanciaModal.cerrar(),
        }),
        crear('button', {
          clase: 'boton boton--primario', type: 'button',
          texto: editando ? 'Guardar cambios' : 'Registrar',
          onclick: guardar,
        }),
      ],
    });

    contenido.addEventListener('submit', (evento) => {
      evento.preventDefault();
      guardar();
    });
  }

  /* ---------------- ranking por reto ---------------- */

  function abrirRanking() {
    const ranking = rankingPorReto(practicas, retos, equipos);

    const contenido = ranking.length
      ? tabla({
        titulo: 'Ranking por reto y equipo',
        filas: ranking,
        columnas: [
          { clave: 'reto', etiqueta: 'Reto' },
          { clave: 'equipo', etiqueta: 'Equipo', celda: (fila) => nombreEquipo(fila) },
          { clave: 'intentos', etiqueta: 'Intentos', alinear: 'centro', numeros: true },
          {
            clave: 'mejorDuracionMs',
            etiqueta: 'Mejor tiempo',
            alinear: 'derecha',
            numeros: true,
            celda: (fila) => formatearDuracionCorta(fila.mejorDuracionMs),
          },
          {
            clave: 'medianaDuracionMs',
            etiqueta: 'Mediana tiempo',
            alinear: 'derecha',
            numeros: true,
            celda: (fila) => formatearDuracionCorta(fila.medianaDuracionMs),
          },
          {
            clave: 'mejorPuntaje',
            etiqueta: 'Mejor puntaje',
            alinear: 'derecha',
            numeros: true,
            celda: (fila) => formatearPuntaje(fila.mejorPuntaje),
          },
          {
            clave: 'medianaPuntaje',
            etiqueta: 'Mediana puntaje',
            alinear: 'derecha',
            numeros: true,
            celda: (fila) => formatearPuntaje(fila.medianaPuntaje),
          },
        ],
      })
      : estadoVacio({
        titulo: 'Todavía no hay datos para el ranking',
        texto: 'Registra algunas prácticas y aquí verás cómo va cada equipo en cada pista.',
        iconoNombre: 'trofeo',
      });

    const instanciaModal = modal({
      titulo: 'Ranking por reto',
      contenido: crear('div', {}, [
        crear('p', {
          clase: 'campo__ayuda',
          texto: 'La mediana refleja mejor el nivel real del equipo que el promedio: un intento fallido no la hunde.',
        }),
        contenido,
      ]),
      ancho: true,
      pie: [
        crear('button', {
          clase: 'boton boton--fantasma', type: 'button', texto: 'Cerrar',
          onclick: () => instanciaModal.cerrar(),
        }),
      ],
    });
  }

  await cargar();

  return {
    destruir() { enPantalla = false; },
  };
}
