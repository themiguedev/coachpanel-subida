/**
 * vistas/asistencia.js — Tomar y revisar la asistencia de las clases vespertinas.
 *
 * Dos pestañas:
 *   · Tomar asistencia: se elige la fecha (hoy por defecto) y se marca a cada
 *     estudiante con un toque. Se guarda todo en un solo lote.
 *   · Historial: porcentaje por estudiante y por mes, y lista de clases.
 *
 * Cuando la sesión se cierra, deja de aceptar cambios: es la forma de evitar
 * que alguien modifique una clase ya revisada.
 */

import {
  crear, limpiar, reemplazar, esqueletoFilas, estadoVacio, avisoOk, avisoError, icono, confirmar, descargar, aCsv,
} from '../ui.js';
import {
  filaAsistencia, contadoresAsistencia, porcentajeAsistencia, insignia, tabla,
} from '../componentes/ladrillo.js';
import {
  contarEstados, calcularPorcentaje, agruparPorMes, desdeVistaAsistencia, marcarTodos, limpiarMarcas, calcularRacha,
} from '../asistencia.js';
import {
  fechaLarga, fechaMedia, hora12, hoyISO, claveMes, nombreMes, ultimosMeses, plural,
} from '../formato.js';
import { mensajeDeError } from '../api.js';

export async function renderAsistencia(raiz, contexto) {
  const { api, cabecera, modal, CONFIG } = contexto;

  let pestana = 'tomar';
  let fecha = hoyISO();
  let sesion = null;
  let lista = [];
  let registros = [];
  let estudiantes = [];
  let sesiones = [];
  let mesHistorial = claveMes(hoyISO());
  let vistaPorEstudiante = [];
  let cambiosSinGuardar = false;
  let enPantalla = true;

  const panelTomar = crear('div');
  const panelHistorial = crear('div');

  /* ---------------- encabezado y pestañas ---------------- */

  const botonTomar = crear('button', {
    clase: 'pestana', type: 'button', role: 'tab', id: 'pestana-tomar',
    'aria-selected': 'true', 'aria-controls': 'panel-tomar',
    onclick: () => cambiarPestana('tomar'),
  }, [crear('span', { texto: 'Tomar asistencia' })]);

  const botonHistorial = crear('button', {
    clase: 'pestana', type: 'button', role: 'tab', id: 'pestana-historial',
    'aria-selected': 'false', 'aria-controls': 'panel-historial',
    onclick: () => cambiarPestana('historial'),
  }, [crear('span', { texto: 'Historial y porcentajes' })]);

  panelTomar.id = 'panel-tomar';
  panelTomar.setAttribute('role', 'tabpanel');
  panelTomar.setAttribute('aria-labelledby', 'pestana-tomar');
  panelHistorial.id = 'panel-historial';
  panelHistorial.setAttribute('role', 'tabpanel');
  panelHistorial.setAttribute('aria-labelledby', 'pestana-historial');
  panelHistorial.hidden = true;

  raiz.append(cabecera({
    titulo: 'Asistencia',
    descripcion: 'Clases vespertinas de robótica. Un toque en el estado de cada estudiante y se guarda todo junto.',
    acciones: [
      crear('button', {
        clase: 'boton boton--fantasma',
        type: 'button',
        onclick: imprimirLista,
      }, [
        crear('span', { html: icono('imprimir', { tamano: 16, clase: 'boton__icono' }) }),
        crear('span', { texto: 'Imprimir lista' }),
      ]),
    ],
  }));

  raiz.append(
    crear('div', { clase: 'pestanas', role: 'tablist', 'aria-label': 'Secciones de asistencia' }, [
      botonTomar, botonHistorial,
    ]),
    panelTomar,
    panelHistorial,
  );

  function cambiarPestana(nueva) {
    if (nueva === 'tomar' && cambiosSinGuardar) {
      confirmar({
        titulo: 'Tienes cambios sin guardar',
        mensaje: 'Si sales ahora, se perderán las marcas que hiciste. ¿Quieres salir igual?',
        textoConfirmar: 'Salir sin guardar',
        peligro: true,
      }).then((salir) => {
        if (salir) {
          cambiosSinGuardar = false;
          cambiarPestana('historial');
        }
      });
      return;
    }

    pestana = nueva;
    botonTomar.setAttribute('aria-selected', nueva === 'tomar' ? 'true' : 'false');
    botonHistorial.setAttribute('aria-selected', nueva === 'historial' ? 'true' : 'false');
    panelTomar.hidden = nueva !== 'tomar';
    panelHistorial.hidden = nueva !== 'historial';

    if (nueva === 'historial') cargarHistorial();
  }

  /* ================================================================
   * PESTAÑA 1: TOMAR ASISTENCIA
   * ================================================================ */

  const selectorFecha = crear('input', {
    type: 'date', id: 'asistencia-fecha', value: fecha, max: hoyISO(),
    onchange: (evento) => {
      if (!evento.target.value) return;
      const cargarConFecha = () => {
        fecha = evento.target.value;
        cambiosSinGuardar = false;
        cargar();
      };
      if (cambiosSinGuardar) {
        confirmar({
          titulo: 'Tienes cambios sin guardar',
          mensaje: 'Si cambias de fecha ahora, se perderán las marcas que hiciste.',
          textoConfirmar: 'Cambiar de fecha',
          peligro: true,
        }).then((cambiar) => {
          if (cambiar) cargarConFecha();
          else selectorFecha.value = fecha;
        });
      } else {
        cargarConFecha();
      }
    },
  });

  const botonHoy = crear('button', {
    clase: 'boton boton--sm boton--fantasma',
    type: 'button',
    texto: 'Hoy',
    onclick: () => {
      if (fecha === hoyISO()) return;
      cambiosSinGuardar = false;
      fecha = hoyISO();
      selectorFecha.value = fecha;
      cargar();
    },
  });

  const contenedorSesion = crear('div');
  const contenedorLista = crear('div', { 'aria-busy': 'true' }, [esqueletoFilas(6)]);
  const contenedorBarra = crear('div');

  panelTomar.append(
    crear('div', { clase: 'barra-busqueda' }, [
      crear('label', { clase: 'etiqueta', for: 'asistencia-fecha', texto: 'Fecha de la clase:' }),
      selectorFecha,
      botonHoy,
    ]),
    contenedorSesion,
    contenedorLista,
    contenedorBarra,
  );

  /* ---------------- carga de la sesión ---------------- */

  async function cargar() {
    limpiar(contenedorLista);
    contenedorLista.setAttribute('aria-busy', 'true');
    contenedorLista.append(esqueletoFilas(6));
    limpiar(contenedorBarra);
    limpiar(contenedorSesion);

    try {
      const resultado = await api.listaAsistencia({ fecha });
      sesion = resultado.sesion;
      lista = resultado.lista;
      registros = resultado.registros;
      estudiantes = resultado.estudiantes;

      // Si el día no tenía sesión, se buscó/creó: se avisa una sola vez.
      const seCreo = String(sesion?.fecha) === fecha;
      if (seCreo && registros.length === 0) {
        // No se avisa nada: crear la sesión del día es la acción esperada.
      }

      if (!enPantalla) return;
      pintarSesion();
      pintarLista();
      pintarBarra();
    } catch (error) {
      if (!enPantalla) return;
      contenedorLista.removeAttribute('aria-busy');
      reemplazar(contenedorLista, estadoVacio({
        titulo: 'No se pudo abrir la asistencia de ese día',
        texto: mensajeDeError(error),
        iconoNombre: 'asistencia',
        accion: crear('button', {
          clase: 'boton boton--primario', type: 'button', texto: 'Reintentar', onclick: cargar,
        }),
      }));
    }
  }

  /* ---------------- sesión ---------------- */

  function pintarSesion() {
    limpiar(contenedorSesion);
    if (!sesion) return;

    const cerrada = sesion.estado === 'cerrada';

    contenedorSesion.append(crear('section', {
      clase: 'tarjeta tarjeta--studs',
      estilo: 'margin-bottom:var(--e-4)',
    }, [
      crear('div', { clase: 'tarjeta__titulo' }, [
        crear('div', {}, [
          crear('h2', { texto: fechaLarga(sesion.fecha) }),
          crear('span', {
            clase: 'campo__ayuda',
            texto: [
              sesion.hora_inicio ? `Desde ${hora12(sesion.hora_inicio)}` : null,
              sesion.hora_fin ? `hasta ${hora12(sesion.hora_fin)}` : null,
              sesion.titulo ?? null,
            ].filter(Boolean).join(' · ') || 'Sin horario definido',
          }),
        ]),
        crear('div', { clase: 'acciones' }, [
          cerrada ? insignia('no_participa', 'Sesión cerrada') : insignia('presente', 'Sesión abierta'),
          crear('button', {
            clase: 'boton boton--sm boton--fantasma',
            type: 'button',
            texto: 'Editar datos de la clase',
            onclick: abrirEditorSesion,
          }),
        ]),
      ]),
      cerrada
        ? crear('p', {
          clase: 'campo__ayuda',
          texto: 'La sesión está cerrada: la asistencia no se puede cambiar hasta reabrirla. '
            + 'Es útil para dar una clase por revisada.',
        })
        : null,
    ]));
  }

  function abrirEditorSesion() {
    const campoHoraInicio = crear('input', {
      type: 'time', id: 'sesion-inicio', value: sesion?.hora_inicio?.slice(0, 5) ?? '14:00',
    });
    const campoHoraFin = crear('input', {
      type: 'time', id: 'sesion-fin', value: sesion?.hora_fin?.slice(0, 5) ?? '16:00',
    });
    const campoTitulo = crear('input', {
      type: 'text', id: 'sesion-titulo', maxlength: '80',
      value: sesion?.titulo ?? '', placeholder: 'Ej.: Armado del chasis',
    });
    const campoNota = crear('textarea', {
      id: 'sesion-nota', maxlength: '300', value: sesion?.nota ?? '',
    });
    const errorGeneral = crear('p', { clase: 'campo__error', role: 'alert' });

    const contenido = crear('form', {}, [
      crear('div', { clase: 'rejilla rejilla--2' }, [
        crear('div', { clase: 'campo' }, [
          crear('label', { for: 'sesion-inicio', texto: 'Hora de inicio' }),
          campoHoraInicio,
        ]),
        crear('div', { clase: 'campo' }, [
          crear('label', { for: 'sesion-fin', texto: 'Hora de fin' }),
          campoHoraFin,
        ]),
      ]),
      crear('div', { clase: 'campo' }, [
        crear('label', { for: 'sesion-titulo', texto: 'Tema de la clase' }),
        campoTitulo,
      ]),
      crear('div', { clase: 'campo' }, [
        crear('label', { for: 'sesion-nota', texto: 'Nota' }),
        campoNota,
      ]),
      crear('label', { clase: 'interruptor' }, [
        crear('input', {
          type: 'checkbox',
          checked: sesion?.estado === 'cerrada',
          id: 'sesion-cerrar',
        }),
        crear('span', { texto: 'Cerrar la sesión (no permitir más cambios de asistencia)' }),
      ]),
      errorGeneral,
    ]);

    const guardar = async () => {
      errorGeneral.textContent = '';
      const cerrar = contenido.querySelector('#sesion-cerrar').checked;
      try {
        await api.actualizarSesion(sesion.id, {
          horaInicio: campoHoraInicio.value,
          horaFin: campoHoraFin.value,
          titulo: campoTitulo.value,
          nota: campoNota.value,
          estado: cerrar ? 'cerrada' : 'abierta',
        });
        avisoOk(cerrar ? 'Sesión guardada y cerrada.' : 'Datos de la clase guardados.');
        instanciaModal.cerrar();
        await cargar();
      } catch (error) {
        errorGeneral.textContent = mensajeDeError(error);
      }
    };

    const instanciaModal = modal({
      titulo: 'Datos de la clase',
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

  /* ---------------- lista para marcar ---------------- */

  function pintarLista() {
    reemplazar(contenedorLista);
    contenedorLista.removeAttribute('aria-busy');

    if (lista.length === 0) {
      contenedorLista.append(estadoVacio({
        titulo: 'No hay estudiantes activos',
        texto: 'Agrega a los niños y niñas del club para poder tomar asistencia.',
        iconoNombre: 'estudiantes',
        accion: crear('a', { clase: 'boton boton--primario', href: '#/estudiantes', texto: 'Ir a Estudiantes' }),
      }));
      return;
    }

    const cerrada = sesion?.estado === 'cerrada';

    const filas = lista.map((estudiante) => filaAsistencia(
      estudiante,
      estudiante.estado,
      (estudianteId, estado) => {
        if (cerrada) {
          avisoError('La sesión está cerrada. Reábrela para cambiar la asistencia.');
          return;
        }
        const actual = lista.find((f) => f.estudianteId === estudianteId);
        const nuevo = actual?.estado === estado ? null : estado;
        lista = lista.map((fila) => (
          fila.estudianteId === estudianteId ? { ...fila, estado: nuevo } : fila
        ));
        cambiosSinGuardar = true;
        actualizarFila(estudianteId, nuevo);
        pintarBarra();
      },
    ));

    contenedorLista.append(
      crear('div', { clase: 'lista-asistencia' }, filas),
    );
  }

  /** Actualiza solo la fila tocada, sin repintar toda la lista (se siente rápido). */
  function actualizarFila(estudianteId, estado) {
    const fila = contenedorLista.querySelector(`.fila-asistencia[data-estudiante="${estudianteId}"]`);
    if (!fila) return;
    fila.dataset.estado = estado ?? '';
    fila.querySelectorAll('.boton-estado').forEach((boton) => {
      boton.setAttribute('aria-pressed', boton.dataset.estado === estado ? 'true' : 'false');
    });
  }

  /* ---------------- barra de resumen y guardado ---------------- */

  function pintarBarra() {
    reemplazar(contenedorBarra);

    const conteo = contarEstados(lista);
    const cerrada = sesion?.estado === 'cerrada';
    const botonGuardar = crear('button', {
      clase: 'boton boton--primario',
      type: 'button',
      texto: cambiosSinGuardar ? 'Guardar asistencia *' : 'Guardar asistencia',
      disabled: cerrada,
      onclick: guardar,
    });

    contenedorBarra.append(crear('div', { clase: 'barra-resumen no-imprimir' }, [
      contadoresAsistencia(conteo),
      crear('div', { clase: 'acciones' }, [
        crear('button', {
          clase: 'boton boton--sm boton--fantasma',
          type: 'button',
          texto: 'Marcar todos presentes',
          disabled: cerrada,
          onclick: () => {
            lista = marcarTodos(lista, 'presente');
            cambiosSinGuardar = true;
            pintarLista();
            pintarBarra();
          },
        }),
        crear('button', {
          clase: 'boton boton--sm boton--fantasma',
          type: 'button',
          texto: 'Limpiar marcas',
          disabled: cerrada,
          onclick: () => {
            lista = limpiarMarcas(lista);
            cambiosSinGuardar = true;
            pintarLista();
            pintarBarra();
          },
        }),
        botonGuardar,
      ]),
    ]));
  }

  async function guardar() {
    if (!sesion) return;

    try {
      await api.guardarAsistencia(lista, {
        sesion,
        registradoPor: CONFIG?.NOMBRE_CLUB ? null : null,
      });

      cambiosSinGuardar = false;
      const marcados = lista.filter((f) => f.estado).length;
      avisoOk(`Asistencia guardada: ${plural(marcados, 'estudiante marcado', 'estudiantes marcados')}.`);
      registros = await api.listaAsistencia({ sesionId: sesion.id }).then((r) => r.registros);
      pintarBarra();
    } catch (error) {
      avisoError(mensajeDeError(error));
    }
  }

  async function imprimirLista() {
    if (!lista.length) return;
    window.print();
  }

  /* ================================================================
   * PESTAÑA 2: HISTORIAL
   * ================================================================ */

  const selectorMes = crear('select', {
    'aria-label': 'Mes del historial',
    onchange: (evento) => {
      mesHistorial = evento.target.value;
      cargarHistorial();
    },
  });

  const contenedorHistorial = crear('div');

  panelHistorial.append(
    crear('div', { clase: 'barra-busqueda' }, [
      crear('label', { clase: 'etiqueta', for: 'mes-historial', texto: 'Mes:' }),
      selectorMes,
      crear('button', {
        clase: 'boton boton--sm boton--fantasma',
        type: 'button',
        texto: 'Descargar CSV',
        onclick: exportarHistorial,
      }),
    ]),
    contenedorHistorial,
  );

  function llenarMeses() {
    limpiar(selectorMes);
    ultimosMeses(12).reverse().forEach((clave) => {
      selectorMes.append(crear('option', {
        value: clave, texto: nombreMes(clave),
        selected: clave === mesHistorial ? true : null,
      }));
    });
  }

  async function cargarHistorial() {
    limpiar(contenedorHistorial);
    contenedorHistorial.setAttribute('aria-busy', 'true');
    contenedorHistorial.append(esqueletoFilas(6));
    llenarMeses();

    try {
      const [resVista, resSesiones, resAsistencia] = await Promise.all([
        api.vistaAsistenciaEstudiantes(),
        api.listarSesiones({ limite: 60 }),
        api.asistenciaReciente(1000),
      ]);

      vistaPorEstudiante = desdeVistaAsistencia(resVista.datos ?? []);
      sesiones = resSesiones.datos ?? [];
      const asistencia = resAsistencia.datos ?? [];

      if (!enPantalla) return;
      pintarHistorial(asistencia);
    } catch (error) {
      if (!enPantalla) return;
      contenedorHistorial.removeAttribute('aria-busy');
      reemplazar(contenedorHistorial, estadoVacio({
        titulo: 'No se pudo cargar el historial',
        texto: mensajeDeError(error),
        iconoNombre: 'asistencia',
        accion: crear('button', {
          clase: 'boton boton--primario', type: 'button', texto: 'Reintentar', onclick: cargarHistorial,
        }),
      }));
    }
  }

  function pintarHistorial(asistencia) {
    reemplazar(contenedorHistorial);
    contenedorHistorial.removeAttribute('aria-busy');

    if (sesiones.length === 0) {
      contenedorHistorial.append(estadoVacio({
        titulo: 'Todavía no hay clases registradas',
        texto: 'Cuando tomes la primera asistencia, aquí verás los porcentajes por estudiante y por mes.',
        iconoNombre: 'asistencia',
      }));
      return;
    }

    // ---- Porcentaje del mes elegido ----
    const delMes = asistencia.filter((r) => String(r.sesiones?.fecha ?? '').startsWith(mesHistorial));
    const porMes = agruparPorMes(delMes);
    const resumenMes = porMes.get(mesHistorial) ?? null;
    const clasesDelMes = new Set(delMes.map((r) => r.sesion_id)).size;

    // ---- Porcentaje por estudiante (en el mes elegido) ----
    const porEstudianteDelMes = new Map();
    delMes.forEach((registro) => {
      const id = Number(registro.estudiante_id);
      if (!porEstudianteDelMes.has(id)) porEstudianteDelMes.set(id, []);
      porEstudianteDelMes.get(id).push(registro);
    });

    const totalSinDatos = vistaPorEstudiante.filter((f) => f.registros === 0).length;

    contenedorHistorial.append(
      /* ---- Resumen del mes ---- */
      crear('div', { clase: 'rejilla rejilla--2', estilo: 'margin-bottom:var(--e-4)' }, [
        crear('section', { clase: 'tarjeta tarjeta--studs' }, [
          crear('h2', { texto: `Resumen de ${nombreMes(mesHistorial)}` }),
          resumenMes
            ? crear('div', {}, [
              crear('div', { estilo: 'display:flex;align-items:baseline;gap:var(--e-2);margin-bottom:var(--e-3)' }, [
                crear('span', {
                  clase: 'kpi__valor',
                  texto: resumenMes.porcentaje === null ? '—' : `${resumenMes.porcentaje} %`,
                }),
                crear('span', { clase: 'campo__ayuda', texto: 'de asistencia' }),
              ]),
              crear('div', { clase: 'utilidades' }, [
                insignia('presente', `${resumenMes.presentes} presentes`),
                insignia('tarde', `${contarPorEstado(delMes, 'tarde')} tarde`),
                insignia('justificado', `${contarPorEstado(delMes, 'justificado')} justificados`),
                insignia('ausente', `${resumenMes.ausencias} ausencias`),
              ]),
              crear('p', { clase: 'campo__ayuda', estilo: 'margin-top:var(--e-3)', texto: `Se registraron ${plural(clasesDelMes, 'clase', 'clases')} en este mes.` }),
            ])
            : estadoVacio({
              titulo: 'Sin clases este mes',
              texto: 'Elige otro mes o toma la asistencia de una clase.',
              iconoNombre: 'asistencia',
            }),
        ]),

        crear('section', { clase: 'tarjeta tarjeta--studs' }, [
          crear('h2', { texto: 'Clases registradas' }),
          crear('div', { estilo: 'max-height:320px;overflow-y:auto' }, sesiones.map((clase) => {
            const registrosDeLaClase = asistencia.filter((r) => Number(r.sesion_id) === Number(clase.id));
            const porcentaje = calcularPorcentaje(registrosDeLaClase);
            return crear('button', {
              clase: 'boton boton--fantasma',
              type: 'button',
              estilo: 'width:100%;justify-content:space-between;margin-bottom:var(--e-2)',
              onclick: () => {
                fecha = clase.fecha;
                selectorFecha.value = clase.fecha;
                cambiosSinGuardar = false;
                cambiarPestana('tomar');
                cargar();
              },
            }, [
              crear('span', { texto: fechaMedia(clase.fecha) }),
              crear('span', { estilo: 'display:flex;gap:.5rem;align-items:center' }, [
                porcentaje === null ? crear('span', { clase: 'campo__ayuda', texto: 'sin datos' }) : porcentajeAsistencia(porcentaje),
                clase.estado === 'cerrada' ? insignia('no_participa', 'Cerrada') : null,
              ]),
            ]);
          })),
        ]),
      ]),

      /* ---- Por estudiante ---- */
      crear('section', { clase: 'tarjeta tarjeta--studs' }, [
        crear('div', { clase: 'tarjeta__titulo' }, [
          crear('h2', { texto: 'Asistencia por estudiante' }),
          crear('span', {
            clase: 'campo__ayuda',
            texto: totalSinDatos
              ? `${totalSinDatos} estudiante(s) todavía sin clases registradas`
              : '',
          }),
        ]),
        tabla({
          titulo: 'Porcentaje de asistencia de cada estudiante',
          filas: vistaPorEstudiante.sort((a, b) => {
            const pa = a.porcentaje ?? -1;
            const pb = b.porcentaje ?? -1;
            if (pa !== pb) return pb - pa;
            return a.nombre.localeCompare(b.nombre, 'es');
          }),
          columnas: [
            {
              clave: 'nombre',
              etiqueta: 'Estudiante',
              celda: (fila) => crear('span', { estilo: 'display:flex;align-items:center;gap:.5rem' }, [
                crear('strong', { texto: fila.nombre }),
                fila.activo === false ? insignia('no_participa', 'De baja') : null,
              ]),
            },
            {
              clave: 'porcentaje',
              etiqueta: 'Asistencia (histórico)',
              alinear: 'centro',
              celda: (fila) => porcentajeAsistencia(fila.porcentaje),
            },
            {
              clave: 'mes',
              etiqueta: `En ${nombreMes(mesHistorial)}`,
              alinear: 'centro',
              celda: (fila) => porcentajeAsistencia(
                calcularPorcentaje(porEstudianteDelMes.get(fila.estudianteId) ?? []),
              ),
            },
            { clave: 'presentes', etiqueta: 'Presentes', alinear: 'derecha', numeros: true },
            { clave: 'tardes', etiqueta: 'Tarde', alinear: 'derecha', numeros: true },
            { clave: 'justificados', etiqueta: 'Justif.', alinear: 'derecha', numeros: true },
            { clave: 'ausencias', etiqueta: 'Ausencias', alinear: 'derecha', numeros: true },
            {
              clave: 'racha',
              etiqueta: 'Racha',
              alinear: 'centro',
              numeros: true,
              celda: (fila) => {
                const deEste = asistencia
                  .filter((r) => Number(r.estudiante_id) === fila.estudianteId)
                  .map((r) => ({ estado: r.estado, sesiones: r.sesiones }));
                const racha = calcularRacha(deEste);
                return racha > 1
                  ? crear('span', { estilo: 'color:var(--verde);font-weight:700', texto: `${racha} 🔥` })
                  : crear('span', { clase: 'campo__ayuda', texto: String(racha) });
              },
            },
          ],
          vacio: estadoVacio({ titulo: 'Sin estudiantes', texto: 'Agrega estudiantes al club.' }),
        }),
      ]),
    );
  }

  function contarPorEstado(registros, estado) {
    return registros.filter((r) => r.estado === estado).length;
  }

  function exportarHistorial() {
    if (vistaPorEstudiante.length === 0) {
      avisoError('Todavía no hay datos para descargar.');
      return;
    }
    const filas = vistaPorEstudiante.map((f) => ({
      estudiante: f.nombre,
      activo: f.activo ? 'sí' : 'no',
      clases_registradas: f.registros,
      presentes: f.presentes,
      tarde: f.tardes,
      justificados: f.justificados,
      ausencias: f.ausencias,
      porcentaje: f.porcentaje ?? '',
    }));
    descargar(
      `asistencia-${mesHistorial}.csv`,
      aCsv(filas, ['estudiante', 'activo', 'clases_registradas', 'presentes', 'tarde', 'justificados', 'ausencias', 'porcentaje']),
      'text/csv',
    );
    avisoOk('Archivo CSV descargado. Se abre con Excel.');
  }

  /* ---------------- arranque ---------------- */

  llenarMeses();
  await cargar();

  return {
    destruir() { enPantalla = false; },
  };
}
